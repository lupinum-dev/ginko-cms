import {
  claimAssetUploadSession as claimAssetUploadSessionArgs,
  createAssetUploadSession as createAssetUploadSessionArgs,
  deleteAsset as deleteAssetArgs,
  finalizeAssetUploadSession as finalizeAssetUploadSessionArgs,
  getAsset as getAssetArgs,
  getAssetManagerData as getAssetManagerDataArgs,
  getAssetManagerFacets as getAssetManagerFacetsArgs,
  listAssetsByOwner as listAssetsByOwnerArgs,
  listAssetUsages as listAssetUsagesArgs,
  moveAsset as moveAssetArgs,
  replaceAsset as replaceAssetArgs,
  resolveAssetUrls as resolveAssetUrlsArgs,
  updateAsset as updateAssetArgs,
  verifyAssetReplacementUpload as verifyAssetReplacementUploadArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'
import {
  assetManagerAssetValidator,
  assetManagerFacetsValidator,
  assetManagerPageValidator,
  assetPageValidator,
  assetUsagePageValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { internalAction, internalMutation, internalQuery } from './_generated/server.js'
import {
  canDeleteAssetCleanupStorageHandler,
  cleanupAssetStorageHandler,
  failAssetStorageCleanupHandler,
  finishAssetStorageCleanupHandler,
  listTerminalAssetCleanupTasksHandler,
  retryAssetCleanupOperation,
  terminalAssetCleanupArgs,
  terminalAssetCleanupPageValidator,
} from './assets/cleanupOperations.js'
import {
  boundedPaginationOpts,
  mapAsset,
  mapAssetPage,
  readAssetManagerPage,
  readAssetManagerFacets,
  readAssetsByOwnerSourcePage,
  readAssetUsageSourcePage,
} from './assets/listing.js'
import {
  executeVerifiedAssetPurgeHandler,
  issueAssetPurgeVerificationFenceHandler,
  purgeAssetHandler,
  purgePreflightIssueValidator,
  purgeVerificationValidator,
} from './assets/purgeExecution.js'
import { purgeAssetArgs, purgeAssetOperation } from './assets/purgeOperation.js'
import { hasAssetReferences, mapAssetReferenceUsages } from './assets/relationships.js'
import {
  assetReplacementResultValidator,
  executeVerifiedAssetReplacementArgs,
  executeVerifiedAssetReplacementHandler,
  readVerifiedAssetReplacementSessionHandler,
  replaceAssetHandler,
  replaceAssetOperation,
  replacementExecuteResultValidator,
  stagedReplacementValidator,
  stageVerifiedAssetReplacementArgs,
  stageVerifiedAssetReplacementHandler,
  verifiedReplacementSessionValidator,
  verifyAssetReplacementUploadHandler,
} from './assets/replacement.js'
import {
  assetDiscoveryFields,
  normalizeTags,
  validateAssetScopeRelationships,
} from './assets/scope.js'
import {
  claimAssetUploadSessionHandler,
  createAssetUploadSessionHandler,
  expireAssetUploadSessionHandler,
  finalizeAssetUploadSessionHandler,
  finalizeClaimedAssetUploadSessionHandler,
  readAssetUploadSessionHandler,
} from './assets/uploadSessions.js'
import { canManageAssetRecovery, canManageAssets, canRead, requireRecord } from './auth/checks.js'
import { readAssetReferenceProofStatus } from './entries/assetReferenceProof.js'
import { throwCmsError } from './errors.js'
import { callerAction, callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import { cmsContractWriteTokenValidator } from './lib/installedContract.js'
import { sanitizeFilename } from './lib/sanitize.js'
import {
  blockedPreview,
  defineCmsOperation,
  operationEffect,
  operationExecuteResultValidator,
  operationIssue,
  buildPreview,
  previewResultValidator,
  definePreview,
} from './operationHelpers.js'
import { assertStorageOutsidePortableExportHold } from './portability/lease.js'

const MAX_RESOLVED_ASSET_URLS = 200
const ASSET_LIST_DEFAULT_LIMIT = 50
const ASSET_LIST_MAX_LIMIT = 100
const ASSET_USAGE_DEFAULT_LIMIT = 20
const ASSET_USAGE_MAX_LIMIT = 100
const ASSET_SEARCH_MAX_LENGTH = 256
const assetUploadMetadataArgs = {
  filename: finalizeAssetUploadSessionArgs.args.filename,
  alt: finalizeAssetUploadSessionArgs.args.alt,
  caption: finalizeAssetUploadSessionArgs.args.caption,
  scope: finalizeAssetUploadSessionArgs.args.scope,
  entryId: finalizeAssetUploadSessionArgs.args.entryId,
  collection: finalizeAssetUploadSessionArgs.args.collection,
}

export const createAssetUploadSession = callerMutation.protected({
  acceptsTrustedCaller: true,
  id: 'assets:createAssetUploadSession',
  args: createAssetUploadSessionArgs.args,
  guard: canManageAssets,
  returns: v.object({
    sessionId: v.string(),
    uploadUrl: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: createAssetUploadSessionHandler,
})

export const claimAssetUploadSession = callerMutation.protected({
  acceptsTrustedCaller: true,
  id: 'assets:claimAssetUploadSession',
  args: claimAssetUploadSessionArgs.args,
  guard: canManageAssets,
  returns: v.object({ sessionId: v.string(), generation: v.number(), expiresAt: v.number() }),
  handler: claimAssetUploadSessionHandler,
})

export const readAssetUploadSession = internalQuery({
  args: { sessionId: v.string(), ownerId: v.string(), tokenHash: v.string() },
  returns: v.union(
    v.object({
      state: v.literal('uploaded'),
      sessionId: v.string(),
      storageId: v.id('_storage'),
      generation: v.number(),
      expiresAt: v.number(),
    }),
    v.object({ state: v.literal('finalized'), sessionId: v.string(), assetId: v.string() }),
  ),
  handler: readAssetUploadSessionHandler,
})

export const finalizeAssetUploadSession = callerAction.protected({
  id: 'assets:finalizeAssetUploadSession',
  args: finalizeAssetUploadSessionArgs.args,
  guard: canManageAssets,
  returns: v.string(),
  handler: finalizeAssetUploadSessionHandler,
})

export const finalizeClaimedAssetUploadSession = internalMutation({
  args: {
    contractWriteToken: cmsContractWriteTokenValidator,
    sessionId: v.string(),
    ownerId: v.string(),
    tokenHash: v.string(),
    expectedGeneration: v.number(),
    storageId: v.id('_storage'),
    ...assetUploadMetadataArgs,
    mimeType: v.union(
      v.literal('image/gif'),
      v.literal('image/jpeg'),
      v.literal('image/png'),
      v.literal('image/webp'),
    ),
    bytes: v.number(),
    sha256: v.string(),
    width: v.number(),
    height: v.number(),
    frames: v.number(),
  },
  returns: v.string(),
  handler: finalizeClaimedAssetUploadSessionHandler,
})

export const verifyAssetReplacementUpload = callerAction.protected({
  id: 'assets:verifyAssetReplacementUpload',
  args: verifyAssetReplacementUploadArgs.args,
  guard: canManageAssets,
  returns: stagedReplacementValidator,
  handler: verifyAssetReplacementUploadHandler,
})

export const stageVerifiedAssetReplacement = internalMutation({
  args: stageVerifiedAssetReplacementArgs,
  returns: stagedReplacementValidator,
  handler: stageVerifiedAssetReplacementHandler,
})

export const readVerifiedAssetReplacementSession = internalQuery({
  args: { assetId: v.string(), sessionId: v.string(), ownerId: v.string() },
  returns: verifiedReplacementSessionValidator,
  handler: readVerifiedAssetReplacementSessionHandler,
})

export const executeVerifiedAssetReplacement = internalMutation({
  args: executeVerifiedAssetReplacementArgs,
  returns: replacementExecuteResultValidator,
  handler: executeVerifiedAssetReplacementHandler,
})

export const replaceAsset = callerAction.protected({
  id: 'assets:replaceAsset',
  args: replaceAssetArgs.args,
  guard: canManageAssets,
  returns: replacementExecuteResultValidator,
  handler: replaceAssetHandler,
})

export const previewReplaceAssetOperation = callerMutation.protected(
  Object.assign(definePreview(replaceAssetOperation), {
    acceptsTrustedCaller: true,
    id: 'assets:previewReplaceAssetOperation',
  }),
)

export { replaceAssetOperation, assetReplacementResultValidator }

export const expireAssetUploadSession = internalMutation({
  args: { uploadSessionId: v.id('assetUploadSessions') },
  returns: v.null(),
  handler: expireAssetUploadSessionHandler,
})

export const canDeleteAssetCleanupStorage = internalQuery({
  args: {
    taskId: v.id('assetCleanupTasks'),
    storageId: v.id('_storage'),
    generation: v.number(),
    attempt: v.number(),
  },
  returns: v.boolean(),
  handler: canDeleteAssetCleanupStorageHandler,
})

export const finishAssetStorageCleanup = internalMutation({
  args: { taskId: v.id('assetCleanupTasks'), generation: v.number(), attempt: v.number() },
  returns: v.null(),
  handler: finishAssetStorageCleanupHandler,
})

export const failAssetStorageCleanup = internalMutation({
  args: {
    taskId: v.id('assetCleanupTasks'),
    generation: v.number(),
    attempt: v.number(),
    error: v.string(),
  },
  returns: v.union(v.literal('retrying'), v.literal('terminal-failure'), v.literal('stale')),
  handler: failAssetStorageCleanupHandler,
})

export const cleanupAssetStorage = internalAction({
  args: {
    taskId: v.id('assetCleanupTasks'),
    storageId: v.id('_storage'),
    generation: v.number(),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: cleanupAssetStorageHandler,
})

export const listTerminalAssetCleanupTasks = callerQuery.protected({
  id: 'assets:listTerminalAssetCleanupTasks',
  args: terminalAssetCleanupArgs,
  guard: canManageAssetRecovery,
  returns: terminalAssetCleanupPageValidator,
  handler: listTerminalAssetCleanupTasksHandler,
})

export const retryAssetCleanupOperationExecute = callerMutation.protected(
  retryAssetCleanupOperation,
)
export const previewRetryAssetCleanupOperation = callerMutation.protected(
  Object.assign(definePreview(retryAssetCleanupOperation), {
    id: 'assets:previewRetryAssetCleanupOperation',
  }),
)
export { insertVerifiedAssetRecord } from './assets/assetRecord.js'

export const updateAsset = callerMutation.protected({
  acceptsTrustedCaller: true,
  id: 'assets:updateAsset',
  args: updateAssetArgs.args,
  guard: canManageAssets,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    const asset = assetId ? await ctx.db.get(assetId) : null
    requireRecord(asset, 'Asset')

    if (args.filename !== undefined) {
      await assertStorageOutsidePortableExportHold(ctx, asset.storageId)
    }

    const updatedAt = Date.now()
    const filename = args.filename !== undefined ? sanitizeFilename(args.filename) : asset.filename
    const tags = args.tags !== undefined ? normalizeTags(args.tags) : (asset.tags ?? [])
    const patch: Record<string, unknown> = {
      updatedBy: appIdentity.userId,
      updatedAt,
      ...assetDiscoveryFields({
        filename,
        mimeType: asset.mimeType,
        tags,
        createdAt: asset.createdAt,
        updatedAt,
        deletedAt: asset.deletedAt,
      }),
    }
    if (args.alt !== undefined) patch.alt = args.alt
    if (args.caption !== undefined) patch.caption = args.caption
    if (args.filename !== undefined) patch.filename = filename
    if (args.tags !== undefined) patch.tags = tags
    await ctx.db.patch(asset._id, patch)

    await logActivity(ctx, {
      kind: 'asset.updated',
      summary: `Updated asset "${args.filename ?? asset.filename}"`,
      appIdentityId: appIdentity.userId,
      entryId: asset.entryId ?? null,
      collection: asset.collection ?? null,
      detail: {
        fields: [
          args.alt !== undefined ? 'alt' : null,
          args.caption !== undefined ? 'caption' : null,
          args.filename !== undefined ? 'filename' : null,
          args.tags !== undefined ? 'tags' : null,
        ].filter((field): field is string => field !== null),
      },
    })

    return null
  },
})

export const moveAsset = callerMutation.protected({
  acceptsTrustedCaller: true,
  id: 'ginko-cms.move-asset',
  args: moveAssetArgs.args,
  guard: canManageAssets,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const { entryId, collection } = await validateAssetScopeRelationships(ctx, args)
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    const asset = assetId ? await ctx.db.get(assetId) : null
    requireRecord(asset, 'Asset')

    const updatedAt = Date.now()
    await ctx.db.patch(asset._id, {
      scope: args.scope,
      entryId,
      collection,
      updatedBy: appIdentity.userId,
      updatedAt,
      effectiveUpdatedAt: updatedAt,
    })

    return null
  },
})

export const getAsset = callerQuery.protected({
  acceptsTrustedCaller: true,
  id: 'assets:getAsset',
  args: getAssetArgs.args,
  guard: canRead,
  returns: v.union(assetManagerAssetValidator, v.null()),
  handler: async (ctx, args) => {
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    if (!assetId) return null
    const asset = await ctx.db.get(assetId)
    if (!asset || asset.deletedAt != null) return null
    return await mapAsset(ctx, asset)
  },
})

export const resolveAssetUrls = callerQuery.protected({
  acceptsTrustedCaller: true,
  id: 'assets:resolveAssetUrls',
  args: resolveAssetUrlsArgs.args,
  guard: canRead,
  returns: v.record(v.string(), v.union(v.string(), v.null())),
  handler: async (ctx, args) => {
    if (args.assetIds.length > MAX_RESOLVED_ASSET_URLS) {
      throwCmsError(
        'ASSET_QUERY_TOO_LARGE',
        `resolveAssetUrls accepts at most ${MAX_RESOLVED_ASSET_URLS} asset ids.`,
        { count: args.assetIds.length },
      )
    }
    const out: Record<string, string | null> = {}
    for (const rawAssetId of [...new Set(args.assetIds as string[])]) {
      const assetId = ctx.db.normalizeId('assets', rawAssetId)
      if (!assetId) {
        out[rawAssetId] = null
        continue
      }
      const asset = await ctx.db.get(assetId)
      if (!asset || asset.deletedAt != null) {
        out[rawAssetId] = null
        continue
      }
      out[rawAssetId] = await ctx.storage.getUrl(asset.storageId)
    }
    return out
  },
})

export const listAssetUsages = callerQuery.protected({
  id: 'assets:listAssetUsages',
  args: listAssetUsagesArgs.args,
  guard: canRead,
  returns: assetUsagePageValidator,
  handler: async (ctx, args) => {
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    if (!assetId || !(await ctx.db.get(assetId))) {
      throwCmsError('ASSET_NOT_FOUND', 'Asset not found.', { assetId: args.assetId })
    }
    const paginationOpts = boundedPaginationOpts(args.paginationOpts, {
      numItems: ASSET_USAGE_DEFAULT_LIMIT,
      maxItems: ASSET_USAGE_MAX_LIMIT,
    })
    const result = await readAssetUsageSourcePage(ctx, {
      assetId: args.assetId,
      cursor: paginationOpts.cursor,
      limit: paginationOpts.numItems,
    })
    return {
      page: await mapAssetReferenceUsages(ctx, result.page),
      isDone: result.isDone,
      continueCursor: result.isDone ? null : result.continueCursor,
    }
  },
})

export const listAssetsByOwner = callerQuery.protected({
  id: 'assets:listAssetsByOwner',
  args: listAssetsByOwnerArgs.args,
  guard: canRead,
  returns: assetPageValidator,
  handler: async (ctx, args) => {
    const owner = await validateAssetScopeRelationships(ctx, args)
    const paginationOpts = boundedPaginationOpts(args.paginationOpts, {
      numItems: ASSET_LIST_DEFAULT_LIMIT,
      maxItems: ASSET_LIST_MAX_LIMIT,
    })

    return await mapAssetPage(
      ctx,
      await readAssetsByOwnerSourcePage(ctx, {
        scope: args.scope,
        collection: owner.collection,
        entryId: owner.entryId,
        paginationOpts,
      }),
    )
  },
})

export const getAssetManagerData = callerQuery.protected({
  id: 'assets:getAssetManagerData',
  args: getAssetManagerDataArgs.args,
  guard: canManageAssets,
  returns: assetManagerPageValidator,
  handler: async (ctx, args) => {
    const paginationOpts = boundedPaginationOpts(args.paginationOpts, {
      numItems: ASSET_LIST_DEFAULT_LIMIT,
      maxItems: ASSET_LIST_MAX_LIMIT,
    })
    const search = args.search?.trim() ?? ''
    if (search.length > ASSET_SEARCH_MAX_LENGTH) {
      throwCmsError('INVALID_QUERY', 'Asset search query exceeds the maximum length.', {
        maxLength: ASSET_SEARCH_MAX_LENGTH,
      })
    }
    const kind = args.kind ?? 'all'
    const deleted = args.deleted ?? 'all'
    const usage = args.usage ?? 'all'
    const time = args.time ?? 'any'
    const size = args.size ?? 'any'
    const tag = args.tag?.trim().toLowerCase() ?? ''
    const sort = args.sort ?? 'name'
    const location = args.location ?? 'all'
    const collection = args.collection?.trim() || null
    const entryId = args.entryId?.trim() || null
    if (tag.length > 64) {
      throwCmsError('INVALID_QUERY', 'Asset tag filter exceeds the maximum length.', {
        maxLength: 64,
      })
    }
    if (location === 'collection' && !collection) {
      throwCmsError('INVALID_QUERY', 'Collection asset discovery requires collection.')
    }
    if (location === 'entry' && !entryId) {
      throwCmsError('INVALID_QUERY', 'Entry asset discovery requires entryId.')
    }
    return await readAssetManagerPage(ctx, {
      search,
      kind,
      deleted,
      usage,
      time,
      size,
      tag,
      sort,
      location,
      collection,
      entryId,
      paginationOpts,
    })
  },
})

export const getAssetManagerFacets = callerQuery.protected({
  id: 'assets:getAssetManagerFacets',
  args: getAssetManagerFacetsArgs.args,
  guard: canManageAssets,
  returns: assetManagerFacetsValidator,
  handler: async (ctx) => await readAssetManagerFacets(ctx),
})

export const deleteAssetOperation = defineCmsOperation({
  id: 'ginko-cms.delete-asset',
  kind: 'destructive',
  executeFunctionRef: 'assets:deleteAssetOperationExecute',
  args: deleteAssetArgs.args,
  guard: canManageAssets,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    const asset = assetId ? await ctx.db.get(assetId) : null
    return { asset: asset && asset.deletedAt == null ? asset : null }
  },
  preview: async (ctx, args, { asset }) => {
    if (!asset) {
      return blockedPreview({
        summary: 'Asset not found.',
        blockers: [operationIssue({ code: 'asset-not-found', message: 'Asset not found.' })],
        confirm: { operationId: 'ginko-cms.delete-asset', args },
      })
    }
    try {
      await assertStorageOutsidePortableExportHold(ctx, asset.storageId)
    } catch (error) {
      return blockedPreview({
        summary: `Asset "${asset.filename}" is temporarily protected by a portability export.`,
        blockers: [
          operationIssue({
            code: 'asset-portability-hold',
            message: error instanceof Error ? error.message : 'The asset is temporarily protected.',
          }),
        ],
        details: { assetId: args.assetId, filename: asset.filename },
        confirm: { operationId: 'ginko-cms.delete-asset', args },
        version: { updatedAt: asset.updatedAt, deletedAt: asset.deletedAt ?? null },
      })
    }
    const derivedReference = await hasAssetReferences(ctx, args.assetId)
    const referenceProof = await readAssetReferenceProofStatus(ctx, args.assetId)
    if (!derivedReference && !referenceProof.current) {
      return blockedPreview({
        summary: `Cannot prove that asset "${asset.filename}" is unreferenced.`,
        blockers: [
          operationIssue({
            code: 'asset-reference-verification-required',
            message:
              'Run the complete projection/reference repair and verification before moving this asset to trash.',
          }),
        ],
        details: {
          assetId: args.assetId,
          filename: asset.filename,
          canonicalGeneration: referenceProof.canonicalGeneration,
          verifiedRunId: referenceProof.verifiedRunId,
        },
        confirm: { operationId: 'ginko-cms.delete-asset', args },
        version: {
          updatedAt: asset.updatedAt,
          deletedAt: asset.deletedAt ?? null,
          referenceCanonicalGeneration: referenceProof.canonicalGeneration,
          referenceVerifiedRunId: referenceProof.verifiedRunId,
        },
      })
    }
    const referenced = derivedReference || (referenceProof.current && referenceProof.referenced)
    return buildPreview({
      summary: `Will move asset "${asset.filename}" to trash.`,
      allowed: !referenced || args.force === true,
      blockers:
        referenced && args.force !== true
          ? [
              operationIssue({
                code: 'asset-in-use',
                message: 'Cannot move an in-use asset to trash without force.',
              }),
            ]
          : [],
      warnings: args.force
        ? [
            operationIssue({
              code: 'forced-delete',
              message: 'Forced deletion can affect existing content references.',
            }),
          ]
        : [],
      effects: [
        operationEffect({
          kind: 'assets',
          summary: 'Assets moved to trash',
          count: 1,
        }),
      ],
      details: { assetId: args.assetId, filename: asset.filename, referenced },
      confirm: {
        operationId: 'ginko-cms.delete-asset',
        args,
        effect: {
          assetId: args.assetId,
          filename: asset.filename,
          referenced,
        },
      },
      version: {
        updatedAt: asset.updatedAt,
        deletedAt: asset.deletedAt ?? null,
      },
    })
  },
  handler: async (ctx, args, { asset }) => {
    const appIdentity = await ctx.appIdentity()
    if (!asset) return null
    await assertStorageOutsidePortableExportHold(ctx, asset.storageId)
    const derivedReference = await hasAssetReferences(ctx, args.assetId)
    const referenceProof = await readAssetReferenceProofStatus(ctx, args.assetId)
    if (!derivedReference && !referenceProof.current) {
      throwCmsError(
        'ASSET_REFERENCE_VERIFICATION_REQUIRED',
        'A current complete projection/reference verification is required before moving an unreferenced asset to trash.',
        { assetId: args.assetId, canonicalGeneration: referenceProof.canonicalGeneration },
      )
    }
    const referenced = derivedReference || (referenceProof.current && referenceProof.referenced)
    if (referenced && !args.force) {
      throwCmsError('ASSET_IN_USE', 'Cannot move an in-use asset to trash without force', {
        assetId: args.assetId,
        referenced,
      })
    }
    const updatedAt = Date.now()
    await ctx.db.patch(asset._id, {
      deletedAt: updatedAt,
      deletedBy: appIdentity.userId,
      updatedBy: appIdentity.userId,
      updatedAt,
      effectiveUpdatedAt: updatedAt,
      deletedState: 'trashed',
    })

    await logActivity(ctx, {
      kind: 'asset.trashed',
      summary: `Moved asset "${asset.filename}" to trash`,
      appIdentityId: appIdentity.userId,
      entryId: asset.entryId ?? null,
      collection: asset.collection ?? null,
      detail: { filename: asset.filename },
    })

    return null
  },
})

export const deleteAssetOperationExecute = callerMutation.protected(
  Object.assign(deleteAssetOperation, { acceptsTrustedCaller: true }),
)
export const previewDeleteAssetOperation = callerMutation.protected(
  Object.assign(definePreview(deleteAssetOperation), {
    acceptsTrustedCaller: true,
    id: 'assets:previewDeleteAssetOperation',
  }),
)

export const restoreAsset = callerMutation.protected({
  acceptsTrustedCaller: true,
  id: 'assets:restoreAsset',
  args: { assetId: v.string() },
  guard: canManageAssets,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    const asset = assetId ? await ctx.db.get(assetId) : null
    if (!asset) return null
    const updatedAt = Date.now()
    await ctx.db.patch(asset._id, {
      deletedAt: null,
      deletedBy: null,
      updatedBy: appIdentity.userId,
      updatedAt,
      effectiveUpdatedAt: updatedAt,
      deletedState: 'active',
    })

    await logActivity(ctx, {
      kind: 'asset.restored',
      summary: `Restored asset "${asset.filename}"`,
      appIdentityId: appIdentity.userId,
      entryId: asset.entryId ?? null,
      collection: asset.collection ?? null,
      detail: { filename: asset.filename },
    })

    return null
  },
})

export const issueAssetPurgeVerificationFence = internalMutation({
  args: {
    contractWriteToken: cmsContractWriteTokenValidator,
    userId: v.string(),
    verification: purgeVerificationValidator,
    fenceTokenHash: v.string(),
  },
  returns: v.object({ generation: v.number(), expiresAt: v.number() }),
  handler: issueAssetPurgeVerificationFenceHandler,
})

export const executeVerifiedAssetPurge = internalMutation({
  args: {
    contractWriteToken: cmsContractWriteTokenValidator,
    assetId: v.string(),
    recoveryArtifactId: v.string(),
    confirmationToken: v.optional(v.string()),
    fenceToken: v.optional(v.string()),
    userId: v.string(),
    verification: v.optional(purgeVerificationValidator),
    preflightIssue: v.optional(purgePreflightIssueValidator),
  },
  returns: operationExecuteResultValidator(v.null()),
  handler: executeVerifiedAssetPurgeHandler,
})

export const purgeAsset = callerAction.protected({
  id: 'assets:purgeAsset',
  args: { ...purgeAssetArgs, _confirmationToken: v.optional(v.string()) },
  guard: canManageAssetRecovery,
  returns: operationExecuteResultValidator(v.null()),
  handler: purgeAssetHandler,
})

export { purgeAssetOperation }

export const previewPurgeAssetOperation = callerMutation.protected(
  Object.assign(definePreview(purgeAssetOperation), {
    acceptsTrustedCaller: true,
    id: 'assets:previewPurgeAssetOperation',
  }),
)
