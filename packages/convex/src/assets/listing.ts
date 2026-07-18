import type { Doc, Id } from '../_generated/dataModel.js'
import {
  readAssetReferenceProofSnapshot,
  type AssetReferenceProofSnapshot,
} from '../entries/assetReferenceProof.js'
import { throwCmsError } from '../errors.js'
import { toOptionalStringId, toStringId } from '../lib/ids.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import { hashValue } from '../operationHelpers.js'
import {
  assetOwnerPathFromMeta,
  loadAssetCollectionMetadata,
  loadAssetOwnerMetadata,
  readAssetReferenceFlags,
  type AssetOwnerMetadata,
} from './relationships.js'
import { assetTagSearchToken } from './scope.js'

type AssetDoc = Doc<'assets'>
type AssetRefDoc = Doc<'contentAssetRefs'>

type AssetIndexCursor = {
  v: 1
  kind: 'asset-index'
  scope: string
  assetId: string
}

type AssetManagerCursor = {
  v: 2
  kind: 'asset-manager'
  queryHash: string
  resultHash: string
  asOf: number
  assetId: string
}

type AssetUsageCursor = {
  v: 1
  kind: 'asset-usage'
  assetId: string
  referenceId: string
}

const MAX_ASSET_DISCOVERY_ROWS = 500

type AssetReferenceCertainty = {
  state: 'used' | 'unused-verified' | 'unknown-stale'
  proofCurrent: boolean
  canonicalGeneration: number
  verifiedRunId: string | null
  verifiedAt: number | null
}

export type AssetManagerFilters = {
  search: string
  kind: 'all' | 'image' | 'document'
  deleted: 'active' | 'trashed' | 'all'
  usage: 'all' | 'used' | 'unused-verified' | 'unknown-stale'
  time: 'any' | '24h' | '7d' | '30d' | '90d'
  size: 'any' | 'small' | 'medium' | 'large'
  tag: string
  sort: 'name' | 'date' | 'size' | 'kind'
  location: 'all' | 'global' | 'collection' | 'entry' | 'accessible'
  collection: string | null
  entryId: string | null
  paginationOpts: { cursor: string | null; numItems: number }
}

async function mapAssetManagerAsset(
  ctx: QueryOrMutationCtx,
  asset: AssetDoc,
  ownerMetadata: AssetOwnerMetadata,
  referenceCertainty: AssetReferenceCertainty,
) {
  const collection = asset.collection ?? null
  const entryId = toOptionalStringId(asset.entryId)
  const collectionMeta = collection ? ownerMetadata.collectionBySlug.get(collection) : null
  const entryMeta = entryId ? ownerMetadata.entryById.get(entryId) : null
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
    collection: collectionMeta?.slug ?? entryMeta?.collection ?? collection,
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
    referenceCertainty,
  }
}

export function boundedPaginationOpts(
  paginationOpts: { cursor: string | null; numItems: number } | undefined,
  defaults: { numItems: number; maxItems: number },
) {
  return {
    cursor: paginationOpts?.cursor ?? null,
    numItems: Math.max(
      1,
      Math.min(Math.floor(paginationOpts?.numItems ?? defaults.numItems), defaults.maxItems),
    ),
  }
}

function invalidCursor(message: string): never {
  throwCmsError('INVALID_CURSOR', message)
}

function parseCursor(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return invalidCursor('Asset pagination cursor is invalid.')
  }
}

async function loadAssetCursorAnchor(
  ctx: QueryOrMutationCtx,
  value: string | null,
  expected: { kind: AssetIndexCursor['kind']; scope: string },
) {
  const parsed = parseCursor(value)
  if (parsed === null) return null
  const cursor = parsed as Partial<AssetIndexCursor>
  if (
    cursor.v !== 1 ||
    cursor.kind !== expected.kind ||
    cursor.scope !== expected.scope ||
    typeof cursor.assetId !== 'string'
  ) {
    return invalidCursor('Asset pagination cursor does not match this query.')
  }
  const assetId = ctx.db.normalizeId('assets', cursor.assetId)
  const asset = assetId ? await ctx.db.get(assetId) : null
  if (!asset) return invalidCursor('Asset pagination cursor is stale.')
  return asset
}

function encodeAssetCursor(kind: AssetIndexCursor['kind'], scope: string, asset: AssetDoc) {
  return JSON.stringify({
    v: 1,
    kind,
    scope,
    assetId: toStringId(asset._id),
  } satisfies AssetIndexCursor)
}

async function readDescendingAssetIndexPage(
  ctx: QueryOrMutationCtx,
  args: {
    scope: string
    cursor: string | null
    limit: number
    initial: (take: number) => Promise<AssetDoc[]>
    sameStorage: (anchor: AssetDoc, take: number) => Promise<AssetDoc[]>
    sameCreatedAt: (anchor: AssetDoc, take: number) => Promise<AssetDoc[]>
    older: (anchor: AssetDoc, take: number) => Promise<AssetDoc[]>
  },
) {
  const take = args.limit + 1
  const anchor = await loadAssetCursorAnchor(ctx, args.cursor, {
    kind: 'asset-index',
    scope: args.scope,
  })
  const rows: AssetDoc[] = []
  const append = async (read: (take: number) => Promise<AssetDoc[]>) => {
    if (rows.length >= take) return
    rows.push(...(await read(take - rows.length)))
  }
  if (!anchor) {
    await append(args.initial)
  } else {
    await append((remaining) => args.sameStorage(anchor, remaining))
    await append((remaining) => args.sameCreatedAt(anchor, remaining))
    await append((remaining) => args.older(anchor, remaining))
  }
  const page = rows.slice(0, args.limit)
  const last = page.at(-1)
  const isDone = rows.length <= args.limit
  return {
    page,
    isDone,
    continueCursor: last ? encodeAssetCursor('asset-index', args.scope, last) : '',
  }
}

function certaintyForAsset(
  assetId: string,
  hasDerivedReference: boolean,
  proof: AssetReferenceProofSnapshot,
): AssetReferenceCertainty {
  const used = hasDerivedReference || (proof.current && proof.referencedAssetIds.has(assetId))
  return {
    state: used ? 'used' : proof.current ? 'unused-verified' : 'unknown-stale',
    proofCurrent: proof.current,
    canonicalGeneration: proof.canonicalGeneration,
    verifiedRunId: proof.verifiedRunId,
    verifiedAt: proof.verifiedAt,
  }
}

async function readReferenceCertainties(
  ctx: QueryOrMutationCtx,
  assets: AssetDoc[],
  knownProof?: AssetReferenceProofSnapshot,
) {
  const proof = knownProof ?? (await readAssetReferenceProofSnapshot(ctx))
  const assetIds = assets.map((asset) => toStringId(asset._id))
  const referenceFlags = await readAssetReferenceFlags(ctx, assetIds)
  return new Map(
    assetIds.map((assetId) => [
      assetId,
      certaintyForAsset(assetId, referenceFlags.get(assetId) ?? false, proof),
    ]),
  )
}

export async function mapAsset(ctx: QueryOrMutationCtx, asset: AssetDoc) {
  const ownerMetadata = await loadAssetOwnerMetadata(ctx, [asset])
  const certainties = await readReferenceCertainties(ctx, [asset])
  return await mapAssetManagerAsset(
    ctx,
    asset,
    ownerMetadata,
    certainties.get(toStringId(asset._id))!,
  )
}

export async function mapAssetPage(
  ctx: QueryOrMutationCtx,
  result: { page: AssetDoc[]; isDone: boolean; continueCursor: string },
) {
  const ownerMetadata = await loadAssetOwnerMetadata(ctx, result.page)
  const certainties = await readReferenceCertainties(ctx, result.page)
  return {
    page: await Promise.all(
      result.page.map((asset) =>
        mapAssetManagerAsset(ctx, asset, ownerMetadata, certainties.get(toStringId(asset._id))!),
      ),
    ),
    isDone: result.isDone,
    continueCursor: result.isDone ? null : result.continueCursor,
  }
}

function asManagerCursor(value: unknown): AssetManagerCursor | null {
  if (value === null) return null
  if (typeof value !== 'object') return invalidCursor('Asset manager cursor is invalid.')
  const v = Reflect.get(value, 'v')
  const kind = Reflect.get(value, 'kind')
  const queryHash = Reflect.get(value, 'queryHash')
  const resultHash = Reflect.get(value, 'resultHash')
  const asOf = Reflect.get(value, 'asOf')
  const assetId = Reflect.get(value, 'assetId')
  if (
    v !== 2 ||
    kind !== 'asset-manager' ||
    typeof queryHash !== 'string' ||
    typeof resultHash !== 'string' ||
    typeof asOf !== 'number' ||
    typeof assetId !== 'string'
  ) {
    return invalidCursor('Asset manager cursor is invalid.')
  }
  return { v, kind, queryHash, resultHash, asOf, assetId }
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareAssets(left: AssetDoc, right: AssetDoc, sort: AssetManagerFilters['sort']) {
  let comparison = 0
  if (sort === 'name') comparison = compareText(left.filenameSort, right.filenameSort)
  if (sort === 'date') comparison = right.effectiveUpdatedAt - left.effectiveUpdatedAt
  if (sort === 'size') comparison = right.size - left.size
  if (sort === 'kind') {
    comparison = compareText(left.kind, right.kind)
    if (comparison === 0) comparison = compareText(left.filenameSort, right.filenameSort)
  }
  return comparison || compareText(toStringId(left._id), toStringId(right._id))
}

function matchesLocation(asset: AssetDoc, args: AssetManagerFilters) {
  if (args.location === 'all') return true
  if (args.location === 'global') return asset.scope === 'global'
  if (args.location === 'collection') return asset.collection === args.collection
  if (args.location === 'entry') return toOptionalStringId(asset.entryId) === args.entryId
  return (
    asset.scope === 'global' ||
    (asset.scope === 'collection' && asset.collection === args.collection) ||
    (asset.scope === 'entry' && toOptionalStringId(asset.entryId) === args.entryId)
  )
}

function matchesTime(asset: AssetDoc, time: AssetManagerFilters['time'], asOf: number) {
  if (time === 'any') return true
  const windows = {
    '24h': 86_400_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000,
    '90d': 7_776_000_000,
  }
  return asset.createdAt >= asOf - windows[time]
}

function matchesSize(asset: AssetDoc, size: AssetManagerFilters['size']) {
  if (size === 'any') return true
  if (size === 'small') return asset.size < 102_400
  if (size === 'medium') return asset.size >= 102_400 && asset.size < 1_048_576
  return asset.size >= 1_048_576
}

async function readAllDiscoveryAssets(ctx: QueryOrMutationCtx, sort: AssetManagerFilters['sort']) {
  const limit = MAX_ASSET_DISCOVERY_ROWS + 1
  const rows =
    sort === 'date'
      ? await ctx.db.query('assets').withIndex('by_effective_updated').order('desc').take(limit)
      : sort === 'size'
        ? await ctx.db.query('assets').withIndex('by_size').order('desc').take(limit)
        : sort === 'kind'
          ? await ctx.db.query('assets').withIndex('by_kind_filename').order('asc').take(limit)
          : await ctx.db.query('assets').withIndex('by_filename').order('asc').take(limit)
  if (rows.length > MAX_ASSET_DISCOVERY_ROWS) {
    throwCmsError(
      'ASSET_DISCOVERY_LIMIT_EXCEEDED',
      `Studio asset discovery supports at most ${MAX_ASSET_DISCOVERY_ROWS} assets.`,
      { supportedAssets: MAX_ASSET_DISCOVERY_ROWS },
    )
  }
  return rows
}

async function readIndexedDiscoveryCandidates(
  ctx: QueryOrMutationCtx,
  args: AssetManagerFilters,
  allAssets: AssetDoc[],
) {
  const indexedSearch = args.search || (args.tag ? assetTagSearchToken(args.tag) : '')
  if (!indexedSearch) return allAssets
  return await ctx.db
    .query('assets')
    .withSearchIndex('search_discovery', (query) => {
      let indexed = query.search('discoveryText', indexedSearch)
      if (args.kind !== 'all') indexed = indexed.eq('kind', args.kind)
      if (args.deleted !== 'all') indexed = indexed.eq('deletedState', args.deleted)
      if (args.location === 'global') indexed = indexed.eq('scope', 'global')
      if (args.location === 'collection' && args.collection) {
        indexed = indexed.eq('collection', args.collection)
      }
      return indexed
    })
    .take(MAX_ASSET_DISCOVERY_ROWS)
}

function buildAssetFacets(
  allAssets: AssetDoc[],
  collectionMetadata: AssetOwnerMetadata['collectionBySlug'],
) {
  const active = allAssets.filter((asset) => asset.deletedState === 'active')
  const collectionCounts = new Map<string, number>()
  const tagCounts = new Map<string, number>()
  for (const asset of active) {
    if (asset.collection) {
      collectionCounts.set(asset.collection, (collectionCounts.get(asset.collection) ?? 0) + 1)
    }
    for (const tag of asset.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  return {
    activeCount: active.length,
    trashedCount: allAssets.length - active.length,
    globalActiveCount: active.filter((asset) => asset.scope === 'global').length,
    collections: [...collectionCounts]
      .map(([key, count]) => ({
        key,
        label: collectionMetadata.get(key)?.label ?? key,
        count,
      }))
      .sort((left, right) => compareText(left.label, right.label)),
    tags: [...tagCounts]
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => compareText(left.key, right.key)),
  }
}

export async function readAssetManagerPage(ctx: QueryOrMutationCtx, args: AssetManagerFilters) {
  const parsed = asManagerCursor(parseCursor(args.paginationOpts.cursor))
  const queryHash = await hashValue({
    search: args.search,
    kind: args.kind,
    deleted: args.deleted,
    usage: args.usage,
    time: args.time,
    size: args.size,
    tag: args.tag,
    sort: args.sort,
    location: args.location,
    collection: args.collection,
    entryId: args.entryId,
  })
  if (parsed && parsed.queryHash !== queryHash) {
    return invalidCursor('Asset manager cursor does not match this query.')
  }
  const asOf = parsed?.asOf ?? Date.now()
  const allAssets = await readAllDiscoveryAssets(ctx, args.sort)
  const collectionMetadata = await loadAssetCollectionMetadata(ctx, allAssets)
  const sourceRows = await readIndexedDiscoveryCandidates(ctx, args, allAssets)
  const tag = args.tag.trim().toLowerCase()
  let rows = sourceRows.filter(
    (asset) =>
      (args.kind === 'all' || asset.kind === args.kind) &&
      (args.deleted === 'all' || asset.deletedState === args.deleted) &&
      matchesLocation(asset, args) &&
      matchesTime(asset, args.time, asOf) &&
      matchesSize(asset, args.size) &&
      (!tag || (asset.tags ?? []).includes(tag)),
  )
  const proof = await readAssetReferenceProofSnapshot(ctx)
  let certainties: Map<string, AssetReferenceCertainty> | null = null
  if (args.usage !== 'all') {
    certainties = await readReferenceCertainties(ctx, rows, proof)
    rows = rows.filter((asset) => certainties!.get(toStringId(asset._id))?.state === args.usage)
  }
  rows.sort((left, right) => compareAssets(left, right, args.sort))
  const resultHash = await hashValue(rows.map((asset) => toStringId(asset._id)))
  if (parsed && parsed.resultHash !== resultHash) {
    return invalidCursor('Asset manager cursor is stale because the result set changed.')
  }
  const anchorIndex = parsed
    ? rows.findIndex((asset) => toStringId(asset._id) === parsed.assetId)
    : -1
  if (parsed && anchorIndex < 0) return invalidCursor('Asset manager cursor is stale.')
  const start = anchorIndex + 1
  const page = rows.slice(start, start + args.paginationOpts.numItems)
  const isDone = start + page.length >= rows.length
  if (!certainties) certainties = await readReferenceCertainties(ctx, page, proof)
  const ownerMetadata = await loadAssetOwnerMetadata(ctx, page)
  const mappedPage = await Promise.all(
    page.map((asset) =>
      mapAssetManagerAsset(ctx, asset, ownerMetadata, certainties!.get(toStringId(asset._id))!),
    ),
  )
  const last = page.at(-1)
  return {
    page: mappedPage,
    isDone,
    continueCursor:
      isDone || !last
        ? null
        : JSON.stringify({
            v: 2,
            kind: 'asset-manager',
            queryHash,
            resultHash,
            asOf,
            assetId: toStringId(last._id),
          } satisfies AssetManagerCursor),
    facets: buildAssetFacets(allAssets, collectionMetadata),
  }
}

export async function readAssetsByOwnerSourcePage(
  ctx: QueryOrMutationCtx,
  args: {
    scope: 'global' | 'collection' | 'entry'
    collection: string | null
    entryId: Id<'entries'> | null
    paginationOpts: { cursor: string | null; numItems: number }
  },
) {
  const scope = `owner:${args.scope}:${args.collection ?? ''}:${args.entryId ?? ''}`
  const common = {
    scope,
    cursor: args.paginationOpts.cursor,
    limit: args.paginationOpts.numItems,
  }
  if (args.scope === 'global') {
    const base = () =>
      ctx.db
        .query('assets')
        .withIndex('by_scope_deleted_created_storage', (query) =>
          query.eq('scope', 'global').eq('deletedAt', null),
        )
        .order('desc')
    return await readDescendingAssetIndexPage(ctx, {
      ...common,
      initial: async (take) => await base().take(take),
      sameStorage: async (anchor, take) =>
        await ctx.db
          .query('assets')
          .withIndex('by_scope_deleted_created_storage', (query) =>
            query
              .eq('scope', 'global')
              .eq('deletedAt', null)
              .eq('createdAt', anchor.createdAt)
              .eq('storageId', anchor.storageId)
              .lt('_creationTime', anchor._creationTime),
          )
          .order('desc')
          .take(take),
      sameCreatedAt: async (anchor, take) =>
        await ctx.db
          .query('assets')
          .withIndex('by_scope_deleted_created_storage', (query) =>
            query
              .eq('scope', 'global')
              .eq('deletedAt', null)
              .eq('createdAt', anchor.createdAt)
              .lt('storageId', anchor.storageId),
          )
          .order('desc')
          .take(take),
      older: async (anchor, take) =>
        await ctx.db
          .query('assets')
          .withIndex('by_scope_deleted_created_storage', (query) =>
            query.eq('scope', 'global').eq('deletedAt', null).lt('createdAt', anchor.createdAt),
          )
          .order('desc')
          .take(take),
    })
  }
  if (args.scope === 'collection') {
    if (!args.collection) throw new Error('Validated collection asset scope is missing collection.')
    return await readDescendingAssetIndexPage(ctx, {
      ...common,
      initial: async (take) =>
        await ctx.db
          .query('assets')
          .withIndex('by_scope_collection_deleted_created_storage', (query) =>
            query.eq('scope', 'collection').eq('collection', args.collection).eq('deletedAt', null),
          )
          .order('desc')
          .take(take),
      sameStorage: async (anchor, take) =>
        await ctx.db
          .query('assets')
          .withIndex('by_scope_collection_deleted_created_storage', (query) =>
            query
              .eq('scope', 'collection')
              .eq('collection', args.collection)
              .eq('deletedAt', null)
              .eq('createdAt', anchor.createdAt)
              .eq('storageId', anchor.storageId)
              .lt('_creationTime', anchor._creationTime),
          )
          .order('desc')
          .take(take),
      sameCreatedAt: async (anchor, take) =>
        await ctx.db
          .query('assets')
          .withIndex('by_scope_collection_deleted_created_storage', (query) =>
            query
              .eq('scope', 'collection')
              .eq('collection', args.collection)
              .eq('deletedAt', null)
              .eq('createdAt', anchor.createdAt)
              .lt('storageId', anchor.storageId),
          )
          .order('desc')
          .take(take),
      older: async (anchor, take) =>
        await ctx.db
          .query('assets')
          .withIndex('by_scope_collection_deleted_created_storage', (query) =>
            query
              .eq('scope', 'collection')
              .eq('collection', args.collection)
              .eq('deletedAt', null)
              .lt('createdAt', anchor.createdAt),
          )
          .order('desc')
          .take(take),
    })
  }
  if (!args.entryId) throw new Error('Validated entry asset scope is missing entryId.')
  return await readDescendingAssetIndexPage(ctx, {
    ...common,
    initial: async (take) =>
      await ctx.db
        .query('assets')
        .withIndex('by_scope_entry_deleted_created_storage', (query) =>
          query.eq('scope', 'entry').eq('entryId', args.entryId).eq('deletedAt', null),
        )
        .order('desc')
        .take(take),
    sameStorage: async (anchor, take) =>
      await ctx.db
        .query('assets')
        .withIndex('by_scope_entry_deleted_created_storage', (query) =>
          query
            .eq('scope', 'entry')
            .eq('entryId', args.entryId)
            .eq('deletedAt', null)
            .eq('createdAt', anchor.createdAt)
            .eq('storageId', anchor.storageId)
            .lt('_creationTime', anchor._creationTime),
        )
        .order('desc')
        .take(take),
    sameCreatedAt: async (anchor, take) =>
      await ctx.db
        .query('assets')
        .withIndex('by_scope_entry_deleted_created_storage', (query) =>
          query
            .eq('scope', 'entry')
            .eq('entryId', args.entryId)
            .eq('deletedAt', null)
            .eq('createdAt', anchor.createdAt)
            .lt('storageId', anchor.storageId),
        )
        .order('desc')
        .take(take),
    older: async (anchor, take) =>
      await ctx.db
        .query('assets')
        .withIndex('by_scope_entry_deleted_created_storage', (query) =>
          query
            .eq('scope', 'entry')
            .eq('entryId', args.entryId)
            .eq('deletedAt', null)
            .lt('createdAt', anchor.createdAt),
        )
        .order('desc')
        .take(take),
  })
}

export async function readAssetUsageSourcePage(
  ctx: QueryOrMutationCtx,
  args: { assetId: string; cursor: string | null; limit: number },
) {
  const parsed = parseCursor(args.cursor)
  let anchor: AssetRefDoc | null = null
  if (parsed !== null) {
    const cursor = parsed as Partial<AssetUsageCursor>
    if (
      cursor.v !== 1 ||
      cursor.kind !== 'asset-usage' ||
      cursor.assetId !== args.assetId ||
      typeof cursor.referenceId !== 'string'
    ) {
      return invalidCursor('Asset usage cursor does not match this asset.')
    }
    const referenceId = ctx.db.normalizeId('contentAssetRefs', cursor.referenceId)
    anchor = referenceId ? await ctx.db.get(referenceId) : null
    if (!anchor || anchor.assetId !== args.assetId) {
      return invalidCursor('Asset usage cursor is stale.')
    }
  }
  const take = args.limit + 1
  const rows: AssetRefDoc[] = []
  if (!anchor) {
    rows.push(
      ...(await ctx.db
        .query('contentAssetRefs')
        .withIndex('by_asset_source', (query) => query.eq('assetId', args.assetId))
        .order('asc')
        .take(take)),
    )
  } else {
    rows.push(
      ...(await ctx.db
        .query('contentAssetRefs')
        .withIndex('by_asset_source', (query) =>
          query
            .eq('assetId', args.assetId)
            .eq('sourceKind', anchor.sourceKind)
            .gt('_creationTime', anchor._creationTime),
        )
        .order('asc')
        .take(take)),
    )
    if (rows.length < take) {
      rows.push(
        ...(await ctx.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (query) =>
            query.eq('assetId', args.assetId).gt('sourceKind', anchor.sourceKind),
          )
          .order('asc')
          .take(take - rows.length)),
      )
    }
  }
  const page = rows.slice(0, args.limit)
  const last = page.at(-1)
  const isDone = rows.length <= args.limit
  return {
    page,
    isDone,
    continueCursor: last
      ? JSON.stringify({
          v: 1,
          kind: 'asset-usage',
          assetId: args.assetId,
          referenceId: toStringId(last._id),
        } satisfies AssetUsageCursor)
      : null,
  }
}
