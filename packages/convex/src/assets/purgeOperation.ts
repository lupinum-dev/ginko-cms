import { v } from 'convex/values'

import { assertAssetRecoveryArtifactCoversPurge } from '../assetRecovery.js'
import { canManageAssetRecovery } from '../auth/checks.js'
import { readAssetReferenceProofStatus } from '../entries/assetReferenceProof.js'
import { throwCmsError } from '../errors.js'
import { logActivity } from '../lib/activity.js'
import {
  blockedPreview,
  buildPreview,
  defineCmsOperation,
  operationEffect,
  operationIssue,
  previewResultValidator,
} from '../operationHelpers.js'
import { assertStorageOutsidePortableExportHold } from '../portability/lease.js'
import { cmsErrorOperationIssue } from './purge.js'
import { hasAssetReferences } from './relationships.js'
import { isStorageClaimedByAnotherOwner } from './storageOwnership.js'

export const purgeAssetArgs = {
  assetId: v.string(),
  recoveryArtifactId: v.string(),
}

export const purgeAssetOperation = defineCmsOperation({
  id: 'ginko-cms.purge-asset',
  kind: 'destructive',
  executeFunctionRef: 'assets:purgeAsset',
  args: purgeAssetArgs,
  guard: canManageAssetRecovery,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    return { asset: assetId ? await ctx.db.get(assetId) : null }
  },
  preview: async (ctx, args, { asset }) => {
    if (!asset) {
      return blockedPreview({
        summary: 'Asset not found.',
        blockers: [operationIssue({ code: 'asset-not-found', message: 'Asset not found.' })],
        confirm: { operationId: 'ginko-cms.purge-asset', args },
      })
    }
    if (asset.deletedAt == null) {
      return blockedPreview({
        summary: `Asset "${asset.filename}" must be in trash before permanent deletion.`,
        blockers: [
          operationIssue({
            code: 'asset-not-trashed',
            message: 'Move the asset to trash before permanently deleting it.',
          }),
        ],
        details: { assetId: args.assetId, filename: asset.filename },
        confirm: { operationId: 'ginko-cms.purge-asset', args },
        version: { updatedAt: asset.updatedAt, deletedAt: null },
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
        confirm: { operationId: 'ginko-cms.purge-asset', args },
        version: { updatedAt: asset.updatedAt, deletedAt: asset.deletedAt },
      })
    }

    try {
      if (await isStorageClaimedByAnotherOwner(ctx, asset.storageId, { assetId: asset._id })) {
        throwCmsError(
          'ASSET_STORAGE_SHARED',
          'Shared storage cannot be purged until the ownership conflict is repaired.',
        )
      }
      await assertAssetRecoveryArtifactCoversPurge(ctx, args.recoveryArtifactId, args.assetId)
    } catch (error) {
      return blockedPreview({
        summary: `Cannot permanently delete asset "${asset.filename}".`,
        blockers: [cmsErrorOperationIssue(error)],
        details: { assetId: args.assetId, filename: asset.filename },
        confirm: { operationId: 'ginko-cms.purge-asset', args },
        version: { updatedAt: asset.updatedAt, deletedAt: asset.deletedAt },
      })
    }

    const referenceProof = await readAssetReferenceProofStatus(ctx, args.assetId)
    if (!referenceProof.current) {
      return blockedPreview({
        summary: `Cannot prove that asset "${asset.filename}" is unreferenced.`,
        blockers: [
          operationIssue({
            code: 'asset-reference-verification-required',
            message:
              'Run the complete projection/reference repair and verification before permanent purge.',
          }),
        ],
        details: {
          assetId: args.assetId,
          filename: asset.filename,
          canonicalGeneration: referenceProof.canonicalGeneration,
          verifiedRunId: referenceProof.verifiedRunId,
        },
        confirm: { operationId: 'ginko-cms.purge-asset', args },
        version: {
          updatedAt: asset.updatedAt,
          deletedAt: asset.deletedAt,
          referenceCanonicalGeneration: referenceProof.canonicalGeneration,
          referenceVerifiedRunId: referenceProof.verifiedRunId,
        },
      })
    }

    const referenced = referenceProof.referenced || (await hasAssetReferences(ctx, args.assetId))
    if (referenced) {
      return blockedPreview({
        summary: `Asset "${asset.filename}" is still referenced.`,
        blockers: [
          operationIssue({
            code: 'asset-in-use',
            message: 'Referenced assets cannot be permanently deleted.',
          }),
        ],
        details: { assetId: args.assetId, filename: asset.filename, referenced },
        confirm: {
          operationId: 'ginko-cms.purge-asset',
          args,
          effect: { assetId: args.assetId, filename: asset.filename, referenced },
        },
        version: { updatedAt: asset.updatedAt, deletedAt: asset.deletedAt },
      })
    }

    return buildPreview({
      summary: `Will permanently delete asset "${asset.filename}".`,
      warnings: [
        operationIssue({
          code: 'permanent-delete',
          message: 'This permanently removes the asset record and stored file.',
        }),
      ],
      effects: [
        operationEffect({ kind: 'assets', summary: 'Assets permanently deleted', count: 1 }),
      ],
      details: { assetId: args.assetId, filename: asset.filename, referenced },
      confirm: {
        operationId: 'ginko-cms.purge-asset',
        args,
        effect: { assetId: args.assetId, filename: asset.filename, referenced },
      },
      version: {
        updatedAt: asset.updatedAt,
        deletedAt: asset.deletedAt,
        referenceCanonicalGeneration: referenceProof.canonicalGeneration,
        referenceVerifiedRunId: referenceProof.verifiedRunId,
      },
    })
  },
  handler: async (ctx, args, { asset }) => {
    const appIdentity = await ctx.appIdentity()
    if (!asset) return null
    if (asset.deletedAt == null) {
      throwCmsError('ASSET_NOT_TRASHED', 'Move the asset to trash before permanent deletion.', {
        assetId: args.assetId,
      })
    }
    await assertStorageOutsidePortableExportHold(ctx, asset.storageId)
    if (await isStorageClaimedByAnotherOwner(ctx, asset.storageId, { assetId: asset._id })) {
      throwCmsError(
        'ASSET_STORAGE_SHARED',
        'Shared storage cannot be purged until the ownership conflict is repaired.',
      )
    }
    const referenceProof = await readAssetReferenceProofStatus(ctx, args.assetId)
    if (!referenceProof.current) {
      throwCmsError(
        'ASSET_REFERENCE_VERIFICATION_REQUIRED',
        'A current complete projection/reference verification is required before permanent purge.',
        { assetId: args.assetId, canonicalGeneration: referenceProof.canonicalGeneration },
      )
    }
    const referenced = referenceProof.referenced || (await hasAssetReferences(ctx, args.assetId))
    if (referenced) {
      throwCmsError('ASSET_IN_USE', 'Referenced assets cannot be permanently deleted', {
        assetId: args.assetId,
        referenced,
      })
    }
    await ctx.storage.delete(asset.storageId)
    await ctx.db.delete(asset._id)
    await logActivity(ctx, {
      kind: 'asset.deleted',
      summary: `Deleted asset "${asset.filename}" permanently`,
      appIdentityId: appIdentity.userId,
      entryId: asset.entryId ?? null,
      collection: asset.collection ?? null,
      detail: { filename: asset.filename },
    })
    return null
  },
})
