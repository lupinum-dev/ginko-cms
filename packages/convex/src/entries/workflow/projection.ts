/**
 * Gate 1 - public projection writer.
 *
 * `publicEntries` is the active per-locale public truth. There are NO
 * inactive history rows - rows are upserted on publish, deleted on
 * unpublish. Meaningful history lives in `entryRevisions`.
 *
 * `publicRoutes` is the (locale, path) -> entryId lookup. Same
 * upsert/delete pattern.
 *
 * Invariants enforced:
 *   #1  draft saves never alter public output - this module is only called
 *       from publish/unpublish/restore-as-published, never from saveEntryDraft.
 *   #2  publishing one locale upserts exactly that locale's row.
 *   #5  public route is reconstructable from the producing revision; every
 *       publicEntries row carries `revisionId`.
 *   #16 publicEntries rows are upsert-or-delete, never history.
 */

import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import type { MarkdownRoot, Toc } from '../../lib/cmsContract/types.js'
import type { MutationCtx, QueryCtx } from '../../lib/types.js'
import { assertCollectionOutsidePortableExportLease } from '../../portability/lease.js'
import { encodePublicBodyAst, encodePublicToc } from '../bodyAstStorage.js'

export type PublicEntryDoc = Doc<'publicEntries'>
export type PublicRouteDoc = Doc<'publicRoutes'>

export interface PublicProjectionInput {
  entryId: Id<'entries'>
  collectionId: Id<'collections'>
  locale: string
  revisionId: Id<'entryRevisions'>
  routeBacked?: boolean
  stableId?: string | null
  parentEntryId?: Id<'entries'> | null
  orderKey: string
  slug: string
  path: string
  href: string
  title: string
  description?: string | null
  data: JsonObject
  bodyMdc?: string
  bodyAst?: MarkdownRoot
  searchText?: string
  toc?: Toc | null
  cacheTags?: string[]
  navIncluded?: boolean
  sitemapIncluded?: boolean
  searchIncluded?: boolean
  entryCreatedAt: number
  firstPublishedAt: number
  lastPublishedAt: number
}

export async function readPublicProjectionGeneration(ctx: QueryCtx | MutationCtx): Promise<number> {
  const state = await ctx.db
    .query('publicProjectionState')
    .withIndex('by_key', (query) => query.eq('key', 'global'))
    .unique()
  return state?.generation ?? 0
}

export async function bumpPublicProjectionGeneration(ctx: MutationCtx): Promise<number> {
  const state = await ctx.db
    .query('publicProjectionState')
    .withIndex('by_key', (query) => query.eq('key', 'global'))
    .unique()
  const generation = (state?.generation ?? 0) + 1
  if (state) {
    await ctx.db.patch(state._id, { generation, updatedAt: Date.now() })
  } else {
    await ctx.db.insert('publicProjectionState', {
      key: 'global',
      generation,
      updatedAt: Date.now(),
    })
  }
  return generation
}

/**
 * Upsert one (entryId, locale) public row + matching route lookup row.
 * Atomic: either both succeed or both fail (Convex mutation semantics).
 */
export async function upsertPublicProjection(
  ctx: MutationCtx,
  input: PublicProjectionInput,
): Promise<void> {
  await assertCollectionOutsidePortableExportLease(ctx, input.collectionId)
  const existing = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', input.entryId).eq('locale', input.locale))
    .first()

  const payload = {
    entryId: input.entryId,
    collectionId: input.collectionId,
    locale: input.locale,
    revisionId: input.revisionId,
    stableId: input.stableId ?? null,
    parentEntryId: input.parentEntryId ?? null,
    orderKey: input.orderKey,
    slug: input.slug,
    path: input.path,
    href: input.href,
    title: input.title,
    description: input.description ?? null,
    data: input.data,
    cacheTags: input.cacheTags ?? [],
    navIncluded: input.navIncluded ?? true,
    sitemapIncluded: input.sitemapIncluded ?? true,
    searchIncluded: input.searchIncluded ?? true,
    entryCreatedAt: input.entryCreatedAt,
    firstPublishedAt: input.firstPublishedAt,
    lastPublishedAt: input.lastPublishedAt,
    ...(input.bodyMdc !== undefined ? { bodyMdc: input.bodyMdc } : {}),
    ...(input.bodyAst !== undefined ? { bodyAst: encodePublicBodyAst(input.bodyAst) } : {}),
    ...(input.searchText !== undefined ? { searchText: input.searchText } : {}),
    ...(input.toc !== undefined ? { toc: encodePublicToc(input.toc) } : {}),
  }

  if (existing) {
    await ctx.db.replace(existing._id, payload)
  } else {
    await ctx.db.insert('publicEntries', payload)
  }

  if (input.routeBacked === false) {
    const routeRow = await ctx.db
      .query('publicRoutes')
      .withIndex('by_entry_locale', (q) =>
        q.eq('entryId', input.entryId).eq('locale', input.locale),
      )
      .first()
    if (routeRow) await ctx.db.delete(routeRow._id)
    await bumpPublicProjectionGeneration(ctx)
    return
  }

  await upsertRoute(ctx, {
    entryId: input.entryId,
    collectionId: input.collectionId,
    locale: input.locale,
    path: input.path,
    href: input.href,
    revisionId: input.revisionId,
  })
  await bumpPublicProjectionGeneration(ctx)
}

interface RouteInput {
  entryId: Id<'entries'>
  collectionId: Id<'collections'>
  locale: string
  path: string
  href: string
  revisionId: Id<'entryRevisions'>
}

async function upsertRoute(ctx: MutationCtx, input: RouteInput): Promise<void> {
  const existingByEntry = await ctx.db
    .query('publicRoutes')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', input.entryId).eq('locale', input.locale))
    .first()

  const existingByPath = await ctx.db
    .query('publicRoutes')
    .withIndex('by_locale_path', (q) => q.eq('locale', input.locale).eq('path', input.path))
    .first()
  if (existingByPath && existingByPath.entryId !== input.entryId) {
    throwCmsError(
      'ENTRY_PUBLISHED_PATH_CONFLICT',
      `Public path "${input.path}" already exists for locale "${input.locale}"`,
      {
        entryId: String(input.entryId),
        conflictingEntryId: String(existingByPath.entryId),
        locale: input.locale,
        path: input.path,
      },
    )
  }

  // If the path changed for this entry-locale, delete the old route row first
  // so we never leave a stale (locale, path) -> entryId mapping behind.
  if (existingByEntry && existingByEntry.path !== input.path) {
    await ctx.db.delete(existingByEntry._id)
  }

  const target = existingByEntry && existingByEntry.path === input.path ? existingByEntry : null

  const payload = {
    entryId: input.entryId,
    collectionId: input.collectionId,
    locale: input.locale,
    path: input.path,
    href: input.href,
    revisionId: input.revisionId,
  }

  if (target) {
    await ctx.db.replace(target._id, payload)
  } else {
    await ctx.db.insert('publicRoutes', payload)
  }
}

/**
 * Delete the public projection row + matching route row for one
 * (entryId, locale). Used by unpublish/archive.
 */
export async function deletePublicProjection(
  ctx: MutationCtx,
  args: { entryId: Id<'entries'>; locale: string },
): Promise<void> {
  const entryRow = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entryId).eq('locale', args.locale))
    .first()
  if (entryRow) await assertCollectionOutsidePortableExportLease(ctx, entryRow.collectionId)
  if (entryRow) await ctx.db.delete(entryRow._id)

  const routeRow = await ctx.db
    .query('publicRoutes')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entryId).eq('locale', args.locale))
    .first()
  if (routeRow) await ctx.db.delete(routeRow._id)
  if (entryRow || routeRow) await bumpPublicProjectionGeneration(ctx)
}

/**
 * Delete every public row for an entry across all locales. Used by archive
 * (which implies unpublish for all live locales).
 */
export async function deleteAllPublicProjections(
  ctx: MutationCtx,
  entryId: Id<'entries'>,
): Promise<string[]> {
  const entryRows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
    .collect()
  if (entryRows[0]) {
    await assertCollectionOutsidePortableExportLease(ctx, entryRows[0].collectionId)
  }
  const locales = entryRows.map((row) => row.locale)
  for (const row of entryRows) {
    await ctx.db.delete(row._id)
  }
  const routeRows = await ctx.db
    .query('publicRoutes')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
    .collect()
  for (const row of routeRows) {
    await ctx.db.delete(row._id)
  }
  if (entryRows.length || routeRows.length) await bumpPublicProjectionGeneration(ctx)
  return locales
}

/**
 * Public revisionIds currently live for an entry. Used by unpublish/archive
 * concurrency: callers pass `expectedPublicRevisionIds` and we reject if
 * the public state has moved.
 */
export async function readPublicRevisionIdsByLocale(
  ctx: QueryCtx | MutationCtx,
  entryId: Id<'entries'>,
): Promise<Record<string, Id<'entryRevisions'>>> {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
    .collect()
  const out: Record<string, Id<'entryRevisions'>> = {}
  for (const row of rows) {
    if (row.revisionId) out[row.locale] = row.revisionId
  }
  return out
}
