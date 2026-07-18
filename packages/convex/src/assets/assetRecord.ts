import type { Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import { logActivity } from '../lib/activity.js'
import { toStringId } from '../lib/ids.js'
import { sanitizeFilename } from '../lib/sanitize.js'
import type { MutationCtx } from '../lib/types.js'
import { assetDiscoveryFields, validateAssetScopeRelationships } from './scope.js'
import { type CmsStorageOwner, isStorageClaimedByAnotherOwner } from './storageOwnership.js'

export async function insertVerifiedAssetRecord(
  ctx: MutationCtx,
  args: {
    storageId: Id<'_storage'>
    filename: string
    mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'
    bytes: number
    sha256: string
    width: number
    height: number
    frames: number
    alt?: string | Record<string, string> | null
    caption?: string | Record<string, string> | null
    scope: 'global' | 'collection' | 'entry'
    entryId?: string
    collection?: string
    createdBy: string
    storageOwner?: Pick<CmsStorageOwner, 'uploadSessionId' | 'portableAssetId'>
  },
) {
  if (await isStorageClaimedByAnotherOwner(ctx, args.storageId, args.storageOwner)) {
    throwCmsError(
      'ASSET_STORAGE_ALREADY_CLAIMED',
      'Storage object is already claimed by another CMS owner.',
      { storageId: toStringId(args.storageId) },
    )
  }
  const { entryId, collection } = await validateAssetScopeRelationships(ctx, args)
  const filename = sanitizeFilename(args.filename)
  const createdAt = Date.now()
  const tags: string[] = []
  const assetId = await ctx.db.insert('assets', {
    storageId: args.storageId,
    filename,
    mimeType: args.mimeType,
    size: args.bytes,
    sha256: args.sha256,
    width: args.width,
    height: args.height,
    frames: args.frames,
    alt: args.alt ?? null,
    caption: args.caption ?? null,
    scope: args.scope,
    entryId,
    collection,
    tags,
    createdBy: args.createdBy,
    updatedBy: null,
    createdAt,
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    ...assetDiscoveryFields({
      filename,
      mimeType: args.mimeType,
      tags,
      createdAt,
      updatedAt: null,
      deletedAt: null,
    }),
  })
  await logActivity(ctx, {
    kind: 'asset.uploaded',
    summary: `Uploaded asset "${filename}"`,
    appIdentityId: args.createdBy,
    entryId,
    collection,
    detail: { filename, mimeType: args.mimeType, scope: args.scope, sha256: args.sha256 },
  })
  return toStringId(assetId)
}
