import type {
  list as listArgs,
  routes as routesArgs,
  search as searchArgs,
  sitemap as sitemapArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/public.js'
import type { ObjectType } from 'convex/values'

import { readRouteGeneration } from '../entries/workflow/routeGeneration.js'
import { throwCmsError } from '../errors.js'
import { assertCollectionSupportsLocale, getCollection } from '../lib/collections.js'
import { getCmsSettings } from '../lib/locale.js'
import type { QueryCtx } from '../lib/types.js'
import { paginatePublicRoutes, paginatePublicSearch } from '../publicPagination.js'
import { readTranslationsByEntryId } from '../publicProjectionReads.js'
import {
  toGinkoListResult,
  toGinkoSearchResult,
  toGinkoSitemapResult,
  type ProjectionSearchResultItem,
} from '../publicReadAdapter.js'
import {
  countPublicEntriesForCollection,
  mapPublicEntryAtKnownPath,
  mapPublicEntrySummaryAtKnownPath,
  paginatePublicEntriesForCollection,
  publicFlag,
  requireProjectedPath,
  routingLocalesForCollection,
} from './entries.js'
import {
  assertRouteBackedCollection,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  parsePublicListSort,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SITEMAP_DEFAULT_LIMIT,
  SITEMAP_MAX_LIMIT,
  validatePublicLimit,
  validatePublicPathPrefix,
  validatePublicTextArgs,
} from './validation.js'

type ListArgs = ObjectType<typeof listArgs.args>
type RoutesArgs = ObjectType<typeof routesArgs.args>
type SearchArgs = ObjectType<typeof searchArgs.args>
type SitemapArgs = ObjectType<typeof sitemapArgs.args>

const SNIPPET_MAX_LENGTH = 160
const SNIPPET_CONTEXT_BEFORE = 48
const SNIPPET_CONTEXT_AFTER = 72

async function getSiteDefaultLocale(ctx: Parameters<typeof getCmsSettings>[0], fallback: string) {
  const settings = await getCmsSettings(ctx)
  return (
    settings?.locales.find((locale) => locale.isDefault)?.code ??
    settings?.locales[0]?.code ??
    fallback
  )
}

function buildSnippet(source: string | null | undefined, queryText?: string) {
  const normalized = source?.replace(/\s+/g, ' ').trim()
  if (!normalized) return { text: null, highlights: [] }
  if (!queryText?.trim()) {
    return {
      text: normalized.slice(0, SNIPPET_MAX_LENGTH),
      highlights: [] as Array<{ start: number; end: number }>,
    }
  }

  const query = queryText.trim().toLowerCase()
  const index = normalized.toLowerCase().indexOf(query)
  if (index === -1) {
    return {
      text: normalized.slice(0, SNIPPET_MAX_LENGTH),
      highlights: [] as Array<{ start: number; end: number }>,
    }
  }

  const start = Math.max(0, index - SNIPPET_CONTEXT_BEFORE)
  const end = Math.min(normalized.length, index + query.length + SNIPPET_CONTEXT_AFTER)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < normalized.length ? '…' : ''
  const text = `${prefix}${normalized.slice(start, end).trim()}${suffix}`
  const offset = prefix.length

  return {
    text,
    highlights: [
      {
        start: offset + index - start,
        end: offset + index - start + query.length,
      },
    ],
  }
}

export async function listHandler(ctx: QueryCtx, args: ListArgs) {
  validatePublicTextArgs(args)
  const { sortField, sortDirection } = parsePublicListSort(args)
  validatePublicPathPrefix(args)

  const collection = await getCollection(ctx, args.collection)
  if (!collection) {
    return toGinkoListResult({
      collection: args.collection,
      requestedLocale: args.locale,
      result: { page: [], isDone: true, continueCursor: null },
    })
  }
  assertCollectionSupportsLocale(collection, args.locale)

  const limit = validatePublicLimit(args.limit, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT)
  const result = await paginatePublicEntriesForCollection(ctx, {
    collection,
    locale: args.locale,
    limit,
    cursor: args.cursor,
    sortField,
    direction: sortDirection,
    pathPrefix: args.pathPrefix,
  })
  const translationsByEntryId = await readTranslationsByEntryId(ctx, collection.slug, result.page)
  const routingLocales = await routingLocalesForCollection(ctx, collection)

  return toGinkoListResult({
    collection: args.collection,
    requestedLocale: args.locale,
    result: {
      page: await Promise.all(
        result.page.map((row) =>
          mapPublicEntryAtKnownPath(
            ctx,
            row,
            requireProjectedPath(row, result.paths),
            routingLocales,
          ),
        ),
      ),
      isDone: result.isDone,
      continueCursor: result.isDone ? null : result.continueCursor,
    },
    translationsByEntryId,
  })
}

export async function countHandler(
  ctx: QueryCtx,
  args: { collection: string; locale: string; pathPrefix?: string },
) {
  validatePublicTextArgs(args)
  validatePublicPathPrefix(args)
  const collection = await getCollection(ctx, args.collection)
  if (!collection) return 0
  assertCollectionSupportsLocale(collection, args.locale)
  return await countPublicEntriesForCollection(ctx, {
    collection,
    locale: args.locale,
    pathPrefix: args.pathPrefix,
  })
}

export async function searchHandler(ctx: QueryCtx, args: SearchArgs) {
  validatePublicTextArgs(args)
  if (!args.query.trim()) {
    return throwCmsError('INVALID_QUERY', 'Search query must not be empty.')
  }
  const limit = validatePublicLimit(args.limit, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT)
  const collection = await getCollection(ctx, args.collection)
  if (!collection) {
    return toGinkoSearchResult({
      requestedLocale: args.locale,
      results: [],
    })
  }
  assertRouteBackedCollection(collection)
  assertCollectionSupportsLocale(collection, args.locale)
  const generation = `${collection.contract.version}:${await readRouteGeneration(
    ctx,
    collection.slug,
    args.locale,
  )}`
  const searchPage = await paginatePublicSearch(ctx, {
    collection,
    locale: args.locale,
    query: args.query,
    limit,
    cursor: args.cursor,
    generation,
  })
  const routingLocales = await routingLocalesForCollection(ctx, collection)
  const matches: ProjectionSearchResultItem[] = await Promise.all(
    searchPage.page.map(async ({ row, searchRow, path }) => {
      const snippet = buildSnippet(searchRow.searchText, args.query)
      return {
        ...(await mapPublicEntryAtKnownPath(ctx, row, path, routingLocales)),
        snippet: snippet.text,
        highlights: snippet.highlights,
      }
    }),
  )
  const translationsByEntryId = await readTranslationsByEntryId(
    ctx,
    collection.slug,
    searchPage.page.map(({ row }) => row),
  )
  return toGinkoSearchResult({
    requestedLocale: args.locale,
    results: matches,
    translationsByEntryId,
    pageInfo: {
      hasNextPage: searchPage.hasNextPage,
      endCursor: searchPage.endCursor,
    },
  })
}

export async function sitemapHandler(ctx: QueryCtx, args: SitemapArgs) {
  validatePublicTextArgs(args)
  const collection = await getCollection(ctx, args.collection)
  if (!collection) {
    return toGinkoSitemapResult({
      entries: [],
      translationsByEntryId: new Map(),
      defaultLocale: await getSiteDefaultLocale(ctx, 'en'),
    })
  }
  assertRouteBackedCollection(collection)
  assertCollectionSupportsLocale(collection, args.locale)
  const limit = validatePublicLimit(args.limit, SITEMAP_DEFAULT_LIMIT, SITEMAP_MAX_LIMIT)
  const result = await paginatePublicEntriesForCollection(ctx, {
    collection,
    locale: args.locale,
    limit,
    cursor: args.cursor,
    sortField: 'orderKey',
    direction: 'asc',
    include: (row) => publicFlag(row, 'sitemap'),
  })
  const routingLocales = await routingLocalesForCollection(ctx, collection)
  const entries = result.page.map((row) =>
    mapPublicEntrySummaryAtKnownPath(row, requireProjectedPath(row, result.paths), routingLocales),
  )
  const translationsByEntryId = await readTranslationsByEntryId(
    ctx,
    collection.slug,
    result.page.map((row) => ({ entryId: row.entryId })),
  )

  return toGinkoSitemapResult({
    entries,
    translationsByEntryId,
    defaultLocale: await getSiteDefaultLocale(ctx, 'en'),
    pageInfo: {
      hasNextPage: !result.isDone,
      endCursor: result.isDone ? null : result.continueCursor,
    },
  })
}

export async function routesHandler(ctx: QueryCtx, args: RoutesArgs) {
  validatePublicTextArgs(args)
  const collection = await getCollection(ctx, args.collection)
  if (!collection) {
    return { routes: [], pageInfo: { hasNextPage: false, endCursor: null }, snapshot: '0' }
  }
  assertRouteBackedCollection(collection)
  assertCollectionSupportsLocale(collection, args.locale)
  const limit = validatePublicLimit(args.limit, 250, 250)
  const generation = `${collection.contract.version}:${await readRouteGeneration(
    ctx,
    collection.slug,
    args.locale,
  )}`
  const page = await paginatePublicRoutes(ctx, {
    collection,
    locale: args.locale,
    limit,
    cursor: args.cursor,
    generation,
  })
  return {
    routes: page.page.map(({ row, path }) => ({
      collection: args.collection,
      stableId: row.stableId,
      locale: row.locale,
      path,
      sitemapIncluded: publicFlag(row, 'sitemap'),
      lastmod: new Date(row.lastPublishedAt).toISOString(),
    })),
    pageInfo: {
      hasNextPage: page.hasNextPage,
      endCursor: page.endCursor,
    },
    snapshot: generation,
  }
}
