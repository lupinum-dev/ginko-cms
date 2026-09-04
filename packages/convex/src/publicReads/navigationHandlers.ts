import type {
  nav as navArgs,
  surround as surroundArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/public.js'
import type { ObjectType } from 'convex/values'

import { getActivePublicPageByPath } from '../entries/projections.js'
import { publicPathForEntry } from '../entries/workflow/publicTree.js'
import { throwCmsError } from '../errors.js'
import { assertCollectionSupportsLocale, getCollection } from '../lib/collections.js'
import { compareOrderRank } from '../lib/ordering.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import { orderTreeRows } from '../lib/treeOrder.js'
import type { QueryCtx } from '../lib/types.js'
import {
  publicPathsFromStructuralRows,
  readTranslationsByEntryId,
} from '../publicProjectionReads.js'
import { toGinkoEntry, type PublicProjectionEntry } from '../publicReadAdapter.js'
import {
  mapPublicEntryAtKnownPath,
  mapPublicEntrySummaryAtKnownPath,
  publicFlag,
  requireProjectedPath,
  routingLocalesForCollection,
} from './entries.js'
import {
  assertRouteBackedCollection,
  validatePublicLimit,
  validatePublicTextArgs,
} from './validation.js'

type NavArgs = ObjectType<typeof navArgs.args>
type SurroundArgs = ObjectType<typeof surroundArgs.args>

function strictLocale(locale: string) {
  return {
    requested: locale,
    resolved: locale,
    policy: 'strict' as const,
    fallbacks: { fields: [] },
  }
}

function toNavigationEntry(
  entry: PublicProjectionEntry,
  requestedLocale: string,
  translations: Parameters<typeof toGinkoEntry>[2],
) {
  const {
    bodyAst: _bodyAst,
    toc: _toc,
    ...navigationEntry
  } = toGinkoEntry(entry, requestedLocale, translations)
  return navigationEntry
}

export async function navHandler(ctx: QueryCtx, args: NavArgs) {
  validatePublicTextArgs(args)
  const collection = await getCollection(ctx, args.collection)
  if (!collection) {
    return {
      tree: [],
      collection: args.collection,
      locale: strictLocale(args.locale),
    }
  }
  assertRouteBackedCollection(collection)
  assertCollectionSupportsLocale(collection, args.locale)
  const publicRows = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_orderKey_entry', (query) =>
      query.eq('collection', collection.slug).eq('locale', args.locale),
    )
    .order('asc')
    .take(1_501)
  if (publicRows.length > 1_500) {
    return throwCmsError(
      'SUPPORTED_SCALE_EXCEEDED',
      'Navigation supports at most 1,500 entries per collection and locale.',
    )
  }
  const paths = publicPathsFromStructuralRows(publicRows, collection, args.locale)
  const rows = publicRows.filter(
    (row) => paths.has(String(row.entryId)) && publicFlag(row, 'navigation'),
  )
  const translationsByEntryId = await readTranslationsByEntryId(ctx, collection.slug, rows)
  const routingLocales = await routingLocalesForCollection(ctx, collection)
  const nodes = new Map<string, { entry: ReturnType<typeof toGinkoEntry>; children: unknown[] }>()
  const roots: Array<{ entry: ReturnType<typeof toGinkoEntry>; children: unknown[] }> = []

  for (const row of rows) {
    const entry = toNavigationEntry(
      mapPublicEntrySummaryAtKnownPath(row, requireProjectedPath(row, paths), routingLocales),
      args.locale,
      translationsByEntryId.get(String(row.entryId)) ?? [],
    )
    nodes.set(String(row.entryId), { entry, children: [] })
  }

  const orderedRows = orderTreeRows(rows, {
    getId: (row) => String(row.entryId),
    getParentId: (row) => (row.parentEntryId ? String(row.parentEntryId) : null),
    compareSiblings: (left, right) => {
      const rank = compareOrderRank(left.orderKey, right.orderKey)
      if (rank !== 0) return rank
      return String(left.entryId).localeCompare(String(right.entryId))
    },
  }).map(({ row }) => row)

  for (const row of orderedRows) {
    const node = nodes.get(String(row.entryId))
    if (!node) continue
    const parentId = row.parentEntryId ? String(row.parentEntryId) : null
    const parent = parentId ? nodes.get(parentId) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return {
    tree: roots,
    collection: args.collection,
    locale: strictLocale(args.locale),
  }
}

export async function surroundHandler(ctx: QueryCtx, args: SurroundArgs) {
  validatePublicTextArgs(args)
  const collection = await getCollection(ctx, args.collection)
  if (!collection) {
    return {
      previous: [],
      next: [],
      collection: args.collection,
      locale: strictLocale(args.locale),
    }
  }
  assertRouteBackedCollection(collection)
  assertCollectionSupportsLocale(collection, args.locale)
  const previousLimit = validatePublicLimit(args.previous, 1, 10)
  const nextLimit = validatePublicLimit(args.next, 1, 10)
  const current = await getActivePublicPageByPath(ctx, collection, args.locale, args.path)
  if (!current) {
    return {
      previous: [],
      next: [],
      collection: args.collection,
      locale: strictLocale(args.locale),
    }
  }
  const parentEntryId = current.parentEntryId ?? null
  const previousAtSameRank = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
      query
        .eq('collection', collection.slug)
        .eq('locale', args.locale)
        .eq('parentEntryId', parentEntryId)
        .eq('orderKey', current.orderKey)
        .lt('entryId', current.entryId),
    )
    .order('desc')
    .take(previousLimit)
  const previousRows = [
    ...previousAtSameRank,
    ...(previousAtSameRank.length < previousLimit
      ? await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
            query
              .eq('collection', collection.slug)
              .eq('locale', args.locale)
              .eq('parentEntryId', parentEntryId)
              .lt('orderKey', current.orderKey),
          )
          .order('desc')
          .take(previousLimit - previousAtSameRank.length)
      : []),
  ]
  const nextAtSameRank = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
      query
        .eq('collection', collection.slug)
        .eq('locale', args.locale)
        .eq('parentEntryId', parentEntryId)
        .eq('orderKey', current.orderKey)
        .gt('entryId', current.entryId),
    )
    .order('asc')
    .take(nextLimit)
  const nextRows = [
    ...nextAtSameRank,
    ...(nextAtSameRank.length < nextLimit
      ? await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
            query
              .eq('collection', collection.slug)
              .eq('locale', args.locale)
              .eq('parentEntryId', parentEntryId)
              .gt('orderKey', current.orderKey),
          )
          .order('asc')
          .take(nextLimit - nextAtSameRank.length)
      : []),
  ]
  const allRows = [...previousRows, ...nextRows]
  const translationsByEntryId = await readTranslationsByEntryId(ctx, collection.slug, allRows)
  const routingLocales = await routingLocalesForCollection(ctx, collection)
  const mapRow = async (row: (typeof allRows)[number]) => {
    const path = await publicPathForEntry(ctx, row, {
      pathPrefix: pathPrefixForLocale(collection, args.locale),
      rootSlug: rootSlugForLocale(collection, args.locale),
    })
    if (!path) {
      return throwCmsError('PUBLIC_TREE_INVALID', 'Published entry has no reachable public path.', {
        entryId: String(row.entryId),
        locale: row.locale,
      })
    }
    return toGinkoEntry(
      await mapPublicEntryAtKnownPath(ctx, row, path, routingLocales),
      args.locale,
      translationsByEntryId.get(String(row.entryId)) ?? [],
    )
  }

  return {
    previous: await Promise.all(previousRows.map(mapRow)),
    next: await Promise.all(nextRows.map(mapRow)),
    collection: args.collection,
    locale: strictLocale(args.locale),
  }
}
