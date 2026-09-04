import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { contentTags, uniqueContentTags } from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel.js'
import {
  recordAssetRecoveryArtifactHandler,
  storeVerifiedAssetRecoveryArchive,
  type StoredAssetRecoveryArchive,
} from '../assetRecovery.js'
import {
  assertCurrentAssetMatchesRecoveryVerification,
  readAssetRecoverySource,
} from '../assetRecovery/verification.js'
import type { CmsMemberAppIdentity } from '../auth/appIdentity.js'
import { canManageAssets } from '../auth/checks.js'
import {
  readAssetReferenceProofStatus,
  type AssetReferenceProofStatus,
} from '../entries/assetReferenceProof.js'
import { throwCmsError } from '../errors.js'
import { requireCms, requireCmsContractWriteToken, resolveCmsAppIdentity } from '../functions.js'
import { logActivity } from '../lib/activity.js'
import {
  assertCmsContractWriteToken,
  cmsContractWriteTokenValidator,
  type CmsContractWriteToken,
} from '../lib/installedContract.js'
import { enqueueRevalidationEvent } from '../lib/revalidationOutbox.js'
import type { MutationCtx } from '../lib/types.js'
import {
  blockedPreview,
  buildPreview,
  defineCmsOperation,
  executeDestructiveOperation,
  hashValue,
  operationEffect,
  operationExecuteResultValidator,
  operationIssue,
  previewResultValidator,
  type OperationExecuteResult,
} from '../operationHelpers.js'
import { assertStorageOutsidePortableExportHold } from '../portability/lease.js'
import { scheduleRevalidationOutboxDelivery } from '../revalidation.js'
import {
  assertCompatibleReplacement,
  assertVerifiedFactsMatch,
  readVerifiedAssetReplacementSessionRef,
  requiredReplacementFacts,
  verifyReplacementBlob,
  type ProtectedActionCtx,
} from './replacementUpload.js'
import { assetDiscoveryFields } from './scope.js'
import { isStorageClaimedByAnotherOwner } from './storageOwnership.js'

export {
  readVerifiedAssetReplacementSessionHandler,
  stagedReplacementValidator,
  stageVerifiedAssetReplacementArgs,
  stageVerifiedAssetReplacementHandler,
  verifiedReplacementSessionValidator,
  verifyAssetReplacementUploadHandler,
} from './replacementUpload.js'

type ReplacementPublicRow = {
  sourceId: string
  row: Doc<'publicEntries'> | null
}

type ReplacementOperationLoaded = {
  appIdentity: CmsMemberAppIdentity
  asset: Doc<'assets'> | null
  session: Doc<'assetUploadSessions'> | null
  refs: Doc<'contentAssetRefs'>[]
  publicRows: ReplacementPublicRow[]
  referenceProof: AssetReferenceProofStatus
}

const replacementArgs = {
  assetId: v.string(),
  sessionId: v.string(),
}

const replacementRecoveryValidator = v.object({
  artifactId: v.string(),
  assetId: v.string(),
  collection: v.union(v.string(), v.null()),
  entryId: v.union(v.string(), v.null()),
  checksum: v.string(),
  storageRef: v.id('_storage'),
  byteSize: v.number(),
  bytesSha256: v.string(),
  assetFactsHash: v.string(),
  assetUpdatedAt: v.number(),
  createdAt: v.number(),
})

export const executeVerifiedAssetReplacementArgs = {
  contractWriteToken: cmsContractWriteTokenValidator,
  ...replacementArgs,
  userId: v.string(),
  confirmationToken: v.optional(v.string()),
  recovery: v.optional(replacementRecoveryValidator),
}

export const assetReplacementResultValidator = v.object({
  assetId: v.string(),
  recoveryArtifactId: v.string(),
  publicEntriesUpdated: v.number(),
  revalidationQueued: v.boolean(),
})

const executeVerifiedAssetReplacementRef = makeFunctionReference<
  'mutation',
  {
    contractWriteToken: CmsContractWriteToken
    assetId: string
    sessionId: string
    userId: string
    confirmationToken?: string
    recovery?: StoredAssetRecoveryArchive
  },
  OperationExecuteResult<typeof assetReplacementResultValidator.type>
>('assets:executeVerifiedAssetReplacement')
const cleanupAssetStorageRef = makeFunctionReference<
  'action',
  {
    taskId: Id<'assetCleanupTasks'>
    storageId: Id<'_storage'>
    generation: number
    attempt: number
  },
  null
>('assets:cleanupAssetStorage')

export const replaceAssetOperation = defineCmsOperation({
  id: 'ginko-cms.replace-asset',
  kind: 'destructive',
  executeFunctionRef: 'assets:replaceAsset',
  args: replacementArgs,
  guard: canManageAssets,
  returns: assetReplacementResultValidator,
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    const asset = assetId ? await ctx.db.get(assetId) : null
    const session = await ctx.db
      .query('assetUploadSessions')
      .withIndex('by_session', (query) => query.eq('sessionId', args.sessionId))
      .unique()
    const refs = asset
      ? await ctx.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (query) => query.eq('assetId', args.assetId))
          .collect()
      : []
    const publicSources = [
      ...new Map(
        refs
          .filter((ref) => ref.sourceKind === 'public')
          .map((ref) => [ref.sourceId, ref] as const),
      ).values(),
    ].sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    const publicRows: ReplacementPublicRow[] = await Promise.all(
      publicSources.map(async (source) => {
        const row = source.locale
          ? await ctx.db
              .query('publicEntries')
              .withIndex('by_entry_locale', (query) =>
                query.eq('entryId', source.entryId).eq('locale', source.locale!),
              )
              .unique()
          : null
        return { sourceId: source.sourceId, row }
      }),
    )
    return {
      appIdentity,
      asset,
      session,
      refs,
      publicRows,
      referenceProof: await readAssetReferenceProofStatus(ctx, args.assetId),
    }
  },
  preview: async (ctx, args, loaded: ReplacementOperationLoaded) => {
    const { asset, session, refs, publicRows, referenceProof, appIdentity } = loaded
    const confirm = { operationId: 'ginko-cms.replace-asset', args }
    if (!asset || asset.deletedAt != null) {
      return blockedPreview({
        summary: 'The active asset to replace was not found.',
        blockers: [operationIssue({ code: 'asset-not-found', message: 'Asset not found.' })],
        confirm,
      })
    }
    if (!session || session.ownerId !== appIdentity.userId) {
      return blockedPreview({
        summary: 'The verified replacement upload was not found.',
        blockers: [
          operationIssue({
            code: 'asset-replacement-session-not-found',
            message: 'Select and verify the replacement file again.',
          }),
        ],
        confirm,
      })
    }
    if (session.expiresAt <= Date.now()) {
      return blockedPreview({
        summary: 'The verified replacement upload expired.',
        blockers: [
          operationIssue({
            code: 'asset-replacement-session-expired',
            message: 'Select and verify the replacement file again.',
          }),
        ],
        confirm,
      })
    }
    const replacement = requiredReplacementFacts(session)
    if (replacement.assetId !== asset._id) {
      return blockedPreview({
        summary: 'The verified upload belongs to a different asset.',
        blockers: [
          operationIssue({
            code: 'asset-replacement-target-mismatch',
            message: 'Select and verify the replacement file again.',
          }),
        ],
        confirm,
      })
    }
    assertCompatibleReplacement(asset, replacement)
    await assertStorageOutsidePortableExportHold(ctx, asset.storageId)
    if (await isStorageClaimedByAnotherOwner(ctx, asset.storageId, { assetId: asset._id })) {
      throwCmsError('ASSET_STORAGE_SHARED', 'The current asset storage has an ownership conflict.')
    }
    if (
      await isStorageClaimedByAnotherOwner(ctx, replacement.storageId, {
        uploadSessionId: session._id,
      })
    ) {
      throwCmsError('ASSET_UPLOAD_STORAGE_ALREADY_CLAIMED', 'Uploaded storage is already claimed.')
    }
    if (!referenceProof.current) {
      return blockedPreview({
        summary: `Cannot prove the full impact of replacing "${asset.filename}".`,
        blockers: [
          operationIssue({
            code: 'asset-reference-verification-required',
            message: 'Run the complete projection/reference repair before replacing this asset.',
          }),
        ],
        details: {
          assetId: args.assetId,
          canonicalGeneration: referenceProof.canonicalGeneration,
          verifiedRunId: referenceProof.verifiedRunId,
        },
        confirm,
        version: {
          assetUpdatedAt: asset.updatedAt ?? asset.createdAt,
          sessionGeneration: session.generation,
          referenceCanonicalGeneration: referenceProof.canonicalGeneration,
          referenceVerifiedRunId: referenceProof.verifiedRunId,
        },
      })
    }
    const derivedReferenced = refs.length > 0
    if (referenceProof.referenced !== derivedReferenced) {
      return blockedPreview({
        summary: 'Asset reference evidence is inconsistent.',
        blockers: [
          operationIssue({
            code: 'asset-reference-proof-inconsistent',
            message: 'Run projection/reference repair again before replacing this asset.',
          }),
        ],
        confirm,
      })
    }
    const invalidPublicRows = publicRows.filter(({ row }) => {
      if (!row) return true
      return !row.assetFacts.some((fact) => fact.assetId === args.assetId)
    })
    if (invalidPublicRows.length > 0) {
      return blockedPreview({
        summary: 'Published asset projections are incomplete.',
        blockers: [
          operationIssue({
            code: 'asset-public-projection-repair-required',
            message: 'Run projection/reference repair before replacing this asset.',
          }),
        ],
        details: { invalidPublicSourceIds: invalidPublicRows.map((item) => item.sourceId) },
        confirm,
      })
    }
    const usageCounts = {
      draft: refs.filter((ref) => ref.sourceKind === 'draft').length,
      revision: refs.filter((ref) => ref.sourceKind === 'revision').length,
      public: refs.filter((ref) => ref.sourceKind === 'public').length,
      publishedEntries: publicRows.length,
    }
    const publicImpactHash = await hashValue(
      publicRows.map(({ sourceId, row }) => ({
        sourceId,
        revisionId: row ? String(row.revisionId) : null,
        assetFacts: row?.assetFacts
          .filter((fact) => fact.assetId === args.assetId)
          .map((fact) => ({ fieldPath: fact.fieldPath, sha256: fact.sha256 }))
          .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath)),
      })),
    )
    const referenced = refs.length > 0
    return buildPreview({
      summary: `Will replace the bytes behind "${asset.filename}" without changing its asset id.`,
      warnings: [
        ...(referenced
          ? [
              operationIssue({
                code: 'stable-references-retained',
                message: `${refs.length} content reference${refs.length === 1 ? '' : 's'} will keep the same asset id.`,
              }),
            ]
          : []),
        ...(publicRows.length
          ? [
              operationIssue({
                code: 'published-asset-refresh',
                message: `${publicRows.length} published entr${publicRows.length === 1 ? 'y' : 'ies'} will receive the verified file and a transactional revalidation event.`,
              }),
            ]
          : []),
        operationIssue({
          code: 'replacement-recovery-retained',
          message:
            'The current bytes will be retained in a verified recovery artifact before the switch.',
        }),
      ],
      effects: [
        operationEffect({ kind: 'assets', summary: 'Stable asset updated', count: 1 }),
        operationEffect({
          kind: 'public-entries',
          summary: 'Published asset facts refreshed',
          count: publicRows.length,
        }),
      ],
      details: {
        assetId: args.assetId,
        stableReference: true,
        metadata: {
          filename: asset.filename,
          alt: asset.alt ?? null,
          caption: asset.caption ?? null,
          tags: asset.tags ?? [],
          behavior: 'preserved',
        },
        current: {
          mimeType: asset.mimeType,
          size: asset.size,
          sha256: asset.sha256,
          width: asset.width,
          height: asset.height,
          frames: asset.frames,
        },
        replacement: {
          filename: replacement.filename,
          mimeType: replacement.mimeType,
          size: replacement.size,
          sha256: replacement.sha256,
          width: replacement.width,
          height: replacement.height,
          frames: replacement.frames,
        },
        usageCounts,
        recoveryArtifactId: replacement.recoveryArtifactId,
        publicFreshness:
          publicRows.length > 0
            ? 'Published asset facts and cache tag are updated in the confirmed transaction.'
            : 'No published page references this asset.',
      },
      confirm: {
        ...confirm,
        effect: {
          assetId: args.assetId,
          replacementSha256: replacement.sha256,
          publicEntries: publicRows.length,
        },
      },
      version: {
        assetStorageId: String(asset.storageId),
        assetSha256: asset.sha256,
        assetUpdatedAt: asset.updatedAt ?? asset.createdAt,
        sessionGeneration: session.generation,
        sessionStorageId: String(replacement.storageId),
        sessionSha256: replacement.sha256,
        sessionExpiresAt: session.expiresAt,
        recoveryArtifactId: replacement.recoveryArtifactId,
        referenceCanonicalGeneration: referenceProof.canonicalGeneration,
        referenceVerifiedRunId: referenceProof.verifiedRunId,
        publicImpactHash,
      },
    })
  },
  handler: async (ctx, args, loaded: ReplacementOperationLoaded) => {
    const { asset, session, publicRows } = loaded
    if (!asset || !session) {
      throwCmsError('ASSET_REPLACEMENT_STALE', 'Asset replacement state is no longer available.')
    }
    const appIdentity = await ctx.appIdentity()
    const replacement = requiredReplacementFacts(session)
    const newUrl = await ctx.storage.getUrl(replacement.storageId)
    if (!newUrl) {
      throwCmsError('ASSET_STORAGE_MISSING', 'Replacement storage URL is unavailable.')
    }
    const parsedUrl = new URL(newUrl)
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
      throwCmsError('PUBLIC_ASSET_URL_INVALID', 'Replacement asset URL is not safe for public use.')
    }
    const now = Date.now()
    for (const { row } of publicRows) {
      if (!row) throw new Error('Published asset projection disappeared during replacement.')
      await ctx.db.patch(row._id, {
        assetFacts: row.assetFacts.map((fact) =>
          fact.assetId === args.assetId
            ? {
                ...fact,
                url: newUrl,
                mediaType: replacement.mimeType,
                bytes: replacement.size,
                sha256: replacement.sha256,
              }
            : fact,
        ),
      })
    }
    const oldStorageId = asset.storageId
    await ctx.db.patch(asset._id, {
      storageId: replacement.storageId,
      mimeType: replacement.mimeType,
      size: replacement.size,
      sha256: replacement.sha256,
      width: replacement.width,
      height: replacement.height,
      frames: replacement.frames,
      updatedBy: appIdentity.userId,
      updatedAt: now,
      ...assetDiscoveryFields({
        filename: asset.filename,
        mimeType: replacement.mimeType,
        tags: asset.tags ?? [],
        createdAt: asset.createdAt,
        updatedAt: now,
        deletedAt: asset.deletedAt,
      }),
    })
    await ctx.db.patch(session._id, {
      state: 'finalized',
      generation: session.generation + 1,
      storageId: undefined,
      assetId: asset._id,
      finalizedAt: now,
    })
    const cleanupTaskId = await ctx.db.insert('assetCleanupTasks', {
      storageId: oldStorageId,
      status: 'cleanup-required',
      generation: 1,
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, cleanupAssetStorageRef, {
      taskId: cleanupTaskId,
      storageId: oldStorageId,
      generation: 1,
      attempt: 1,
    })
    const revalidation =
      publicRows.length > 0
        ? await enqueueRevalidationEvent(ctx, {
            idempotencyKey: `asset-replacement:${args.assetId}:${session.sessionId}`,
            versionId: `asset:${args.assetId}:${replacement.sha256}`,
            tags: uniqueContentTags([contentTags.asset(args.assetId)]),
            paths: [],
            payload: {
              reason: 'asset-replaced',
              assetId: args.assetId,
              sha256: replacement.sha256,
              recoveryArtifactId: replacement.recoveryArtifactId,
              publicEntriesUpdated: publicRows.length,
              appIdentityId: appIdentity.userId,
            },
            now,
          })
        : null
    if (revalidation?.inserted) await scheduleRevalidationOutboxDelivery(ctx)
    await logActivity(ctx, {
      kind: 'asset.replaced',
      summary: `Replaced asset bytes for "${asset.filename}"`,
      appIdentityId: appIdentity.userId,
      entryId: asset.entryId ?? null,
      collection: asset.collection ?? null,
      detail: {
        assetId: args.assetId,
        sessionId: session.sessionId,
        previousSha256: asset.sha256,
        replacementSha256: replacement.sha256,
        recoveryArtifactId: replacement.recoveryArtifactId,
        referencesPreserved: loaded.refs.length,
        publicEntriesUpdated: publicRows.length,
        metadataPreserved: true,
      },
      createdAt: now,
    })
    return {
      assetId: args.assetId,
      recoveryArtifactId: replacement.recoveryArtifactId,
      publicEntriesUpdated: publicRows.length,
      revalidationQueued: revalidation?.inserted ?? false,
    }
  },
})

export async function executeVerifiedAssetReplacementHandler(
  ctx: MutationCtx,
  args: {
    contractWriteToken: CmsContractWriteToken
    assetId: string
    sessionId: string
    userId: string
    confirmationToken?: string
    recovery?: StoredAssetRecoveryArchive
  },
) {
  await assertCmsContractWriteToken(ctx, args.contractWriteToken)
  const caller = cmsUserCaller(args.userId)
  const authorized = requireCms(await resolveCmsAppIdentity(ctx, caller), canManageAssets)
  if (authorized.kind !== 'member') throw new Error('Asset replacement requires a CMS member.')
  const operationCtx = Object.assign(ctx, {
    cmsCaller: async () => caller,
    appIdentity: async () => authorized,
  })
  const operationArgs = { assetId: args.assetId, sessionId: args.sessionId }
  return await executeDestructiveOperation(
    operationCtx,
    replaceAssetOperation,
    operationArgs,
    args.confirmationToken,
    {
      beforeHandler: async () => {
        const recovery = args.recovery
        if (!recovery) {
          throwCmsError(
            'ASSET_REPLACEMENT_RECOVERY_REQUIRED',
            'Verified recovery bytes are required before replacing the asset.',
          )
        }
        const session = await ctx.db
          .query('assetUploadSessions')
          .withIndex('by_session', (query) => query.eq('sessionId', args.sessionId))
          .unique()
        if (!session || session.ownerId !== args.userId) {
          throwCmsError('ASSET_REPLACEMENT_SESSION_STALE', 'Asset replacement session changed.')
        }
        const replacement = requiredReplacementFacts(session)
        if (
          String(replacement.assetId) !== args.assetId ||
          replacement.recoveryArtifactId !== recovery.artifactId ||
          recovery.assetId !== args.assetId
        ) {
          throwCmsError('ASSET_REPLACEMENT_RECOVERY_MISMATCH', 'Recovery scope changed.')
        }
        await assertCurrentAssetMatchesRecoveryVerification(ctx, {
          artifactId: recovery.artifactId,
          assetId: recovery.assetId,
          generation: 1,
          checksum: recovery.checksum,
          storageRef: recovery.storageRef,
          assetFactsHash: recovery.assetFactsHash,
          assetUpdatedAt: recovery.assetUpdatedAt,
        })
        const { createdAt, ...record } = recovery
        await recordAssetRecoveryArtifactHandler(ctx, {
          contractWriteToken: args.contractWriteToken,
          ...record,
          appIdentityId: args.userId,
          now: createdAt,
        })
        return undefined
      },
    },
  )
}

export async function replaceAssetHandler(
  ctx: ProtectedActionCtx,
  args: { assetId: string; sessionId: string; _confirmationToken?: string },
) {
  const appIdentity = await ctx.appIdentity()
  const contractWriteToken = requireCmsContractWriteToken(ctx)
  if (!args._confirmationToken) {
    return await ctx.runMutation(executeVerifiedAssetReplacementRef, {
      contractWriteToken,
      assetId: args.assetId,
      sessionId: args.sessionId,
      userId: appIdentity.userId,
    })
  }
  const session = await ctx.runQuery(readVerifiedAssetReplacementSessionRef, {
    assetId: args.assetId,
    sessionId: args.sessionId,
    ownerId: appIdentity.userId,
  })
  const verified = await verifyReplacementBlob(ctx, session.storageId)
  assertVerifiedFactsMatch(session, verified)
  const source = await readAssetRecoverySource(ctx, args.assetId)
  if (!source) throwCmsError('ASSET_NOT_FOUND', 'The asset to replace was not found.')
  const storedArchive = await storeVerifiedAssetRecoveryArchive(ctx, source)
  const recovery = { ...storedArchive, artifactId: session.recoveryArtifactId }
  try {
    const result = await ctx.runMutation(executeVerifiedAssetReplacementRef, {
      contractWriteToken,
      assetId: args.assetId,
      sessionId: args.sessionId,
      userId: appIdentity.userId,
      confirmationToken: args._confirmationToken,
      recovery,
    })
    if (result.status !== 'applied') await ctx.storage.delete(recovery.storageRef)
    return result
  } catch (error) {
    await ctx.storage.delete(recovery.storageRef)
    throw error
  }
}

export const replacementExecuteResultValidator = operationExecuteResultValidator(
  assetReplacementResultValidator,
)
