import {
  attachAssetsToEntry as attachAssetsToEntryArgs,
  deleteAsset as deleteAssetArgs,
  getAsset as getAssetArgs,
  getAssetManagerData as getAssetManagerDataArgs,
  listColocatedAssets as listColocatedAssetsArgs,
  moveAsset as moveAssetArgs,
  registerAsset as registerAssetArgs,
  resolveAssetUrls as resolveAssetUrlsArgs,
  updateAsset as updateAssetArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'
import {
  assetColocationGroupsValidator,
  assetManagerAssetValidator,
  assetManagerPageValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { verifyPublicImageBytes } from '@lupinum/ginko-content/cms-contract'
import { anyApi } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import { internalAction, internalMutation } from './_generated/server.js'
import {
  assetOwnerPathFromMeta,
  loadAssetRelationships,
  type AssetRelationships,
} from './assets/relationships.js'
import { canManageAssets, canRead, requireRecord } from './auth/checks.js'
import { assertBackupArtifactCoversPurge } from './backup.js'
import { rebuildContentAssetRefsForEntry } from './entries/projections.js'
import { throwCmsError } from './errors.js'
import { callerAction, callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import { getCollection } from './lib/collections.js'
import { toOptionalStringId, toStringId } from './lib/ids.js'
import { sanitizeFilename, validateAssetUploadPolicy } from './lib/sanitize.js'
import type { MutationCtx, QueryOrMutationCtx } from './lib/types.js'
import {
  blockedPreview,
  defineCmsOperation,
  operationEffect,
  operationIssue,
  buildPreview,
  previewResultValidator,
  definePreview,
} from './operationHelpers.js'
import { assertStorageOutsidePortableExportHold } from './portability/lease.js'

type AssetDoc = Doc<'assets'>
type CollectionDoc = Doc<'collections'>

const MAX_RESOLVED_ASSET_URLS = 200
const MAX_COLOCATED_GROUP_ASSETS = 200
const ASSET_MANAGER_SCAN_BATCH_SIZE = 50
type RegisterVerifiedAssetRef = FunctionReference<
  'mutation',
  'internal',
  Record<string, unknown>,
  string
>
type AssetInternalMutationRef = FunctionReference<
  'mutation',
  'internal',
  Record<string, unknown>,
  unknown
>
type AssetInternalActionRef = FunctionReference<
  'action',
  'internal',
  Record<string, unknown>,
  unknown
>
const assetsApi = anyApi as unknown as {
  assets: {
    registerVerifiedAsset: RegisterVerifiedAssetRef
    queueInvalidUploadCleanup: AssetInternalMutationRef
    finishInvalidUploadCleanup: AssetInternalMutationRef
    failInvalidUploadCleanup: AssetInternalMutationRef
    cleanupInvalidUpload: AssetInternalActionRef
  }
}
const MAX_ASSET_CLEANUP_ATTEMPTS = 5

const purgeAssetArgs = {
  assetId: v.string(),
  exportArtifactId: v.string(),
}

type AssetCreatedAtCursor = {
  v: 1
  kind: 'assetsByCreatedAt'
  createdAt: number
  storageId: string
}
type EntryCreatedAtCursor = {
  v: 1
  kind: 'entriesByCreatedAt'
  createdAt: number
  collectionId: string
  baseSlug: string
}
type CreatedAtCursor = AssetCreatedAtCursor | EntryCreatedAtCursor

function encodeAssetCreatedAtCursor(row: Pick<AssetDoc, 'createdAt' | 'storageId'>) {
  return JSON.stringify({
    v: 1,
    kind: 'assetsByCreatedAt',
    createdAt: row.createdAt,
    storageId: toStringId(row.storageId),
  } satisfies AssetCreatedAtCursor)
}

function encodeEntryCreatedAtCursor(
  row: Pick<Doc<'entries'>, 'createdAt' | 'collectionId' | 'baseSlug'>,
) {
  return JSON.stringify({
    v: 1,
    kind: 'entriesByCreatedAt',
    createdAt: row.createdAt,
    collectionId: toStringId(row.collectionId),
    baseSlug: row.baseSlug,
  } satisfies EntryCreatedAtCursor)
}

function parseCreatedAtCursor(
  cursor: string | null | undefined,
  kind: CreatedAtCursor['kind'],
  message: string,
) {
  if (!cursor) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(cursor)
  } catch {
    throwCmsError('INVALID_CURSOR', message, { cursor })
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as CreatedAtCursor).v !== 1 ||
    (parsed as CreatedAtCursor).kind !== kind ||
    typeof (parsed as CreatedAtCursor).createdAt !== 'number' ||
    !Number.isFinite((parsed as CreatedAtCursor).createdAt)
  ) {
    throwCmsError('INVALID_CURSOR', message, { cursor })
  }
  if (
    kind === 'assetsByCreatedAt' &&
    typeof (parsed as AssetCreatedAtCursor).storageId !== 'string'
  ) {
    throwCmsError('INVALID_CURSOR', message, { cursor })
  }
  if (
    kind === 'entriesByCreatedAt' &&
    (typeof (parsed as EntryCreatedAtCursor).collectionId !== 'string' ||
      typeof (parsed as EntryCreatedAtCursor).baseSlug !== 'string')
  ) {
    throwCmsError('INVALID_CURSOR', message, { cursor })
  }
  return parsed as CreatedAtCursor
}

function readCmsErrorData(error: unknown): { code: string; message: string } | null {
  const data =
    typeof error === 'object' && error !== null && 'data' in error
      ? (error as { data?: unknown }).data
      : null
  if (
    data &&
    typeof data === 'object' &&
    typeof (data as { code?: unknown }).code === 'string' &&
    typeof (data as { message?: unknown }).message === 'string'
  ) {
    return data as { code: string; message: string }
  }
  return null
}

function cmsErrorOperationIssue(error: unknown) {
  const data = readCmsErrorData(error)
  if (!data) throw error
  return operationIssue({
    code: data.code.toLowerCase().replaceAll('_', '-'),
    message: data.message,
  })
}

async function readAssetsByCreatedAt(
  ctx: QueryOrMutationCtx,
  cursor: AssetCreatedAtCursor | null,
  limit: number,
) {
  if (!cursor) {
    return await ctx.db.query('assets').withIndex('by_created_storage').order('desc').take(limit)
  }

  const sameCreatedAt = await ctx.db
    .query('assets')
    .withIndex('by_created_storage', (q) =>
      q.eq('createdAt', cursor.createdAt).lt('storageId', cursor.storageId as Id<'_storage'>),
    )
    .order('desc')
    .take(limit)
  if (sameCreatedAt.length >= limit) return sameCreatedAt

  const older = await ctx.db
    .query('assets')
    .withIndex('by_created_storage', (q) => q.lt('createdAt', cursor.createdAt))
    .order('desc')
    .take(limit - sameCreatedAt.length)
  return [...sameCreatedAt, ...older]
}

async function readEntriesByCreatedAt(
  ctx: QueryOrMutationCtx,
  cursor: EntryCreatedAtCursor | null,
  limit: number,
) {
  if (!cursor) {
    return await ctx.db
      .query('entries')
      .withIndex('by_createdAt_collection_slug')
      .order('asc')
      .take(limit)
  }

  const sameCollection = await ctx.db
    .query('entries')
    .withIndex('by_createdAt_collection_slug', (q) =>
      q
        .eq('createdAt', cursor.createdAt)
        .eq('collectionId', cursor.collectionId as Id<'collections'>)
        .gt('baseSlug', cursor.baseSlug),
    )
    .order('asc')
    .take(limit)
  if (sameCollection.length >= limit) return sameCollection

  const nextCollections = await ctx.db
    .query('entries')
    .withIndex('by_createdAt_collection_slug', (q) =>
      q
        .eq('createdAt', cursor.createdAt)
        .gt('collectionId', cursor.collectionId as Id<'collections'>),
    )
    .order('asc')
    .take(limit - sameCollection.length)
  if (sameCollection.length + nextCollections.length >= limit) {
    return [...sameCollection, ...nextCollections]
  }

  const newer = await ctx.db
    .query('entries')
    .withIndex('by_createdAt_collection_slug', (q) => q.gt('createdAt', cursor.createdAt))
    .order('asc')
    .take(limit - sameCollection.length - nextCollections.length)
  return [...sameCollection, ...nextCollections, ...newer]
}

function normalizeTags(tags: string[]): string[] {
  const next = new Set<string>()
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase()
    if (normalized.length === 0) continue
    next.add(normalized)
  }
  return Array.from(next)
}

function validateScope(args: {
  scope: 'global' | 'collection' | 'entry'
  entryId?: string
  collectionId?: string
  collectionSlug?: string
}) {
  if (args.scope === 'global' && (args.entryId || args.collectionId || args.collectionSlug)) {
    throwCmsError(
      'ASSET_SCOPE_INVALID',
      'Global assets cannot include entryId, collectionId, or collectionSlug',
    )
  }
  if (
    args.scope === 'collection' &&
    ((!args.collectionId && !args.collectionSlug) || args.entryId)
  ) {
    throwCmsError(
      'ASSET_SCOPE_INVALID',
      'Collection assets require collectionId or collectionSlug and no entryId',
    )
  }
  if (args.scope === 'entry' && (!args.entryId || (!args.collectionId && !args.collectionSlug))) {
    throwCmsError(
      'ASSET_SCOPE_INVALID',
      'Entry assets require entryId and collectionId or collectionSlug',
    )
  }
}

function normalizeCollectionId(ctx: QueryOrMutationCtx, collectionId: string): Id<'collections'> {
  const normalized = ctx.db.normalizeId('collections', collectionId)
  if (!normalized) {
    throwCmsError('ASSET_SCOPE_INVALID', 'collectionId must be a valid CMS collection id.', {
      collectionId,
    })
  }
  return normalized
}

function normalizeEntryId(ctx: QueryOrMutationCtx, entryId: string): Id<'entries'> {
  const normalized = ctx.db.normalizeId('entries', entryId)
  if (!normalized) {
    throwCmsError('ASSET_SCOPE_INVALID', 'entryId must be a valid CMS entry id.', { entryId })
  }
  return normalized
}

async function resolveCollectionForAssetScope(
  ctx: QueryOrMutationCtx,
  args: { collectionId?: string; collectionSlug?: string },
): Promise<CollectionDoc> {
  if (args.collectionId) {
    const collectionId = normalizeCollectionId(ctx, args.collectionId)
    const collection = await ctx.db.get(collectionId)
    requireRecord(collection, 'Collection')
    if (args.collectionSlug && collection.slug !== args.collectionSlug) {
      throwCmsError(
        'ASSET_SCOPE_INVALID',
        'collectionId and collectionSlug refer to different collections.',
        {
          collectionId: args.collectionId,
          collectionSlug: args.collectionSlug,
        },
      )
    }
    return collection
  }

  if (args.collectionSlug) {
    const collection = await getCollection(ctx, args.collectionSlug)
    requireRecord(collection, 'Collection')
    return collection
  }

  throwCmsError('ASSET_SCOPE_INVALID', 'Collection scope requires collectionId or collectionSlug.')
}

async function validateAssetScopeRelationships(
  ctx: QueryOrMutationCtx,
  args: {
    scope: 'global' | 'collection' | 'entry'
    entryId?: string
    collectionId?: string
    collectionSlug?: string
  },
): Promise<{ entryId: Id<'entries'> | null; collectionId: Id<'collections'> | null }> {
  validateScope(args)

  if (args.scope === 'global') {
    return { entryId: null, collectionId: null }
  }

  const collection = await resolveCollectionForAssetScope(ctx, args)
  const collectionId = collection._id

  if (args.scope === 'collection') {
    return { entryId: null, collectionId }
  }

  const entryId = normalizeEntryId(ctx, args.entryId!)
  const entry = await ctx.db.get(entryId)
  requireRecord(entry, 'Entry')
  if (entry.collectionId !== collectionId) {
    throwCmsError('ASSET_SCOPE_INVALID', 'Entry-scoped assets must use the entry collectionId.', {
      entryId: args.entryId ?? null,
      collectionId: args.collectionId ?? null,
    })
  }

  return { entryId, collectionId }
}

async function deleteAssetReferenceRows(ctx: MutationCtx, assetId: string) {
  let deleted = 0
  do {
    const rows = await ctx.db
      .query('contentAssetRefs')
      .withIndex('by_asset_source', (q) => q.eq('assetId', assetId))
      .take(100)
    deleted = rows.length
    for (const row of rows) {
      await ctx.db.delete(row._id)
    }
  } while (deleted === 100)
}

async function mapAssetManagerAsset(
  ctx: QueryOrMutationCtx,
  asset: AssetDoc,
  relationships: AssetRelationships,
) {
  const collectionId = toOptionalStringId(asset.collectionId)
  const entryId = toOptionalStringId(asset.entryId)
  const collectionMeta = collectionId ? relationships.collectionById.get(collectionId) : null
  const entryMeta = entryId ? relationships.entryById.get(entryId) : null
  const url = await ctx.storage.getUrl(asset.storageId)
  return {
    id: toStringId(asset._id),
    filename: asset.filename,
    mimeType: asset.mimeType,
    size: asset.size,
    width: asset.width ?? null,
    height: asset.height ?? null,
    scope: asset.scope,
    entryId,
    collectionId,
    collectionSlug: collectionMeta?.slug ?? entryMeta?.collectionSlug ?? null,
    collectionLabel: collectionMeta?.label ?? entryMeta?.collectionLabel ?? null,
    entryTitle: entryMeta?.title ?? null,
    ownerPath: assetOwnerPathFromMeta(asset, collectionMeta, entryMeta),
    url,
    thumbnailUrl: url,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt ?? null,
    deletedAt: asset.deletedAt ?? null,
    alt: asset.alt ?? null,
    caption: asset.caption ?? null,
    tags: asset.tags ?? [],
    usages: relationships.usagesByAssetId.get(toStringId(asset._id)) ?? [],
  }
}

export const generateUploadUrl = callerMutation.protected({
  id: 'assets:generateUploadUrl',
  args: {},
  guard: canManageAssets,
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
})

export const registerAsset = callerAction.protected({
  id: 'assets:registerAsset',
  args: registerAssetArgs.args,
  guard: canManageAssets,
  returns: v.string(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const storageId = args.storageId as Id<'_storage'>
    let uploadedObjectExists = false

    try {
      const blob = await ctx.storage.get(storageId)
      if (!blob) {
        throwCmsError('ASSET_STORAGE_MISSING', 'Uploaded asset storage object was not found.', {
          storageId: toStringId(storageId),
        })
      }
      uploadedObjectExists = true
      const claimed = validateAssetUploadPolicy({ mimeType: blob.type, size: blob.size })
      const verified = await verifyPublicImageBytes(
        new Uint8Array(await blob.arrayBuffer()),
        claimed.mimeType,
      )
      const { mediaType, ...verifiedFacts } = verified
      return await ctx.runMutation(assetsApi.assets.registerVerifiedAsset, {
        ...args,
        storageId,
        createdBy: appIdentity.userId,
        ...verifiedFacts,
        mimeType: mediaType,
      })
    } catch (error) {
      if (!uploadedObjectExists) throw error
      try {
        await ctx.storage.delete(storageId)
      } catch {
        const taskId = (await ctx.runMutation(assetsApi.assets.queueInvalidUploadCleanup, {
          storageId,
        })) as Id<'assetCleanupTasks'>
        await ctx.scheduler.runAfter(0, assetsApi.assets.cleanupInvalidUpload, {
          taskId,
          storageId,
          attempt: 1,
        })
        throwCmsError('ASSET_CLEANUP_QUEUED', 'Invalid upload cleanup was queued for retry.')
      }
      throw error
    }
  },
})

export const queueInvalidUploadCleanup = internalMutation({
  args: { storageId: v.id('_storage') },
  returns: v.id('assetCleanupTasks'),
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert('assetCleanupTasks', {
      storageId: args.storageId,
      status: 'cleanup-required',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const finishInvalidUploadCleanup = internalMutation({
  args: { taskId: v.id('assetCleanupTasks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.taskId)) await ctx.db.delete(args.taskId)
    return null
  },
})

export const failInvalidUploadCleanup = internalMutation({
  args: { taskId: v.id('assetCleanupTasks'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) return null
    await ctx.db.patch(task._id, {
      attempts: args.attempt,
      status: args.attempt >= MAX_ASSET_CLEANUP_ATTEMPTS ? 'terminal-failure' : 'cleanup-required',
      updatedAt: Date.now(),
    })
    return null
  },
})

export const cleanupInvalidUpload = internalAction({
  args: {
    taskId: v.id('assetCleanupTasks'),
    storageId: v.id('_storage'),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.storage.delete(args.storageId)
      await ctx.runMutation(assetsApi.assets.finishInvalidUploadCleanup, { taskId: args.taskId })
    } catch {
      await ctx.runMutation(assetsApi.assets.failInvalidUploadCleanup, {
        taskId: args.taskId,
        attempt: args.attempt,
      })
      if (args.attempt < MAX_ASSET_CLEANUP_ATTEMPTS) {
        await ctx.scheduler.runAfter(
          1_000 * 2 ** (args.attempt - 1),
          assetsApi.assets.cleanupInvalidUpload,
          { ...args, attempt: args.attempt + 1 },
        )
      }
    }
    return null
  },
})

export const registerVerifiedAsset = internalMutation({
  args: {
    ...registerAssetArgs.args,
    storageId: v.id('_storage'),
    createdBy: v.string(),
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
  handler: async (ctx, args) => await registerVerifiedAssetRecord(ctx, args),
})

export async function registerVerifiedAssetRecord(
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
    collectionId?: string
    collectionSlug?: string
    createdBy: string
  },
) {
  const { entryId, collectionId } = await validateAssetScopeRelationships(ctx, args)
  const filename = sanitizeFilename(args.filename)
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
    collectionId,
    tags: [],
    createdBy: args.createdBy,
    updatedBy: null,
    createdAt: Date.now(),
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
  })
  await logActivity(ctx, {
    kind: 'asset.uploaded',
    summary: `Uploaded asset "${filename}"`,
    appIdentityId: args.createdBy,
    entryId,
    collectionId,
    detail: { filename, mimeType: args.mimeType, scope: args.scope, sha256: args.sha256 },
  })
  return toStringId(assetId)
}

export const attachAssetsToEntry = callerMutation.protected({
  id: 'assets:attachAssetsToEntry',
  args: attachAssetsToEntryArgs.args,
  guard: canManageAssets,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const entry = await ctx.db.get(args.entryId as Id<'entries'>)
    requireRecord(entry, 'Entry')

    for (const assetId of args.assetIds) {
      const asset = await ctx.db.get(assetId as Id<'assets'>)
      if (!asset) continue
      await ctx.db.patch(asset._id, {
        scope: 'entry',
        entryId: entry._id,
        collectionId: entry.collectionId,
        updatedBy: appIdentity.userId,
        updatedAt: Date.now(),
      })
    }

    return null
  },
})

export const updateAsset = callerMutation.protected({
  id: 'assets:updateAsset',
  args: updateAssetArgs.args,
  guard: canManageAssets,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const asset = await ctx.db.get(args.assetId as Id<'assets'>)
    requireRecord(asset, 'Asset')

    if (args.filename !== undefined) {
      await assertStorageOutsidePortableExportHold(ctx, asset.storageId)
    }

    const patch: Record<string, unknown> = {
      updatedBy: appIdentity.userId,
      updatedAt: Date.now(),
    }
    if (args.alt !== undefined) patch.alt = args.alt
    if (args.caption !== undefined) patch.caption = args.caption
    if (args.filename !== undefined) patch.filename = sanitizeFilename(args.filename)
    if (args.tags !== undefined) patch.tags = normalizeTags(args.tags)
    await ctx.db.patch(asset._id, patch)

    await logActivity(ctx, {
      kind: 'asset.updated',
      summary: `Updated asset "${args.filename ?? asset.filename}"`,
      appIdentityId: appIdentity.userId,
      entryId: asset.entryId ?? null,
      collectionId: asset.collectionId ?? null,
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
  id: 'ginko-cms.move-asset',
  args: moveAssetArgs.args,
  guard: canManageAssets,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const { entryId, collectionId } = await validateAssetScopeRelationships(ctx, args)
    const asset = await ctx.db.get(args.assetId as Id<'assets'>)
    requireRecord(asset, 'Asset')

    await ctx.db.patch(asset._id, {
      scope: args.scope,
      entryId,
      collectionId,
      updatedBy: appIdentity.userId,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const getAsset = callerQuery.protected({
  id: 'assets:getAsset',
  args: getAssetArgs.args,
  guard: canRead,
  returns: v.union(assetManagerAssetValidator, v.null()),
  handler: async (ctx, args) => {
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    if (!assetId) return null
    const asset = await ctx.db.get(assetId)
    if (!asset || asset.deletedAt != null) return null
    const relationships = await loadAssetRelationships(ctx, new Set([toStringId(asset._id)]))
    return await mapAssetManagerAsset(ctx, asset, relationships)
  },
})

export const resolveAssetUrls = callerQuery.protected({
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

export const listColocatedAssets = callerQuery.protected({
  id: 'assets:listColocatedAssets',
  args: listColocatedAssetsArgs.args,
  guard: canRead,
  returns: assetColocationGroupsValidator,
  handler: async (ctx, args) => {
    const collection = await resolveCollectionForAssetScope(ctx, {
      collectionSlug: args.collectionSlug,
    })
    const entryId = args.entryId ? normalizeEntryId(ctx, args.entryId) : null
    if (entryId) {
      const entry = await ctx.db.get(entryId)
      requireRecord(entry, 'Entry')
      if (entry.collectionId !== collection._id) {
        throwCmsError('ASSET_SCOPE_INVALID', 'entryId must belong to collectionSlug.', {
          collectionSlug: args.collectionSlug,
          entryId: args.entryId ?? null,
        })
      }
    }

    const currentCollectionAssets = (
      await ctx.db
        .query('assets')
        .withIndex('by_collection', (q) => q.eq('collectionId', collection._id))
        .order('desc')
        .take(MAX_COLOCATED_GROUP_ASSETS)
    ).filter((asset) => asset.deletedAt == null)
    const globalAssets = (
      await ctx.db
        .query('assets')
        .withIndex('by_scope', (q) => q.eq('scope', 'global'))
        .order('desc')
        .take(MAX_COLOCATED_GROUP_ASSETS)
    ).filter((asset) => asset.deletedAt == null)
    const otherCollectionAssets = (
      await ctx.db
        .query('assets')
        .withIndex('by_scope', (q) => q.eq('scope', 'collection'))
        .order('desc')
        .take(MAX_COLOCATED_GROUP_ASSETS)
    ).filter((asset) => asset.deletedAt == null && asset.collectionId !== collection._id)

    const byId = new Map<string, AssetDoc>()
    for (const asset of [...currentCollectionAssets, ...globalAssets, ...otherCollectionAssets]) {
      byId.set(toStringId(asset._id), asset)
    }
    const relationships = await loadAssetRelationships(ctx, new Set(byId.keys()))
    const mapped = new Map<string, Awaited<ReturnType<typeof mapAssetManagerAsset>>>(
      await Promise.all(
        [...byId.entries()].map(
          async ([assetId, asset]) =>
            [assetId, await mapAssetManagerAsset(ctx, asset, relationships)] as const,
        ),
      ),
    )
    const mapGroup = async (assets: AssetDoc[]) =>
      assets.map((asset) => mapped.get(toStringId(asset._id))).filter((asset) => asset != null)

    return {
      entry: entryId
        ? await mapGroup(
            currentCollectionAssets.filter(
              (asset) => asset.scope === 'entry' && asset.entryId === entryId,
            ),
          )
        : [],
      collection: await mapGroup(
        currentCollectionAssets.filter((asset) => asset.scope === 'collection'),
      ),
      global: await mapGroup(globalAssets),
      otherCollections: await mapGroup(otherCollectionAssets),
    }
  },
})

export const getAssetManagerData = callerQuery.protected({
  id: 'assets:getAssetManagerData',
  args: getAssetManagerDataArgs.args,
  guard: canManageAssets,
  returns: assetManagerPageValidator,
  handler: async (ctx, args) => {
    const paginationOpts = args.paginationOpts ?? { cursor: null, numItems: 50 }
    const limit = Math.max(1, Math.min(paginationOpts.numItems ?? 50, 100))
    const search = args.search?.trim().toLowerCase() ?? ''
    const kind = args.kind ?? 'all'
    const deleted = args.deleted ?? 'all'
    const usage = args.usage ?? 'all'
    let cursor = parseCreatedAtCursor(
      paginationOpts.cursor,
      'assetsByCreatedAt',
      'Invalid asset pagination cursor.',
    ) as AssetCreatedAtCursor | null
    let nextCursor: string | null = null
    const page = []
    let scanned = 0
    const scanLimit = Math.max(limit * 10, 200)
    let exhausted = false

    while (page.length < limit && scanned < scanLimit && !exhausted) {
      const batchLimit = Math.min(ASSET_MANAGER_SCAN_BATCH_SIZE, scanLimit - scanned)
      const batch = await readAssetsByCreatedAt(ctx, cursor, batchLimit + 1)
      const hasMore = batch.length > batchLimit
      const assets = hasMore ? batch.slice(0, batchLimit) : batch
      if (!assets.length) {
        exhausted = true
        break
      }
      const assetIds = new Set(assets.map((asset) => toStringId(asset._id)))
      const relationships = await loadAssetRelationships(ctx, assetIds)

      for (const [index, asset] of assets.entries()) {
        cursor = {
          v: 1,
          kind: 'assetsByCreatedAt',
          createdAt: asset.createdAt,
          storageId: toStringId(asset.storageId),
        }
        scanned += 1
        const isDeleted = asset.deletedAt != null
        if (deleted === 'active' && isDeleted) continue
        if (deleted === 'trashed' && !isDeleted) continue
        const isImage = asset.mimeType.startsWith('image/')
        if (kind === 'image' && !isImage) continue
        if (kind === 'document' && isImage) continue
        if (search && !asset.filename.toLowerCase().includes(search)) continue

        const usages = relationships.usagesByAssetId.get(toStringId(asset._id)) ?? []
        if (usage === 'used' && usages.length === 0) continue
        if (usage === 'unused' && usages.length > 0) continue

        page.push(await mapAssetManagerAsset(ctx, asset, relationships))
        if (page.length >= limit) {
          const scannedLastKnownRow = index === assets.length - 1 && !hasMore
          nextCursor = scannedLastKnownRow ? null : encodeAssetCreatedAtCursor(asset)
          exhausted = scannedLastKnownRow
          break
        }
      }
      if (page.length >= limit) break
      exhausted = !hasMore
      nextCursor = exhausted || !cursor ? null : JSON.stringify(cursor)
    }

    return {
      page,
      isDone: exhausted,
      continueCursor: nextCursor,
    }
  },
})

export const rebuildContentAssetRefsPage = callerMutation.protected({
  id: 'assets:rebuildContentAssetRefsPage',
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  guard: canManageAssets,
  returns: v.object({
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
    processed: v.number(),
  }),
  handler: async (ctx, args) => {
    const pageSize = Math.max(1, Math.min(args.numItems, 100))
    const cursor = parseCreatedAtCursor(
      args.cursor,
      'entriesByCreatedAt',
      'Cursor no longer points to an entry',
    ) as EntryCreatedAtCursor | null
    const rows = await readEntriesByCreatedAt(ctx, cursor, pageSize + 1)
    const isDone = rows.length <= pageSize
    const page = isDone ? rows : rows.slice(0, pageSize)

    for (const entry of page) {
      const collectionDoc = await ctx.db.get(entry.collectionId)
      if (!collectionDoc) continue
      const collection = await getCollection(ctx, collectionDoc.slug)
      if (!collection) continue
      await rebuildContentAssetRefsForEntry(ctx, entry._id, collection)
    }

    return {
      continueCursor:
        isDone || page.length === 0 ? null : encodeEntryCreatedAtCursor(page[page.length - 1]!),
      isDone,
      processed: page.length,
    }
  },
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
    const asset = await ctx.db.get(args.assetId as Id<'assets'>)
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
    const { usagesByAssetId } = await loadAssetRelationships(ctx, new Set([args.assetId]))
    const usageCount = usagesByAssetId.get(args.assetId)?.length ?? 0
    return buildPreview({
      summary: `Will move asset "${asset.filename}" to trash.`,
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
          kind: 'asset-usages',
          summary: 'Content references affected',
          count: usageCount,
        }),
      ],
      details: { assetId: args.assetId, filename: asset.filename, usageCount },
      confirm: {
        operationId: 'ginko-cms.delete-asset',
        args,
        effect: {
          assetId: args.assetId,
          filename: asset.filename,
          usageCount,
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
    const { usagesByAssetId } = await loadAssetRelationships(ctx, new Set([args.assetId]))
    const usageCount = usagesByAssetId.get(args.assetId)?.length ?? 0
    if (usageCount > 0 && !args.force) {
      throwCmsError('ASSET_IN_USE', 'Cannot move an in-use asset to trash without force', {
        assetId: args.assetId,
        usageCount,
      })
    }
    await ctx.db.patch(asset._id, {
      deletedAt: Date.now(),
      deletedBy: appIdentity.userId,
      updatedBy: appIdentity.userId,
      updatedAt: Date.now(),
    })

    await logActivity(ctx, {
      kind: 'asset.trashed',
      summary: `Moved asset "${asset.filename}" to trash`,
      appIdentityId: appIdentity.userId,
      entryId: asset.entryId ?? null,
      collectionId: asset.collectionId ?? null,
      detail: { filename: asset.filename },
    })

    return null
  },
})

export const deleteAssetOperationExecute = callerMutation.protected(deleteAssetOperation)
export const previewDeleteAssetOperation = callerMutation.protected(
  Object.assign(definePreview(deleteAssetOperation), {
    id: 'assets:previewDeleteAssetOperation',
  }),
)

export const restoreAsset = callerMutation.protected({
  id: 'assets:restoreAsset',
  args: { assetId: v.string() },
  guard: canManageAssets,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const asset = await ctx.db.get(args.assetId as Id<'assets'>)
    if (!asset) return null
    await ctx.db.patch(asset._id, {
      deletedAt: null,
      deletedBy: null,
      updatedBy: appIdentity.userId,
      updatedAt: Date.now(),
    })

    await logActivity(ctx, {
      kind: 'asset.restored',
      summary: `Restored asset "${asset.filename}"`,
      appIdentityId: appIdentity.userId,
      entryId: asset.entryId ?? null,
      collectionId: asset.collectionId ?? null,
      detail: { filename: asset.filename },
    })

    return null
  },
})

export const purgeAssetOperation = defineCmsOperation({
  id: 'ginko-cms.purge-asset',
  kind: 'destructive',
  executeFunctionRef: 'assets:purgeAsset',
  args: purgeAssetArgs,
  guard: canManageAssets,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId as Id<'assets'>)
    return { asset }
  },
  preview: async (ctx, args, { asset }) => {
    if (!asset) {
      return blockedPreview({
        summary: 'Asset not found.',
        blockers: [operationIssue({ code: 'asset-not-found', message: 'Asset not found.' })],
        confirm: { operationId: 'ginko-cms.purge-asset', args },
      })
    }

    try {
      await assertBackupArtifactCoversPurge(ctx, args.exportArtifactId, {
        scope: 'asset',
        assetId: args.assetId,
      })
    } catch (error) {
      return blockedPreview({
        summary: `Cannot permanently delete asset "${asset.filename}" until the backup requirement passes.`,
        blockers: [cmsErrorOperationIssue(error)],
        details: { assetId: args.assetId, filename: asset.filename },
        confirm: { operationId: 'ginko-cms.purge-asset', args },
        version: {
          updatedAt: asset.updatedAt,
          deletedAt: asset.deletedAt ?? null,
        },
      })
    }

    const { usagesByAssetId } = await loadAssetRelationships(ctx, new Set([args.assetId]))
    const usageCount = usagesByAssetId.get(args.assetId)?.length ?? 0
    if (usageCount > 0 && args.force !== true) {
      return blockedPreview({
        summary: `Asset "${asset.filename}" is still referenced.`,
        blockers: [
          operationIssue({
            code: 'asset-in-use',
            message: 'Referenced assets cannot be permanently deleted.',
          }),
        ],
        effects: [
          operationEffect({
            kind: 'asset-usages',
            summary: 'Content references affected',
            count: usageCount,
          }),
        ],
        details: { assetId: args.assetId, filename: asset.filename, usageCount },
        confirm: {
          operationId: 'ginko-cms.purge-asset',
          args,
          effect: {
            assetId: args.assetId,
            filename: asset.filename,
            usageCount,
          },
        },
        version: {
          updatedAt: asset.updatedAt,
          deletedAt: asset.deletedAt ?? null,
        },
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
        operationEffect({
          kind: 'assets',
          summary: 'Assets permanently deleted',
          count: 1,
        }),
        operationEffect({
          kind: 'asset-usages',
          summary: 'Content references deleted',
          count: usageCount,
        }),
      ],
      details: { assetId: args.assetId, filename: asset.filename, usageCount },
      confirm: {
        operationId: 'ginko-cms.purge-asset',
        args,
        effect: {
          assetId: args.assetId,
          filename: asset.filename,
          usageCount,
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
    await assertBackupArtifactCoversPurge(ctx, args.exportArtifactId, {
      scope: 'asset',
      assetId: args.assetId,
    })
    const { usagesByAssetId } = await loadAssetRelationships(ctx, new Set([args.assetId]))
    const usageCount = usagesByAssetId.get(args.assetId)?.length ?? 0
    if (usageCount > 0) {
      throwCmsError('ASSET_IN_USE', 'Referenced assets cannot be permanently deleted', {
        assetId: args.assetId,
        usageCount,
      })
    }
    await ctx.storage.delete(asset.storageId)
    await deleteAssetReferenceRows(ctx, args.assetId)
    await ctx.db.delete(asset._id)

    await logActivity(ctx, {
      kind: 'asset.deleted',
      summary: `Deleted asset "${asset.filename}" permanently`,
      appIdentityId: appIdentity.userId,
      entryId: asset.entryId ?? null,
      collectionId: asset.collectionId ?? null,
      detail: { filename: asset.filename },
    })

    return null
  },
})

export const purgeAsset = callerMutation.protected(purgeAssetOperation)

export const previewPurgeAssetOperation = callerMutation.protected(
  Object.assign(definePreview(purgeAssetOperation), {
    id: 'assets:previewPurgeAssetOperation',
  }),
)
