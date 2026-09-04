/** Transactional writer for the rebuildable public projection. */

import type { GinkoPublicAssetFact } from '@lupinum/ginko-cms-contract/shared/publicContent.js'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import {
  assertConvexDocumentWithinLimit,
  assertPublicPayloadWithinLimit,
  boundedSearchText,
  MAX_PUBLIC_LIST_PAYLOAD_BYTES,
  MAX_PUBLIC_SEARCH_DOCUMENT_BYTES,
  MAX_PUBLIC_STRUCTURAL_BYTES,
  PUBLIC_SEARCH_SHARD_COUNT,
} from '../../lib/contentLimits.js'
import type { MutationCtx, QueryCtx } from '../../lib/types.js'
import { assertCollectionOutsidePortableExportLease } from '../../portability/lease.js'
import { stableHash } from './hashing.js'
import { bumpRouteGeneration } from './routeGeneration.js'

export type PublicEntryDoc = Doc<'publicEntries'>

export interface PublicProjectionInput {
  entryId: Id<'entries'>
  collection: string
  locale: string
  revisionId: Id<'entryRevisions'>
  stableId: string
  parentEntryId: Id<'entries'> | null
  orderKey: string
  slug: string
  title: string
  description?: string | null
  data: JsonObject
  searchText?: string
  cacheTags?: string[]
  assetFacts: GinkoPublicAssetFact[]
  navIncluded?: boolean
  sitemapIncluded?: boolean
  searchIncluded?: boolean
  entryCreatedAt: number
  firstPublishedAt: number
  lastPublishedAt: number
}

export function buildPublicProjectionPayload(input: PublicProjectionInput) {
  const structural = {
    entryId: input.entryId,
    collection: input.collection,
    locale: input.locale,
    revisionId: input.revisionId,
    stableId: input.stableId,
    parentEntryId: input.parentEntryId,
    orderKey: input.orderKey,
    slug: input.slug,
    title: input.title,
    description: input.description ?? null,
    navIncluded: input.navIncluded ?? true,
    sitemapIncluded: input.sitemapIncluded ?? true,
    entryCreatedAt: input.entryCreatedAt,
    firstPublishedAt: input.firstPublishedAt,
    lastPublishedAt: input.lastPublishedAt,
  }
  assertConvexDocumentWithinLimit(structural, {
    code: 'PUBLIC_PROJECTION_TOO_LARGE',
    label: 'Public structural projection',
    entryId: String(input.entryId),
    locale: input.locale,
    maxBytes: MAX_PUBLIC_STRUCTURAL_BYTES,
  })
  const payloadFields = {
    data: input.data,
    cacheTags: input.cacheTags ?? [],
    assetFacts: input.assetFacts,
  }
  assertPublicPayloadWithinLimit(
    {
      entryId: input.entryId,
      collection: input.collection,
      locale: input.locale,
      revisionId: input.revisionId,
      ...payloadFields,
    },
    {
      entryId: String(input.entryId),
      locale: input.locale,
    },
  )
  const publicEntry = {
    ...structural,
    ...payloadFields,
  }
  assertConvexDocumentWithinLimit(publicEntry, {
    code: 'PUBLIC_PROJECTION_TOO_LARGE',
    label: 'Public projection',
    entryId: String(input.entryId),
    locale: input.locale,
    maxBytes: MAX_PUBLIC_STRUCTURAL_BYTES + MAX_PUBLIC_LIST_PAYLOAD_BYTES,
  })
  return publicEntry
}

export function buildPublicSearchProjectionPayload(input: PublicProjectionInput) {
  const searchShard =
    Number.parseInt(stableHash([String(input.entryId), input.locale]), 16) %
    PUBLIC_SEARCH_SHARD_COUNT
  return {
    entryId: input.entryId,
    collection: input.collection,
    locale: input.locale,
    revisionId: input.revisionId,
    stableId: input.stableId,
    searchShard,
    searchText: boundedSearchText(
      [input.title, input.slug, input.stableId, input.searchText ?? ''].filter(Boolean).join(' '),
    ),
    lastPublishedAt: input.lastPublishedAt,
  }
}

export function buildCheckedPublicProjectionDocuments(input: PublicProjectionInput) {
  const publicEntry = buildPublicProjectionPayload(input)
  const search = input.searchIncluded === false ? null : buildPublicSearchProjectionPayload(input)
  if (search) {
    assertConvexDocumentWithinLimit(search, {
      code: 'PUBLIC_SEARCH_PROJECTION_TOO_LARGE',
      label: 'Public search projection',
      entryId: String(input.entryId),
      locale: input.locale,
      maxBytes: MAX_PUBLIC_SEARCH_DOCUMENT_BYTES,
    })
  }
  return { publicEntry, search }
}

export async function upsertPublicProjection(
  ctx: MutationCtx,
  input: PublicProjectionInput,
): Promise<void> {
  await assertCollectionOutsidePortableExportLease(ctx, input.collection)
  const existing = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', input.entryId).eq('locale', input.locale))
    .unique()
  const documents = buildCheckedPublicProjectionDocuments(input)
  if (existing) await ctx.db.replace(existing._id, documents.publicEntry)
  else await ctx.db.insert('publicEntries', documents.publicEntry)

  const existingSearch = await ctx.db
    .query('publicSearchEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', input.entryId).eq('locale', input.locale))
    .unique()
  if (input.searchIncluded === false) {
    if (existingSearch) await ctx.db.delete(existingSearch._id)
  } else {
    const searchPayload = documents.search!
    if (existingSearch) await ctx.db.replace(existingSearch._id, searchPayload)
    else await ctx.db.insert('publicSearchEntries', searchPayload)
  }
  await bumpRouteGeneration(ctx, input.collection, input.locale, input.lastPublishedAt)
}

export async function deletePublicProjection(
  ctx: MutationCtx,
  args: { entryId: Id<'entries'>; locale: string },
): Promise<void> {
  const row = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entryId).eq('locale', args.locale))
    .unique()
  const searchRow = await ctx.db
    .query('publicSearchEntries')
    .withIndex('by_entry_locale', (query) =>
      query.eq('entryId', args.entryId).eq('locale', args.locale),
    )
    .unique()
  const collection = row?.collection ?? searchRow?.collection
  if (!collection) return
  await assertCollectionOutsidePortableExportLease(ctx, collection)
  if (row) await ctx.db.delete(row._id)
  if (searchRow) await ctx.db.delete(searchRow._id)
  await bumpRouteGeneration(ctx, collection, args.locale)
}

export async function deleteAllPublicProjections(
  ctx: MutationCtx,
  entryId: Id<'entries'>,
): Promise<string[]> {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
    .collect()
  const searchRows = await ctx.db
    .query('publicSearchEntries')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entryId))
    .collect()
  const allRows = [...rows, ...searchRows]
  if (allRows[0]) await assertCollectionOutsidePortableExportLease(ctx, allRows[0].collection)
  for (const row of allRows) await ctx.db.delete(row._id)
  const scopes = new Map(allRows.map((row) => [`${row.collection}\0${row.locale}`, row]))
  for (const row of scopes.values()) await bumpRouteGeneration(ctx, row.collection, row.locale)
  return [...new Set(allRows.map((row) => row.locale))].sort()
}

/** Read active revision pointers from canonical entry state, never the projection. */
export async function readPublicRevisionIdsByLocale(
  ctx: QueryCtx | MutationCtx,
  entryId: Id<'entries'>,
): Promise<Record<string, Id<'entryRevisions'>>> {
  const entry = await ctx.db.get(entryId)
  return Object.fromEntries(
    (entry?.activePublications ?? []).map((publication) => [
      publication.locale,
      publication.revisionId,
    ]),
  )
}
