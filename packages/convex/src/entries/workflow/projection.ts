/** Transactional writer for the rebuildable public projection. */

import type { GinkoPublicAssetFact } from '@lupinum/ginko-cms-contract/shared/publicContent.js'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import type { ParseMdcBodyResult } from '@lupinum/ginko-content/cms-contract'

import type { Doc, Id } from '../../_generated/dataModel.js'
import type { MutationCtx, QueryCtx } from '../../lib/types.js'
import { assertCollectionOutsidePortableExportLease } from '../../portability/lease.js'
import { encodePublicBodyAst, encodePublicToc } from '../bodyAstStorage.js'
import { bumpRouteGeneration } from './routeGeneration.js'

type MarkdownRoot = ParseMdcBodyResult['body']
type Toc = NonNullable<ParseMdcBodyResult['toc']>

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
  bodyMdc?: string
  bodyAst?: MarkdownRoot
  searchText?: string
  toc?: Toc | null
  cacheTags?: string[]
  assetFacts: GinkoPublicAssetFact[]
  navIncluded?: boolean
  sitemapIncluded?: boolean
  searchIncluded?: boolean
  entryCreatedAt: number
  firstPublishedAt: number
  lastPublishedAt: number
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
  const payload = {
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
    data: input.data,
    ...(input.bodyMdc !== undefined ? { bodyMdc: input.bodyMdc } : {}),
    ...(input.bodyAst ? { bodyAst: encodePublicBodyAst(input.bodyAst) } : {}),
    ...(input.searchText !== undefined ? { searchText: input.searchText } : {}),
    ...(input.toc !== undefined ? { toc: encodePublicToc(input.toc) } : {}),
    cacheTags: input.cacheTags ?? [],
    assetFacts: input.assetFacts,
    navIncluded: input.navIncluded ?? true,
    sitemapIncluded: input.sitemapIncluded ?? true,
    searchIncluded: input.searchIncluded ?? true,
    entryCreatedAt: input.entryCreatedAt,
    firstPublishedAt: input.firstPublishedAt,
    lastPublishedAt: input.lastPublishedAt,
  }
  if (existing) await ctx.db.replace(existing._id, payload)
  else await ctx.db.insert('publicEntries', payload)
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
  if (!row) return
  await assertCollectionOutsidePortableExportLease(ctx, row.collection)
  await ctx.db.delete(row._id)
  await bumpRouteGeneration(ctx, row.collection, row.locale)
}

export async function deleteAllPublicProjections(
  ctx: MutationCtx,
  entryId: Id<'entries'>,
): Promise<string[]> {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
    .collect()
  if (rows[0]) await assertCollectionOutsidePortableExportLease(ctx, rows[0].collection)
  for (const row of rows) await ctx.db.delete(row._id)
  for (const row of rows) await bumpRouteGeneration(ctx, row.collection, row.locale)
  return rows.map((row) => row.locale).sort()
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
