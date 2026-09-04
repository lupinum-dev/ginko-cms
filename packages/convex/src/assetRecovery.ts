import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import { type ActionCtx, internalMutation, internalQuery } from './_generated/server.js'
import {
  type AssetSnapshot,
  type AssetRecoveryArchive,
  MAX_ASSET_BYTES,
  MAX_ARCHIVE_BYTES,
  RECOVERY_FORMAT,
  RECOVERY_VERSION,
  assetSnapshot,
  assetSnapshotValidator,
  byteLength,
  bytesToBase64,
  canonicalJson,
  sha256Bytes,
  sha256Text,
} from './assetRecovery/archive.js'
import {
  assertAssetRecoveryArtifactCoversPurge,
  loadVerifiedArchive,
  readAssetRecoverySource,
} from './assetRecovery/verification.js'
import { assetDiscoveryFields } from './assets/scope.js'
import { isStorageClaimedByAnotherOwner } from './assets/storageOwnership.js'
import { canManageAssetRecovery } from './auth/checks.js'
import { throwCmsError } from './errors.js'
import {
  callerAction,
  callerMutation,
  requireCms,
  requireCmsContractWriteToken,
  resolveCmsAppIdentity,
} from './functions.js'
import { logActivity } from './lib/activity.js'
import { getCollection } from './lib/collections.js'
import {
  assertCmsContractWriteToken,
  cmsContractWriteTokenValidator,
  type CmsContractWriteToken,
} from './lib/installedContract.js'
import type { MutationCtx } from './lib/types.js'
import {
  buildPreview,
  defineCmsOperation,
  definePreview,
  operationIssue,
  previewResultValidator,
} from './operationHelpers.js'

export { decodeAssetRecoveryArchive } from './assetRecovery/archive.js'
export type { AssetRecoveryArchive } from './assetRecovery/archive.js'
export {
  assertAssetRecoveryArtifactCoversPurge,
  assertCurrentAssetMatchesRecoveryVerification,
  verifyAssetRecoveryForPurge,
} from './assetRecovery/verification.js'
export type { AssetRecoveryPurgeVerification } from './assetRecovery/verification.js'

/**
 * Ginko's application-level recovery artifact is intentionally asset-only.
 * Database disaster recovery is owned by Convex snapshots; content portability
 * is owned by the portability CLI. Keeping those concerns out of this module
 * prevents an unverifiable second database restore path.
 */
export type RecordAssetRecoveryArtifactArgs = {
  contractWriteToken: CmsContractWriteToken
  artifactId: string
  assetId: string
  collection: string | null
  entryId: string | null
  checksum: string
  storageRef: Id<'_storage'>
  byteSize: number
  bytesSha256: string
  assetFactsHash: string
  assetUpdatedAt: number
  appIdentityId: string
  now: number
}

type RecordAssetRecoveryArtifactMutationArgs = Omit<
  RecordAssetRecoveryArtifactArgs,
  'appIdentityId'
> & {
  userId: string
}

const recordAssetRecoveryArtifactRef = makeFunctionReference<
  'mutation',
  RecordAssetRecoveryArtifactMutationArgs,
  null
>('assetRecovery:recordAssetRecoveryArtifact')
const restoreAssetFromRecoveryRef = makeFunctionReference<
  'mutation',
  {
    contractWriteToken: CmsContractWriteToken
    artifactId: string
    asset: AssetSnapshot
    restoredStorageRef: Id<'_storage'>
    userId: string
    now: number
  },
  { assetId: string; originalAssetId: string }
>('assetRecovery:restoreAssetFromRecovery')

const assetRecoveryArtifactValidator = v.union(
  v.object({
    _id: v.string(),
    _creationTime: v.number(),
    artifactId: v.string(),
    assetId: v.string(),
    collection: v.union(v.string(), v.null()),
    entryId: v.union(v.string(), v.null()),
    checksum: v.string(),
    storageRef: v.id('_storage'),
    generation: v.number(),
    byteSize: v.number(),
    bytesSha256: v.string(),
    assetFactsHash: v.string(),
    assetUpdatedAt: v.number(),
    purgeFenceTokenHash: v.optional(v.string()),
    purgeFenceIssuedTo: v.optional(v.string()),
    purgeFenceExpiresAt: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
  }),
  v.null(),
)

const restorePreviewValidator = v.object({
  artifactId: v.string(),
  checksum: v.string(),
  applySupported: v.boolean(),
  blockers: v.array(v.object({ code: v.string(), message: v.string() })),
  warnings: v.array(v.object({ code: v.string(), message: v.string() })),
})

async function requireCurrentAssetRecoveryManager(ctx: MutationCtx, userId: string) {
  const identity = requireCms(
    await resolveCmsAppIdentity(ctx, cmsUserCaller(userId)),
    canManageAssetRecovery,
  )
  if (identity.kind !== 'member') {
    throw new Error('Asset recovery requires a current CMS member.')
  }
  return identity
}

export const readAssetForRecovery = internalQuery({
  args: { assetId: v.string() },
  returns: v.union(
    v.object({ storageId: v.id('_storage'), snapshot: assetSnapshotValidator }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    const asset = assetId ? await ctx.db.get(assetId) : null
    return asset ? { storageId: asset.storageId, snapshot: assetSnapshot(asset) } : null
  },
})

export const getAssetRecoveryArtifact = internalQuery({
  args: { artifactId: v.string() },
  returns: assetRecoveryArtifactValidator,
  handler: async (ctx, args) => {
    return await ctx.db
      .query('assetRecoveryArtifacts')
      .withIndex('by_artifact', (query) => query.eq('artifactId', args.artifactId))
      .first()
  },
})

export async function recordAssetRecoveryArtifactHandler(
  ctx: MutationCtx,
  args: RecordAssetRecoveryArtifactArgs,
) {
  await assertCmsContractWriteToken(ctx, args.contractWriteToken)
  const existing = await ctx.db
    .query('assetRecoveryArtifacts')
    .withIndex('by_artifact', (query) => query.eq('artifactId', args.artifactId))
    .unique()
  if (existing) {
    throwCmsError('ASSET_RECOVERY_ARTIFACT_EXISTS', 'Recovery artifact id is already in use.', {
      artifactId: args.artifactId,
    })
  }
  const entryId = args.entryId ? ctx.db.normalizeId('entries', args.entryId) : null
  if (args.entryId && !entryId) {
    throwCmsError('ASSET_RECOVERY_ENTRY_INVALID', 'Recovery artifact entry id is invalid.')
  }
  if (await isStorageClaimedByAnotherOwner(ctx, args.storageRef)) {
    throwCmsError(
      'ASSET_STORAGE_ALREADY_CLAIMED',
      'Recovery artifact storage is already claimed by another CMS owner.',
    )
  }
  await ctx.db.insert('assetRecoveryArtifacts', {
    artifactId: args.artifactId,
    collection: args.collection,
    entryId,
    assetId: args.assetId,
    checksum: args.checksum,
    storageRef: args.storageRef,
    generation: 1,
    byteSize: args.byteSize,
    bytesSha256: args.bytesSha256,
    assetFactsHash: args.assetFactsHash,
    assetUpdatedAt: args.assetUpdatedAt,
    createdBy: args.appIdentityId,
    createdAt: args.now,
  })
  await logActivity(ctx, {
    kind: 'asset.recovery-exported',
    summary: 'Created verified asset recovery artifact',
    appIdentityId: args.appIdentityId,
    collection: args.collection,
    entryId,
    detail: { artifactId: args.artifactId, assetId: args.assetId },
    createdAt: args.now,
  })
  return null
}

export const recordAssetRecoveryArtifact = internalMutation({
  args: {
    contractWriteToken: cmsContractWriteTokenValidator,
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
    userId: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, ...record } = args
    const appIdentity = await requireCurrentAssetRecoveryManager(ctx, userId)
    return await recordAssetRecoveryArtifactHandler(ctx, {
      ...record,
      appIdentityId: appIdentity.userId,
    })
  },
})

export const restoreAssetFromRecovery = internalMutation({
  args: {
    contractWriteToken: cmsContractWriteTokenValidator,
    artifactId: v.string(),
    asset: assetSnapshotValidator,
    restoredStorageRef: v.id('_storage'),
    userId: v.string(),
    now: v.number(),
  },
  returns: v.object({ assetId: v.string(), originalAssetId: v.string() }),
  handler: async (ctx, args) => {
    await assertCmsContractWriteToken(ctx, args.contractWriteToken)
    const appIdentity = await requireCurrentAssetRecoveryManager(ctx, args.userId)
    const originalId = ctx.db.normalizeId('assets', args.asset.originalAssetId)
    if (originalId && (await ctx.db.get(originalId))) {
      throwCmsError('ASSET_RECOVERY_RESTORE_TARGET_EXISTS', 'The original asset still exists.', {
        artifactId: args.artifactId,
        assetId: args.asset.originalAssetId,
      })
    }
    if (args.asset.collection && !(await getCollection(ctx, args.asset.collection))) {
      throwCmsError(
        'ASSET_RECOVERY_RESTORE_DANGLING_COLLECTION_ASSET',
        'The asset collection is absent from the installed contract.',
        { artifactId: args.artifactId, collection: args.asset.collection },
      )
    }
    const entryId = args.asset.entryId ? ctx.db.normalizeId('entries', args.asset.entryId) : null
    if (args.asset.entryId && !entryId) {
      throwCmsError('ASSET_RECOVERY_RESTORE_DANGLING_ENTRY_ASSET', 'The asset entry id is invalid.')
    }
    const entry = entryId ? await ctx.db.get(entryId) : null
    if (args.asset.scope === 'entry' && (!entry || entry.collection !== args.asset.collection)) {
      throwCmsError(
        'ASSET_RECOVERY_RESTORE_DANGLING_ENTRY_ASSET',
        'The entry-scoped asset owner is unavailable.',
        { artifactId: args.artifactId, entryId: args.asset.entryId },
      )
    }
    if (await isStorageClaimedByAnotherOwner(ctx, args.restoredStorageRef)) {
      throwCmsError(
        'ASSET_STORAGE_ALREADY_CLAIMED',
        'Restored asset storage is already claimed by another CMS owner.',
      )
    }
    const assetId = await ctx.db.insert('assets', {
      storageId: args.restoredStorageRef,
      filename: args.asset.filename,
      mimeType: args.asset.mimeType,
      size: args.asset.size,
      sha256: args.asset.sha256,
      width: args.asset.width,
      height: args.asset.height,
      frames: args.asset.frames,
      alt: args.asset.alt as Doc<'assets'>['alt'],
      caption: args.asset.caption as Doc<'assets'>['caption'],
      scope: args.asset.scope,
      entryId,
      collection: args.asset.collection,
      tags: args.asset.tags,
      createdBy: args.asset.createdBy,
      updatedBy: appIdentity.userId,
      createdAt: args.asset.createdAt,
      updatedAt: args.now,
      deletedAt: null,
      deletedBy: null,
      ...assetDiscoveryFields({
        filename: args.asset.filename,
        mimeType: args.asset.mimeType,
        tags: args.asset.tags,
        createdAt: args.asset.createdAt,
        updatedAt: args.now,
        deletedAt: null,
      }),
    })
    await logActivity(ctx, {
      kind: 'asset.recovered',
      summary: 'Restored asset bytes from verified recovery artifact',
      appIdentityId: appIdentity.userId,
      collection: args.asset.collection,
      entryId,
      detail: {
        artifactId: args.artifactId,
        originalAssetId: args.asset.originalAssetId,
        restoredAssetId: String(assetId),
      },
      createdAt: args.now,
    })
    return { assetId: String(assetId), originalAssetId: args.asset.originalAssetId }
  },
})

export type StoredAssetRecoveryArchive = {
  artifactId: string
  assetId: string
  collection: string | null
  entryId: string | null
  checksum: string
  storageRef: Id<'_storage'>
  byteSize: number
  bytesSha256: string
  assetFactsHash: string
  assetUpdatedAt: number
  createdAt: number
}

/**
 * Store and re-read one exact-byte recovery archive. The caller owns deleting
 * storageRef if the database transaction that claims it does not apply.
 */
export async function storeVerifiedAssetRecoveryArchive(
  ctx: ActionCtx,
  source: { storageId: Id<'_storage'>; snapshot: AssetSnapshot },
  createdAt = Date.now(),
): Promise<StoredAssetRecoveryArchive> {
  const blob = await ctx.storage.get(source.storageId)
  if (!blob) {
    throwCmsError('ASSET_STORAGE_MISSING', 'Asset storage bytes are missing.', {
      assetId: source.snapshot.originalAssetId,
    })
  }
  if (blob.size > MAX_ASSET_BYTES) {
    throwCmsError('ASSET_RECOVERY_SIZE_LIMIT_EXCEEDED', 'Asset exceeds the recovery byte limit.')
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const bytesSha256 = await sha256Bytes(bytes)
  if (bytes.byteLength !== source.snapshot.size || bytesSha256 !== source.snapshot.sha256) {
    throwCmsError('ASSET_RECOVERY_ASSET_FACTS_MISMATCH', 'Stored bytes do not match asset facts.', {
      assetId: source.snapshot.originalAssetId,
    })
  }
  const assetFactsHash = await sha256Text(canonicalJson(source.snapshot))
  const assetUpdatedAt = source.snapshot.updatedAt ?? source.snapshot.createdAt
  const archive: AssetRecoveryArchive = {
    format: RECOVERY_FORMAT,
    version: RECOVERY_VERSION,
    exportedAt: createdAt,
    asset: source.snapshot,
    manifest: {
      byteSize: bytes.byteLength,
      bytesSha256,
      assetSha256: assetFactsHash,
      assetUpdatedAt,
    },
    bytesBase64: bytesToBase64(bytes),
  }
  const archiveJson = canonicalJson(archive)
  if (byteLength(archiveJson) > MAX_ARCHIVE_BYTES) {
    throwCmsError('ASSET_RECOVERY_SIZE_LIMIT_EXCEEDED', 'Recovery artifact exceeds its byte limit.')
  }
  const checksum = await sha256Text(archiveJson)
  const storageRef = await ctx.storage.store(
    new Blob([archiveJson], { type: 'application/vnd.ginko-cms.asset-recovery+json' }),
  )
  const stored = await ctx.storage.get(storageRef)
  if (!stored || (await sha256Text(await stored.text())) !== checksum) {
    await ctx.storage.delete(storageRef)
    throwCmsError(
      'ASSET_RECOVERY_STORAGE_VERIFY_FAILED',
      'Stored recovery artifact failed verification.',
    )
  }
  return {
    artifactId: `asset_recovery_${createdAt}_${globalThis.crypto.randomUUID()}`,
    assetId: source.snapshot.originalAssetId,
    collection: source.snapshot.collection,
    entryId: source.snapshot.entryId,
    checksum,
    storageRef,
    byteSize: archive.manifest.byteSize,
    bytesSha256: archive.manifest.bytesSha256,
    assetFactsHash,
    assetUpdatedAt,
    createdAt,
  }
}

export const createAssetRecoveryArtifact = callerAction.protected({
  id: 'assetRecovery:createAssetRecoveryArtifact',
  args: { assetId: v.string() },
  guard: canManageAssetRecovery,
  returns: v.object({
    artifactId: v.string(),
    assetId: v.string(),
    checksum: v.string(),
    storageRef: v.string(),
  }),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const source = await readAssetRecoverySource(ctx, args.assetId)
    if (!source) throwCmsError('ASSET_NOT_FOUND', 'Asset not found.', { assetId: args.assetId })
    const archive = await storeVerifiedAssetRecoveryArchive(ctx, source)
    try {
      const { createdAt, ...record } = archive
      await ctx.runMutation(recordAssetRecoveryArtifactRef, {
        contractWriteToken: requireCmsContractWriteToken(ctx),
        ...record,
        userId: appIdentity.userId,
        now: createdAt,
      })
      return {
        artifactId: archive.artifactId,
        assetId: args.assetId,
        checksum: archive.checksum,
        storageRef: String(archive.storageRef),
      }
    } catch (error) {
      await ctx.storage.delete(archive.storageRef)
      throw error
    }
  },
})

export const verifyAssetRecoveryArtifact = callerAction.protected({
  id: 'assetRecovery:verifyAssetRecoveryArtifact',
  args: { artifactId: v.string() },
  guard: canManageAssetRecovery,
  returns: v.object({
    ok: v.boolean(),
    checksumMatches: v.boolean(),
    currentDataMatches: v.boolean(),
    artifactId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { archive } = await loadVerifiedArchive(ctx, args.artifactId)
    const current = await readAssetRecoverySource(ctx, archive.asset.originalAssetId)
    const currentDataMatches =
      current !== null && canonicalJson(current.snapshot) === canonicalJson(archive.asset)
    return {
      ok: currentDataMatches,
      checksumMatches: true,
      currentDataMatches,
      artifactId: args.artifactId,
    }
  },
})

export const downloadAssetRecoveryArtifact = callerAction.protected({
  id: 'assetRecovery:downloadAssetRecoveryArtifact',
  args: { artifactId: v.string() },
  guard: canManageAssetRecovery,
  returns: v.object({ artifactId: v.string(), checksum: v.string(), archiveJson: v.string() }),
  handler: async (ctx, args) => {
    const { artifact, archiveJson } = await loadVerifiedArchive(ctx, args.artifactId)
    return { artifactId: artifact.artifactId, checksum: artifact.checksum, archiveJson }
  },
})

async function assetRestoreBlockers(
  ctx: ActionCtx,
  artifactId: string,
): Promise<{
  artifact: Doc<'assetRecoveryArtifacts'>
  archive: AssetRecoveryArchive
  checksum: string
  blockers: Array<{ code: string; message: string }>
}> {
  const { artifact, archive } = await loadVerifiedArchive(ctx, artifactId)
  const blockers: Array<{ code: string; message: string }> = []
  const current = await readAssetRecoverySource(ctx, archive.asset.originalAssetId)
  if (current) blockers.push({ code: 'restore-target-exists', message: 'The asset still exists.' })
  return { artifact, archive, checksum: artifact.checksum, blockers }
}

export const previewRestoreAsset = callerAction.protected({
  id: 'assetRecovery:previewRestoreAsset',
  args: { artifactId: v.string() },
  guard: canManageAssetRecovery,
  returns: restorePreviewValidator,
  handler: async (ctx, args) => {
    const result = await assetRestoreBlockers(ctx, args.artifactId)
    return {
      artifactId: args.artifactId,
      checksum: result.checksum,
      applySupported: result.blockers.length === 0,
      blockers: result.blockers,
      warnings: [],
    }
  },
})

export const restoreAsset = callerAction.protected({
  id: 'assetRecovery:restoreAsset',
  args: { artifactId: v.string(), expectedChecksum: v.string() },
  guard: canManageAssetRecovery,
  returns: v.object({
    artifactId: v.string(),
    restoredAssetId: v.string(),
    originalAssetId: v.string(),
  }),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const result = await assetRestoreBlockers(ctx, args.artifactId)
    if (args.expectedChecksum !== result.checksum) {
      throwCmsError(
        'ASSET_RECOVERY_RESTORE_CHECKSUM_CONFIRMATION_MISMATCH',
        'Restore checksum confirmation does not match the recovery artifact.',
      )
    }
    if (result.blockers.length) {
      throwCmsError('ASSET_RECOVERY_RESTORE_BLOCKED', 'Asset recovery is blocked.', {
        blockers: result.blockers,
      })
    }
    const verified = await loadVerifiedArchive(ctx, args.artifactId)
    const storageRef = await ctx.storage.store(
      new Blob([Uint8Array.from(verified.bytes).buffer], {
        type: verified.archive.asset.mimeType,
      }),
    )
    try {
      const stored = await ctx.storage.get(storageRef)
      if (
        !stored ||
        (await sha256Bytes(new Uint8Array(await stored.arrayBuffer()))) !==
          verified.archive.asset.sha256
      ) {
        throwCmsError(
          'ASSET_RECOVERY_RESTORE_BYTE_MISMATCH',
          'Restored asset bytes failed verification.',
        )
      }
      const restored = await ctx.runMutation(restoreAssetFromRecoveryRef, {
        contractWriteToken: requireCmsContractWriteToken(ctx),
        artifactId: args.artifactId,
        asset: verified.archive.asset,
        restoredStorageRef: storageRef,
        userId: appIdentity.userId,
        now: Date.now(),
      })
      return {
        artifactId: args.artifactId,
        restoredAssetId: restored.assetId,
        originalAssetId: restored.originalAssetId,
      }
    } catch (error) {
      await ctx.storage.delete(storageRef)
      throw error
    }
  },
})

const deleteAssetRecoveryArtifactArgs = { artifactId: v.string() }

export const deleteAssetRecoveryArtifactOperation = defineCmsOperation({
  id: 'ginko-cms.delete-asset-recovery-artifact',
  kind: 'destructive',
  executeFunctionRef: 'assetRecovery:deleteAssetRecoveryArtifactOperationExecute',
  args: deleteAssetRecoveryArtifactArgs,
  guard: canManageAssetRecovery,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => ({
    artifact: await ctx.db
      .query('assetRecoveryArtifacts')
      .withIndex('by_artifact', (query) => query.eq('artifactId', args.artifactId))
      .first(),
  }),
  preview: async (ctx, args, { artifact }) => {
    if (!artifact) {
      return buildPreview({
        allowed: false,
        summary: 'Asset recovery artifact was not found.',
        blockers: [
          operationIssue({
            code: 'asset-recovery-artifact-not-found',
            message: 'Asset recovery artifact was not found.',
          }),
        ],
        confirm: { operationId: 'ginko-cms.delete-asset-recovery-artifact', args },
      })
    }
    if (
      await isStorageClaimedByAnotherOwner(ctx, artifact.storageRef, {
        recoveryArtifactId: artifact._id,
      })
    ) {
      return buildPreview({
        allowed: false,
        summary: `Asset recovery artifact "${artifact.artifactId}" has shared storage.`,
        blockers: [
          operationIssue({
            code: 'asset-storage-shared',
            message: 'Shared storage cannot be deleted until the ownership conflict is repaired.',
          }),
        ],
        details: { artifactId: artifact.artifactId, assetId: artifact.assetId ?? null },
        confirm: { operationId: 'ginko-cms.delete-asset-recovery-artifact', args },
        version: { createdAt: artifact.createdAt, checksum: artifact.checksum },
      })
    }
    return buildPreview({
      summary: `Will delete asset recovery artifact "${artifact.artifactId}".`,
      warnings: [
        operationIssue({
          code: 'asset-recovery-delete',
          message: 'A fresh verified artifact will be required before permanent asset purge.',
        }),
      ],
      details: { artifactId: artifact.artifactId, assetId: artifact.assetId ?? null },
      confirm: { operationId: 'ginko-cms.delete-asset-recovery-artifact', args },
      version: { createdAt: artifact.createdAt, checksum: artifact.checksum },
    })
  },
  handler: async (ctx, args, { artifact }) => {
    if (!artifact) {
      throwCmsError('ASSET_RECOVERY_NOT_FOUND', 'Asset recovery artifact was not found.', {
        artifactId: args.artifactId,
      })
    }
    const appIdentity = await ctx.appIdentity()
    if (
      await isStorageClaimedByAnotherOwner(ctx, artifact.storageRef, {
        recoveryArtifactId: artifact._id,
      })
    ) {
      throwCmsError(
        'ASSET_STORAGE_SHARED',
        'Shared storage cannot be deleted until the ownership conflict is repaired.',
      )
    }
    await ctx.storage.delete(artifact.storageRef)
    await ctx.db.delete(artifact._id)
    await logActivity(ctx, {
      kind: 'asset.recovery-deleted',
      summary: 'Deleted asset recovery artifact',
      appIdentityId: appIdentity.userId,
      collection: artifact.collection ?? null,
      entryId: artifact.entryId ?? null,
      detail: { artifactId: artifact.artifactId, assetId: artifact.assetId ?? null },
    })
    return null
  },
})

export const deleteAssetRecoveryArtifactOperationExecute = callerMutation.protected(
  deleteAssetRecoveryArtifactOperation,
)

export const previewDeleteAssetRecoveryArtifactOperation = callerMutation.protected(
  Object.assign(definePreview(deleteAssetRecoveryArtifactOperation), {
    id: 'assetRecovery:previewDeleteAssetRecoveryArtifactOperation',
  }),
)

export const validateAssetRecoveryArtifactForPurge = internalQuery({
  args: { artifactId: v.string(), assetId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertAssetRecoveryArtifactCoversPurge(ctx, args.artifactId, args.assetId)
    return null
  },
})
