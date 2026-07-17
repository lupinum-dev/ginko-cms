import {
  list as listArgs,
  nav as navArgs,
  page as pageArgs,
  routeMeta as routeMetaArgs,
  routes as routesArgs,
  search as searchArgs,
  singleton as singletonArgs,
  sitemap as sitemapArgs,
  siteData as siteDataArgs,
  surround as surroundArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/public.js'
import {
  ginkoListResultValidator,
  ginkoNavResultValidator,
  ginkoPageResultValidator,
  ginkoRoutesResultValidator,
  ginkoSearchResultValidator,
  ginkoSingletonResultValidator,
  ginkoSitemapResultValidator,
  ginkoSiteDataResultValidator,
  ginkoSurroundResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { renderGinkoHref } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'
import type { JsonMap, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from './_generated/dataModel.js'
import { decodePublicBodyAst } from './entries/bodyAstStorage.js'
import {
  getActivePublicPageByPath,
  getActivePublicPageByStableId,
  mapActivePublicEntryRow,
} from './entries/projections.js'
import { publicPathForEntry, resolvePublicRoute } from './entries/workflow/publicTree.js'
import { readRouteGeneration } from './entries/workflow/routeGeneration.js'
import { throwCmsError } from './errors.js'
import { callerQuery } from './functions.js'
import {
  assertCollectionSupportsLocale,
  getCollection,
  getCollectionDefaultLocale,
  isRouteBackedCollection,
  needsStableId,
} from './lib/collections.js'
import { getCmsSettings, getLocaleChain, getRoutingLocales } from './lib/locale.js'
import { compareOrderRank } from './lib/ordering.js'
import {
  normalizePathPrefix,
  parseStableIdFromPath,
  pathPrefixForLocale,
  rootSlugForLocale,
} from './lib/paths.js'
import { orderTreeRows } from './lib/treeOrder.js'
import type { QueryCtx } from './lib/types.js'
import { paginatePublicRoutes, paginatePublicSearch } from './publicPagination.js'
import { readTranslationsByEntryId } from './publicProjectionReads.js'
import {
  toGinkoEntry,
  toGinkoListResult,
  toGinkoPageResult,
  toGinkoSearchResult,
  toGinkoSiteDataResult,
  toGinkoSingletonResult,
  toGinkoSitemapResult,
  type PublicTranslationSummary,
  type PublicProjectionEntry,
} from './publicReadAdapter.js'

// Public capability rule: route-backed collections may use page/nav/surround/search/sitemap
// surfaces; data-only collections are listable public data and must be rejected by route-only reads.
/** Maximum length of a search result snippet. */
const SNIPPET_MAX_LENGTH = 160
/** Characters of context to show before the search match in a snippet. */
const SNIPPET_CONTEXT_BEFORE = 48
/** Characters of context to show after the search match in a snippet. */
const SNIPPET_CONTEXT_AFTER = 72
/** Default page size for the public list query. */
const LIST_DEFAULT_LIMIT = 20
/** Maximum page size for the public list query. */
const LIST_MAX_LIMIT = 100
/** Default page size for search results. */
const SEARCH_DEFAULT_LIMIT = 10
/** Maximum page size for search results. */
const SEARCH_MAX_LIMIT = 50
/** Default page size for sitemap results. */
const SITEMAP_DEFAULT_LIMIT = 500
/** Maximum page size for sitemap results. */
const SITEMAP_MAX_LIMIT = 1000
const PUBLIC_QUERY_MAX_LENGTH = 256
const PUBLIC_STRING_MAX_LENGTH = 512
const PUBLIC_CURSOR_MAX_LENGTH = 2048
const PUBLIC_LOCALE_MAX_LENGTH = 32
const PUBLIC_COLLECTION_MAX_LENGTH = 80

type PublicEntryRow = Doc<'publicEntries'>
type CollectionDoc = NonNullable<Awaited<ReturnType<typeof getCollection>>>
type PublicExplicitSortField =
  | 'orderKey'
  | 'entryCreatedAt'
  | 'firstPublishedAt'
  | 'lastPublishedAt'
type PublicSortField = PublicExplicitSortField | 'path'
type PublicEntryCursor = {
  v: 1
  kind: 'publicEntries'
  field: PublicSortField
  direction: 'asc' | 'desc'
  value: string | number
  entryId: string
}

async function getSiteDefaultLocale(ctx: Parameters<typeof getCmsSettings>[0], fallback: string) {
  const settings = await getCmsSettings(ctx)
  return (
    settings?.locales.find((locale) => locale.isDefault)?.code ??
    settings?.locales[0]?.code ??
    fallback
  )
}

function assertRouteBackedCollection(collection: Awaited<ReturnType<typeof getCollection>>) {
  if (collection && !isRouteBackedCollection(collection)) {
    throwCmsError('DATA_ONLY_COLLECTION', 'This collection is data-only and has no public routes.')
  }
}

function validatePublicLimit(value: number | undefined, fallback: number, max: number) {
  const limit = value ?? fallback
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throwCmsError('INVALID_LIMIT', `Limit must be an integer between 1 and ${max}.`)
  }
  return limit
}

function validateLength(value: string | null | undefined, name: string, maxLength: number) {
  if (value === null || value === undefined || value.length <= maxLength) return
  throwCmsError('INVALID_QUERY', `${name} must be at most ${maxLength} characters.`, {
    field: name,
    maxLength,
    length: value.length,
  })
}

function validatePublicTextArgs(args: {
  collection?: string
  locale?: string | null
  path?: string | null
  ref?: string | null
  cursor?: string | null
  query?: string
  name?: string
  key?: string
  pathPrefix?: string | null
}) {
  validateLength(args.collection, 'collection', PUBLIC_COLLECTION_MAX_LENGTH)
  validateLength(args.name, 'name', PUBLIC_COLLECTION_MAX_LENGTH)
  validateLength(args.key, 'key', PUBLIC_COLLECTION_MAX_LENGTH)
  validateLength(args.locale, 'locale', PUBLIC_LOCALE_MAX_LENGTH)
  validateLength(args.path, 'path', PUBLIC_STRING_MAX_LENGTH)
  validateLength(args.ref, 'ref', PUBLIC_STRING_MAX_LENGTH)
  validateLength(args.cursor, 'cursor', PUBLIC_CURSOR_MAX_LENGTH)
  validateLength(args.query, 'query', PUBLIC_QUERY_MAX_LENGTH)
  validateLength(args.pathPrefix, 'pathPrefix', PUBLIC_STRING_MAX_LENGTH)
}

function isPublicExplicitSortField(field: string | undefined): field is PublicExplicitSortField {
  return (
    field === 'orderKey' ||
    field === 'entryCreatedAt' ||
    field === 'firstPublishedAt' ||
    field === 'lastPublishedAt'
  )
}

function parsePublicListSort(args: { sort?: string }): {
  sortField: PublicExplicitSortField
  sortDirection: 'asc' | 'desc'
} {
  const [field, direction] = (args.sort ?? 'orderKey:asc').split(':')
  if (!isPublicExplicitSortField(field) || (direction !== 'asc' && direction !== 'desc')) {
    throwCmsError(
      'INVALID_SORT',
      'Public sort supports only orderKey, entryCreatedAt, firstPublishedAt, and lastPublishedAt.',
    )
  }
  return { sortField: field, sortDirection: direction === 'desc' ? 'desc' : 'asc' }
}

function validatePublicPathPrefix(args: { pathPrefix?: string | null; sort?: string }) {
  if (!args.pathPrefix) return
  if (!args.pathPrefix.startsWith('/')) {
    throwCmsError('INVALID_QUERY', 'pathPrefix must start with "/".', { field: 'pathPrefix' })
  }
  if (args.sort) {
    throwCmsError('INVALID_SORT', 'Public path prefix queries use path-index order.')
  }
}

function assertPageLookup(args: { path?: string; ref?: string }) {
  if (args.path && args.ref) {
    throwCmsError('INVALID_QUERY', 'Provide either path or ref, not both.')
  }
  if (!args.path && !args.ref) {
    throwCmsError('INVALID_QUERY', 'A public page lookup requires path or ref.')
  }
}

async function resolvePublicLocaleChain(
  ctx: QueryCtx,
  args: { locale: string; fallback?: boolean | string[] },
) {
  if (args.fallback === false) return [args.locale]
  if (Array.isArray(args.fallback)) return Array.from(new Set([args.locale, ...args.fallback]))
  return (await getLocaleChain(ctx, args.locale)).chain
}

async function paginatePublicEntriesForCollection(
  ctx: QueryCtx,
  args: {
    collection: CollectionDoc
    locale: string
    limit: number
    cursor?: string | null
    sortField?: PublicSortField
    direction?: 'asc' | 'desc'
    pathPrefix?: string | null
    include?: (row: PublicEntryRow) => boolean
  },
) {
  const sortField = args.pathPrefix ? 'path' : (args.sortField ?? 'orderKey')
  const direction = args.direction ?? 'asc'
  const cursor = parsePublicEntryCursor(
    args.cursor,
    sortField,
    direction,
    'Invalid pagination cursor.',
  )
  if (sortField !== 'path') {
    const rawRows = await readIndexedPublicEntryPage(ctx, {
      collection: args.collection.slug,
      locale: args.locale,
      limit: args.limit,
      cursor,
      sortField,
      direction,
    })
    const batch = rawRows.slice(0, args.limit)
    const pathPairs = await Promise.all(
      batch.map(
        async (row) =>
          [
            String(row.entryId),
            await publicPathForEntry(ctx, row, {
              pathPrefix: pathPrefixForLocale(args.collection, args.locale),
              rootSlug: rootSlugForLocale(args.collection, args.locale),
            }),
          ] as const,
      ),
    )
    const paths = new Map(pathPairs.filter((pair): pair is readonly [string, string] => !!pair[1]))
    const page = batch
      .filter((row) => paths.has(String(row.entryId)))
      .filter((row) => args.include?.(row) ?? true)
    const isDone = rawRows.length <= args.limit
    return {
      page,
      paths,
      isDone,
      continueCursor:
        isDone || batch.length === 0
          ? null
          : encodePublicEntryCursor(batch[batch.length - 1]!, sortField, direction),
    }
  }

  // A structural tree has no stored full-path index. Prefix listing therefore
  // walks stable identities pagewise and derives each candidate path from its
  // indexed ancestry. The cursor remains O(1) and correctness does not depend
  // on collection size.
  const requestedPrefix = normalizePathPrefix(args.pathPrefix ?? '')
  const candidates: PublicEntryRow[] = []
  const paths = new Map<string, string>()
  let afterStableId = cursor ? String(cursor.value) : null
  let exhausted = false
  while (!exhausted && candidates.length <= args.limit) {
    const remaining = args.limit + 1 - candidates.length
    const batchSize = Math.max(32, Math.min(250, remaining * 2))
    const rows = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_stableId', (q) => {
        const scope = q.eq('collection', args.collection.slug).eq('locale', args.locale)
        return afterStableId ? scope.gt('stableId', afterStableId) : scope
      })
      .order('asc')
      .take(batchSize)
    exhausted = rows.length < batchSize
    if (!rows.length) break
    for (const row of rows) {
      if (row.stableId === afterStableId) {
        throwCmsError('PUBLIC_TREE_INVALID', 'Published stable identities must be unique.', {
          collection: args.collection.slug,
          locale: args.locale,
          stableId: row.stableId,
        })
      }
      const path = await publicPathForEntry(ctx, row, {
        pathPrefix: pathPrefixForLocale(args.collection, args.locale),
        rootSlug: rootSlugForLocale(args.collection, args.locale),
      })
      const inPrefix =
        !!path &&
        (!requestedPrefix || path === requestedPrefix || path.startsWith(`${requestedPrefix}/`))
      if (inPrefix && (args.include?.(row) ?? true)) {
        candidates.push(row)
        paths.set(String(row.entryId), path)
      }
      afterStableId = row.stableId
      if (candidates.length > args.limit) break
    }
  }

  const page = candidates.slice(0, args.limit)
  const isDone = candidates.length <= args.limit
  return {
    page,
    paths,
    isDone,
    continueCursor:
      isDone || page.length === 0
        ? null
        : encodePublicEntryCursor(page[page.length - 1]!, sortField, direction),
  }
}

async function readIndexedPublicEntryPage(
  ctx: QueryCtx,
  args: {
    collection: string
    locale: string
    limit: number
    cursor: PublicEntryCursor | null
    sortField: PublicExplicitSortField
    direction: 'asc' | 'desc'
  },
): Promise<PublicEntryRow[]> {
  if (args.sortField === 'orderKey') {
    return await readStringTuplePage(ctx, {
      ...args,
      index: 'by_collection_locale_orderKey_entry',
      field: 'orderKey',
    })
  }
  if (args.sortField === 'entryCreatedAt') {
    return await readNumberTuplePage(ctx, {
      ...args,
      index: 'by_collection_locale_entryCreatedAt_entry',
      field: 'entryCreatedAt',
    })
  }
  if (args.sortField === 'firstPublishedAt') {
    return await readNumberTuplePage(ctx, {
      ...args,
      index: 'by_collection_locale_firstPublishedAt_entry',
      field: 'firstPublishedAt',
    })
  }
  return await readNumberTuplePage(ctx, {
    ...args,
    index: 'by_collection_locale_lastPublishedAt_entry',
    field: 'lastPublishedAt',
  })
}

async function readStringTuplePage(
  ctx: QueryCtx,
  args: {
    collection: string
    locale: string
    limit: number
    cursor: PublicEntryCursor | null
    direction: 'asc' | 'desc'
    index: 'by_collection_locale_orderKey_entry'
    field: 'orderKey'
  },
) {
  if (!args.cursor) {
    return await ctx.db
      .query('publicEntries')
      .withIndex(args.index, (q) => q.eq('collection', args.collection).eq('locale', args.locale))
      .order(args.direction)
      .take(args.limit + 1)
  }
  const value = String(args.cursor.value)
  const sameValueRows = await ctx.db
    .query('publicEntries')
    .withIndex(args.index, (q) => {
      const scope = q
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq(args.field, value)
      return args.direction === 'asc'
        ? scope.gt('entryId', args.cursor!.entryId as Id<'entries'>)
        : scope.lt('entryId', args.cursor!.entryId as Id<'entries'>)
    })
    .order(args.direction)
    .take(args.limit + 1)
  if (sameValueRows.length > args.limit) return sameValueRows
  const remaining = args.limit + 1 - sameValueRows.length
  const nextValueRows = await ctx.db
    .query('publicEntries')
    .withIndex(args.index, (q) => {
      const scope = q.eq('collection', args.collection).eq('locale', args.locale)
      return args.direction === 'asc' ? scope.gt(args.field, value) : scope.lt(args.field, value)
    })
    .order(args.direction)
    .take(remaining)
  return [...sameValueRows, ...nextValueRows]
}

async function readNumberTuplePage(
  ctx: QueryCtx,
  args:
    | {
        collection: string
        locale: string
        limit: number
        cursor: PublicEntryCursor | null
        direction: 'asc' | 'desc'
        index: 'by_collection_locale_entryCreatedAt_entry'
        field: 'entryCreatedAt'
      }
    | {
        collection: string
        locale: string
        limit: number
        cursor: PublicEntryCursor | null
        direction: 'asc' | 'desc'
        index: 'by_collection_locale_firstPublishedAt_entry'
        field: 'firstPublishedAt'
      }
    | {
        collection: string
        locale: string
        limit: number
        cursor: PublicEntryCursor | null
        direction: 'asc' | 'desc'
        index: 'by_collection_locale_lastPublishedAt_entry'
        field: 'lastPublishedAt'
      },
) {
  if (!args.cursor) {
    return await ctx.db
      .query('publicEntries')
      .withIndex(args.index, (q) => q.eq('collection', args.collection).eq('locale', args.locale))
      .order(args.direction)
      .take(args.limit + 1)
  }
  const value = Number(args.cursor.value)
  const sameValueRows = await ctx.db
    .query('publicEntries')
    .withIndex(args.index, (q) => {
      const scope = q
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq(args.field, value)
      return args.direction === 'asc'
        ? scope.gt('entryId', args.cursor!.entryId as Id<'entries'>)
        : scope.lt('entryId', args.cursor!.entryId as Id<'entries'>)
    })
    .order(args.direction)
    .take(args.limit + 1)
  if (sameValueRows.length > args.limit) return sameValueRows
  const remaining = args.limit + 1 - sameValueRows.length
  const nextValueRows = await ctx.db
    .query('publicEntries')
    .withIndex(args.index, (q) => {
      const scope = q.eq('collection', args.collection).eq('locale', args.locale)
      return args.direction === 'asc' ? scope.gt(args.field, value) : scope.lt(args.field, value)
    })
    .order(args.direction)
    .take(remaining)
  return [...sameValueRows, ...nextValueRows]
}

function publicEntrySortValue(row: PublicEntryRow, field: PublicSortField): string | number {
  return field === 'path' ? row.stableId : row[field]
}

function encodePublicEntryCursor(
  row: PublicEntryRow,
  field: PublicSortField,
  direction: 'asc' | 'desc',
) {
  return JSON.stringify({
    v: 1,
    kind: 'publicEntries',
    field,
    direction,
    value: publicEntrySortValue(row, field),
    entryId: String(row.entryId),
  } satisfies PublicEntryCursor)
}

function parsePublicEntryCursor(
  cursor: string | null | undefined,
  field: PublicSortField,
  direction: 'asc' | 'desc',
  invalidCursorMessage: string,
) {
  if (!cursor) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(cursor)
  } catch {
    throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as PublicEntryCursor).v !== 1 ||
    (parsed as PublicEntryCursor).kind !== 'publicEntries' ||
    (parsed as PublicEntryCursor).field !== field ||
    (parsed as PublicEntryCursor).direction !== direction
  ) {
    throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
  }
  const value = (parsed as PublicEntryCursor).value
  if (field === 'orderKey' || field === 'path') {
    if (typeof value !== 'string') throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
  } else if (typeof value !== 'number' || !Number.isFinite(value)) {
    throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
  }
  if (
    typeof (parsed as PublicEntryCursor).entryId !== 'string' ||
    !(parsed as PublicEntryCursor).entryId
  ) {
    throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
  }
  return parsed as PublicEntryCursor
}

async function mapPublicEntry(ctx: QueryCtx, row: PublicEntryRow, collection: CollectionDoc) {
  const projected = await mapActivePublicEntryRow(ctx, row, collection)
  if (!row.assetFacts) {
    throwCmsError(
      'PUBLIC_PROJECTION_REBUILD_REQUIRED',
      'Published content predates projection-owned asset facts. Rebuild the public projection before serving it.',
      { entryId: String(row.entryId), locale: row.locale },
    )
  }
  return { ...projected, assetFacts: row.assetFacts } as PublicProjectionEntry
}

function mapPublicEntryAtKnownPath(
  row: PublicEntryRow,
  path: string,
  routingLocales: Awaited<ReturnType<typeof getRoutingLocales>>,
): PublicProjectionEntry {
  if (!row.assetFacts) {
    throwCmsError(
      'PUBLIC_PROJECTION_REBUILD_REQUIRED',
      'Published content predates projection-owned asset facts. Rebuild the public projection before serving it.',
      { entryId: String(row.entryId), locale: row.locale },
    )
  }
  return {
    _id: String(row.entryId),
    collection: row.collection,
    slug: row.slug,
    path,
    href: renderGinkoHref({ locale: row.locale, path }, routingLocales),
    locale: row.locale,
    resolvedLocale: row.locale,
    title: row.title,
    data: {
      ...(row.data as JsonMap),
      ...(typeof row.description === 'string' ? { description: row.description } : {}),
    },
    bodyAst: decodePublicBodyAst(row.bodyAst),
    toc: row.toc,
    publishedAt: row.lastPublishedAt,
    stableId: row.stableId,
    assetFacts: row.assetFacts,
  }
}

async function routingLocalesForCollection(ctx: QueryCtx, collection: CollectionDoc) {
  return await getRoutingLocales(ctx, collection.locales, getCollectionDefaultLocale(collection))
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

function publicFlag(row: PublicEntryRow, key: 'navigation' | 'search' | 'sitemap') {
  if (key === 'navigation' && row.navIncluded === false) return false
  if (key === 'search' && row.searchIncluded === false) return false
  if (key === 'sitemap' && row.sitemapIncluded === false) return false
  const publicValue = (row.data as JsonMap | undefined)?.public
  if (!publicValue || typeof publicValue !== 'object' || Array.isArray(publicValue)) return true
  const value = (publicValue as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : true
}

async function getTranslationsForEntry(
  ctx: QueryCtx,
  collection: string,
  entryId: Id<'entries'>,
): Promise<PublicTranslationSummary[]> {
  return (
    (await readTranslationsByEntryId(ctx, collection, [{ entryId }])).get(String(entryId)) ?? []
  )
}

async function resolvePublicPage(
  ctx: QueryCtx,
  args: {
    collection: Awaited<ReturnType<typeof getCollection>>
    collectionSlug: string
    locale: string
    path?: string
    ref?: string
    fallback?: boolean | string[]
  },
) {
  if (!args.collection) {
    return {
      requestedPath: args.path ?? args.ref ?? '',
      projected: null,
      translations: [] as PublicTranslationSummary[],
      redirectTo: null as string | null,
    }
  }

  const chain = args.ref ? await resolvePublicLocaleChain(ctx, args) : [args.locale]
  let requestedPath = args.path ?? args.ref ?? ''
  let projected = null
  let translations: PublicTranslationSummary[] = []
  let redirectTo: string | null = null

  for (const locale of chain) {
    if (args.ref) {
      projected = await getActivePublicPageByStableId(ctx, args.collection.slug, locale, args.ref)
      if (projected) {
        translations = await getTranslationsForEntry(ctx, args.collection.slug, projected.entryId)
        break
      }
      continue
    }

    requestedPath = args.path!
    const route = await resolvePublicRoute(ctx, {
      collection: args.collection.slug,
      locale,
      path: args.path!,
      options: {
        pathPrefix: pathPrefixForLocale(args.collection, locale),
        rootSlug: rootSlugForLocale(args.collection, locale),
      },
    })
    if (route.kind === 'entry') {
      projected = route.row
    } else if (route.kind === 'redirect') {
      projected = route.target.row
      redirectTo = route.targetPath
    }
    if (projected) {
      translations = await getTranslationsForEntry(ctx, args.collection.slug, projected.entryId)
      break
    }

    if (!needsStableId(args.collection)) {
      continue
    }

    const stableId = parseStableIdFromPath(args.path!)
    if (stableId) {
      projected = await getActivePublicPageByStableId(ctx, args.collection.slug, locale, stableId)
    }
    if (projected) {
      translations = await getTranslationsForEntry(ctx, args.collection.slug, projected.entryId)
      break
    }
  }

  return { requestedPath, projected, translations, redirectTo }
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

// AUTH-AUDIT: all raw.query exports in this module are intentionally unguarded —
// they serve the public-facing content API (read-only, published data only).
export const page = callerQuery.public({
  id: 'public:page',
  args: pageArgs.args,
  returns: ginkoPageResultValidator,
  handler: async (ctx, args) => {
    validatePublicTextArgs(args)
    assertPageLookup(args)
    const collection = await getCollection(ctx, args.collection)
    if (!collection) {
      return toGinkoPageResult({
        collection: args.collection,
        requestedLocale: args.locale,
        requestedPath: args.path ?? args.ref ?? '',
        result: { page: null, redirectTo: null },
      })
    }
    assertRouteBackedCollection(collection)
    assertCollectionSupportsLocale(collection, args.locale)

    const { requestedPath, projected, translations, redirectTo } = await resolvePublicPage(ctx, {
      collection,
      collectionSlug: args.collection,
      locale: args.locale,
      path: args.path,
      ref: args.ref,
      fallback: (args as typeof args & { fallback?: boolean | string[] }).fallback,
    })

    if (!projected) {
      return toGinkoPageResult({
        collection: args.collection,
        requestedLocale: args.locale,
        requestedPath,
        result: { page: null, redirectTo: null },
        defaultLocale: getCollectionDefaultLocale(collection),
      })
    }

    const mapped = await mapPublicEntry(ctx, projected, collection)
    return toGinkoPageResult({
      collection: args.collection,
      requestedLocale: args.locale,
      requestedPath,
      result: {
        page: mapped,
        redirectTo: redirectTo ?? (args.ref || mapped.path === requestedPath ? null : mapped.path),
      },
      translations,
      defaultLocale: getCollectionDefaultLocale(collection),
    })
  },
})

export const routeMeta = callerQuery.public({
  id: 'public:routeMeta',
  args: routeMetaArgs.args,
  returns: ginkoPageResultValidator,
  handler: async (ctx, args) => {
    validatePublicTextArgs(args)
    assertPageLookup(args)
    const collection = await getCollection(ctx, args.collection)
    if (!collection) {
      return toGinkoPageResult({
        collection: args.collection,
        requestedLocale: args.locale,
        requestedPath: args.path ?? args.ref ?? '',
        result: { page: null, redirectTo: null },
      })
    }
    assertRouteBackedCollection(collection)
    assertCollectionSupportsLocale(collection, args.locale)

    const { requestedPath, projected, translations, redirectTo } = await resolvePublicPage(ctx, {
      collection,
      collectionSlug: args.collection,
      locale: args.locale,
      path: args.path,
      ref: args.ref,
      fallback: (args as typeof args & { fallback?: boolean | string[] }).fallback,
    })

    if (!projected) {
      return toGinkoPageResult({
        collection: args.collection,
        requestedLocale: args.locale,
        requestedPath,
        result: { page: null, redirectTo: null },
        defaultLocale: getCollectionDefaultLocale(collection),
      })
    }

    const mapped = {
      ...(await mapPublicEntry(ctx, projected, collection)),
      data: {},
      assetFacts: [],
    }
    return toGinkoPageResult({
      collection: args.collection,
      requestedLocale: args.locale,
      requestedPath,
      result: {
        page: mapped,
        redirectTo: redirectTo ?? (args.ref || mapped.path === requestedPath ? null : mapped.path),
      },
      translations,
      defaultLocale: getCollectionDefaultLocale(collection),
    })
  },
})

export const list = callerQuery.public({
  id: 'public:list',
  args: listArgs.args,
  returns: ginkoListResultValidator,
  handler: async (ctx, args) => {
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
    const pageRows = result.page
    const translationsByEntryId = await readTranslationsByEntryId(ctx, collection.slug, pageRows)
    const routingLocales = await routingLocalesForCollection(ctx, collection)

    return toGinkoListResult({
      collection: args.collection,
      requestedLocale: args.locale,
      result: {
        page: pageRows.map((row) =>
          mapPublicEntryAtKnownPath(row, result.paths.get(String(row.entryId))!, routingLocales),
        ),
        isDone: result.isDone,
        continueCursor: result.isDone ? null : result.continueCursor,
      },
      translationsByEntryId,
    })
  },
})

export const nav = callerQuery.public({
  id: 'public:nav',
  args: navArgs.args,
  returns: ginkoNavResultValidator,
  handler: async (ctx, args) => {
    validatePublicTextArgs(args)
    const collection = await getCollection(ctx, args.collection)
    if (!collection) {
      return {
        tree: [],
        collection: args.collection,
        locale: {
          requested: args.locale,
          resolved: args.locale,
          policy: 'strict',
          fallbacks: { fields: [] },
        },
      }
    }
    assertRouteBackedCollection(collection)
    assertCollectionSupportsLocale(collection, args.locale)
    const publicRows = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_nav_orderKey', (q) =>
        q.eq('collection', collection.slug).eq('locale', args.locale).eq('navIncluded', true),
      )
      .order('asc')
      .collect()
    const pathPairs = await Promise.all(
      publicRows.map(
        async (row) =>
          [
            String(row.entryId),
            await publicPathForEntry(ctx, row, {
              pathPrefix: pathPrefixForLocale(collection, args.locale),
              rootSlug: rootSlugForLocale(collection, args.locale),
            }),
          ] as const,
      ),
    )
    const paths = new Map(pathPairs.filter((pair): pair is readonly [string, string] => !!pair[1]))
    const rows = publicRows.filter(
      (row) => paths.has(String(row.entryId)) && publicFlag(row, 'navigation'),
    )
    const translationsByEntryId = await readTranslationsByEntryId(ctx, collection.slug, rows)
    const routingLocales = await routingLocalesForCollection(ctx, collection)
    const nodes = new Map<string, { entry: ReturnType<typeof toGinkoEntry>; children: unknown[] }>()
    const roots: Array<{ entry: ReturnType<typeof toGinkoEntry>; children: unknown[] }> = []

    for (const row of rows) {
      if (row.navIncluded === false) continue
      const entry = toNavigationEntry(
        mapPublicEntryAtKnownPath(row, paths.get(String(row.entryId))!, routingLocales),
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
        const slug = left.slug.localeCompare(right.slug)
        return slug || String(left.entryId).localeCompare(String(right.entryId))
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
      locale: {
        requested: args.locale,
        resolved: args.locale,
        policy: 'strict',
        fallbacks: { fields: [] },
      },
    }
  },
})

export const surround = callerQuery.public({
  id: 'public:surround',
  args: surroundArgs.args,
  returns: ginkoSurroundResultValidator,
  handler: async (ctx, args) => {
    validatePublicTextArgs(args)
    const collection = await getCollection(ctx, args.collection)
    if (!collection) {
      return {
        previous: [],
        next: [],
        collection: args.collection,
        locale: {
          requested: args.locale,
          resolved: args.locale,
          policy: 'strict',
          fallbacks: { fields: [] },
        },
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
        locale: {
          requested: args.locale,
          resolved: args.locale,
          policy: 'strict',
          fallbacks: { fields: [] },
        },
      }
    }
    const previousRows = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_parent_orderKey', (q) =>
        q
          .eq('collection', collection.slug)
          .eq('locale', args.locale)
          .eq('parentEntryId', current.parentEntryId ?? null)
          .lt('orderKey', current.orderKey),
      )
      .order('desc')
      .take(previousLimit)
    const nextRows = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_parent_orderKey', (q) =>
        q
          .eq('collection', collection.slug)
          .eq('locale', args.locale)
          .eq('parentEntryId', current.parentEntryId ?? null)
          .gt('orderKey', current.orderKey),
      )
      .order('asc')
      .take(nextLimit)
    const allRows = [...previousRows, ...nextRows]
    const translationsByEntryId = await readTranslationsByEntryId(ctx, collection.slug, allRows)
    const mapRow = async (row: (typeof allRows)[number]) =>
      toGinkoEntry(
        await mapPublicEntry(ctx, row, collection),
        args.locale,
        translationsByEntryId.get(String(row.entryId)) ?? [],
      )

    return {
      previous: await Promise.all(previousRows.map(mapRow)),
      next: await Promise.all(nextRows.map(mapRow)),
      collection: args.collection,
      locale: {
        requested: args.locale,
        resolved: args.locale,
        policy: 'strict',
        fallbacks: { fields: [] },
      },
    }
  },
})

export const search = callerQuery.public({
  id: 'public:search',
  args: searchArgs.args,
  returns: ginkoSearchResultValidator,
  handler: async (ctx, args) => {
    validatePublicTextArgs(args)
    if (!args.query.trim()) {
      throwCmsError('INVALID_QUERY', 'Search query must not be empty.')
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
    const visibleRows = searchPage.page
    const routingLocales = await routingLocalesForCollection(ctx, collection)
    const matches = []
    for (const { row, path } of visibleRows) {
      const snippet = buildSnippet(row.searchText, args.query)
      const mapped = mapPublicEntryAtKnownPath(row, path, routingLocales)
      matches.push({
        ...mapped,
        snippet: snippet.text,
        highlights: snippet.highlights,
      })
    }
    const translationsByEntryId = await readTranslationsByEntryId(
      ctx,
      collection.slug,
      visibleRows.map(({ row }) => row),
    )
    return toGinkoSearchResult({
      requestedLocale: args.locale,
      results: matches as PublicProjectionEntry[],
      translationsByEntryId,
      pageInfo: {
        hasNextPage: searchPage.hasNextPage,
        endCursor: searchPage.endCursor,
      },
    })
  },
})

export const sitemap = callerQuery.public({
  id: 'public:sitemap',
  args: sitemapArgs.args,
  returns: ginkoSitemapResultValidator,
  handler: async (ctx, args) => {
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

    const filteredRows = result.page
    const routingLocales = await routingLocalesForCollection(ctx, collection)
    const entries = filteredRows.map((row) =>
      mapPublicEntryAtKnownPath(row, result.paths.get(String(row.entryId))!, routingLocales),
    )
    const translationRows = filteredRows.map((row) => ({ entryId: row.entryId }))
    const translationsByEntryId = await readTranslationsByEntryId(
      ctx,
      collection.slug,
      translationRows,
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
  },
})

export const routes = callerQuery.public({
  id: 'public:routes',
  args: routesArgs.args,
  returns: ginkoRoutesResultValidator,
  handler: async (ctx, args) => {
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
    const records = page.page.map(({ row, path }) => ({
      collection: args.collection,
      stableId: row.stableId,
      locale: row.locale,
      path,
      sitemapIncluded: publicFlag(row, 'sitemap'),
      lastmod: new Date(row.lastPublishedAt).toISOString(),
    }))
    return {
      routes: records,
      pageInfo: {
        hasNextPage: page.hasNextPage,
        endCursor: page.endCursor,
      },
      snapshot: generation,
    }
  },
})

export const singleton = callerQuery.public({
  id: 'public:singleton',
  args: singletonArgs.args,
  returns: ginkoSingletonResultValidator,
  handler: async (ctx, args) => {
    validatePublicTextArgs(args)
    const requestedLocale = args.locale ?? 'default'
    const collection = await getCollection(ctx, args.name)
    if (!args.locale) {
      return toGinkoSingletonResult({
        name: args.name,
        requestedLocale,
        entry: null,
        failure: 'missing_locale',
      })
    }
    if (!collection) {
      return toGinkoSingletonResult({
        name: args.name,
        requestedLocale,
        entry: null,
        failure: 'unknown_collection',
      })
    }
    if (!collection.routing.singleton) {
      return toGinkoSingletonResult({
        name: args.name,
        requestedLocale,
        entry: null,
        failure: 'not_singleton',
      })
    }
    if (!isRouteBackedCollection(collection)) {
      return toGinkoSingletonResult({
        name: args.name,
        requestedLocale,
        entry: null,
        failure: 'mode_mismatch',
      })
    }
    assertCollectionSupportsLocale(collection, args.locale)

    const row = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_orderKey', (q) =>
        q.eq('collection', collection.slug).eq('locale', args.locale!),
      )
      .first()
    const path = row
      ? await publicPathForEntry(ctx, row, {
          pathPrefix: pathPrefixForLocale(collection, args.locale),
          rootSlug: rootSlugForLocale(collection, args.locale),
        })
      : null
    const routingLocales = path ? await routingLocalesForCollection(ctx, collection) : []

    return toGinkoSingletonResult({
      name: args.name,
      requestedLocale: args.locale,
      entry: row && path ? mapPublicEntryAtKnownPath(row, path, routingLocales) : null,
      translations:
        row && path ? await getTranslationsForEntry(ctx, collection.slug, row.entryId) : [],
      failure: row && path ? null : 'no_published_entry',
    })
  },
})

export const siteData = callerQuery.public({
  id: 'public:siteData',
  args: siteDataArgs.args,
  returns: ginkoSiteDataResultValidator,
  handler: async (ctx, args) => {
    validatePublicTextArgs(args)
    const row = await ctx.db
      .query('siteData')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .first()
    const requestedLocale = args.locale ?? 'default'
    if (!row || row.visibility !== 'public') {
      return toGinkoSiteDataResult({
        key: args.key,
        requestedLocale,
        data: null,
      })
    }
    if (!row.localized || !args.locale) {
      return toGinkoSiteDataResult({
        key: args.key,
        requestedLocale,
        data: row.data ?? null,
      })
    }
    const { chain } = await getLocaleChain(ctx, args.locale)
    for (const locale of chain) {
      const value = (row.data as JsonMap | undefined)?.[locale]
      if (value !== undefined) {
        return toGinkoSiteDataResult({
          key: args.key,
          requestedLocale: args.locale,
          resolvedLocale: locale,
          data: value as JsonValue,
          fallbacks: locale === args.locale ? [] : [{ path: args.key, from: locale }],
        })
      }
    }
    return toGinkoSiteDataResult({
      key: args.key,
      requestedLocale: args.locale,
      data: null,
    })
  },
})
