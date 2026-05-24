import {
  list as listArgs,
  nav as navArgs,
  page as pageArgs,
  routeMeta as routeMetaArgs,
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
  ginkoSearchResultValidator,
  ginkoSingletonResultValidator,
  ginkoSitemapResultValidator,
  ginkoSiteDataResultValidator,
  ginkoSurroundResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonMap, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from './_generated/dataModel.js'
import { allowPublic } from './auth/checks.js'
import {
  getActivePublicPageByPath,
  getActivePublicPageByStableId,
  mapActivePublicEntryRow,
} from './entries/projections.js'
import { throwCmsError } from './errors.js'
import { callerQuery } from './functions.js'
import {
  assertCollectionSupportsLocale,
  getCollection,
  isRouteBackedCollection,
  needsStableId,
} from './lib/collections.js'
import { getCmsSettings, getLocaleChain } from './lib/locale.js'
import { parseStableIdFromPath } from './lib/paths.js'
import type { QueryOrMutationCtx } from './lib/types.js'
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
const NAV_MAX_ROWS = 1000
const SEARCH_SCAN_MAX_ROWS = 500
const PUBLIC_QUERY_MAX_LENGTH = 256
const PUBLIC_STRING_MAX_LENGTH = 512
const PUBLIC_LOCALE_MAX_LENGTH = 32
const PUBLIC_COLLECTION_MAX_LENGTH = 80
const PUBLIC_SORT_INDEXES = {
  orderKey: 'by_collection_locale_orderKey_entry',
  path: 'by_collection_locale_path_entry',
  entryCreatedAt: 'by_collection_locale_entryCreatedAt_entry',
  firstPublishedAt: 'by_collection_locale_firstPublishedAt_entry',
  lastPublishedAt: 'by_collection_locale_lastPublishedAt_entry',
} as const

type PublicEntryRow = Doc<'publicEntries'>
type CollectionDoc = NonNullable<Awaited<ReturnType<typeof getCollection>>>
type PublicSortField = keyof typeof PUBLIC_SORT_INDEXES
type PublicEntryCursor = {
  v: 1
  kind: 'publicEntries'
  field: PublicSortField
  direction: 'asc' | 'desc'
  value: string | number
  entryId: string
}
type PublicSearchCursor = {
  v: 1
  kind: 'publicSearch'
  offset: number
}

async function getDefaultLocale(ctx: Parameters<typeof getCmsSettings>[0], fallback: string) {
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
  validateLength(args.cursor, 'cursor', PUBLIC_STRING_MAX_LENGTH)
  validateLength(args.query, 'query', PUBLIC_QUERY_MAX_LENGTH)
  validateLength(args.pathPrefix, 'pathPrefix', PUBLIC_STRING_MAX_LENGTH)
}

function validatePublicListSort(args: { sort?: string }) {
  if (!args.sort) return
  const [field, direction] = args.sort.split(':')
  if (
    !field ||
    !direction ||
    !(field in PUBLIC_SORT_INDEXES) ||
    (direction !== 'asc' && direction !== 'desc')
  ) {
    throwCmsError(
      'INVALID_SORT',
      'Public sort supports only orderKey, entryCreatedAt, firstPublishedAt, and lastPublishedAt.',
    )
  }
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

function upperBoundForPrefix(prefix: string) {
  return `${prefix}\uFFFF`
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
  ctx: QueryOrMutationCtx,
  args: { locale: string; fallback?: boolean | string[] },
) {
  if (args.fallback === false) return [args.locale]
  if (Array.isArray(args.fallback)) return Array.from(new Set([args.locale, ...args.fallback]))
  return (await getLocaleChain(ctx, args.locale)).chain
}

async function paginatePublicEntriesForCollection(
  ctx: QueryOrMutationCtx,
  args: {
    collectionId: Id<'collections'>
    locale: string
    limit: number
    cursor?: string | null
    sortField?: PublicSortField
    direction?: 'asc' | 'desc'
    pathPrefix?: string | null
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
  let rows: PublicEntryRow[]
  if (sortField === 'path' && args.pathPrefix) {
    const upperBound = upperBoundForPrefix(args.pathPrefix)
    if (!cursor) {
      rows = await ctx.db
        .query('publicEntries')
        .withIndex('by_collection_locale_path_entry', (q) =>
          q
            .eq('collectionId', args.collectionId)
            .eq('locale', args.locale)
            .gte('path', args.pathPrefix!)
            .lt('path', upperBound),
        )
        .order(direction)
        .take(args.limit + 1)
    } else {
      const value = String(cursor.value)
      rows = await takePublicEntryTuplePage(args.limit, async (remaining) => {
        const sameValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_path_entry', (q) => {
            const scoped = q
              .eq('collectionId', args.collectionId)
              .eq('locale', args.locale)
              .eq('path', value)
            return direction === 'asc'
              ? scoped.gt('entryId', cursor.entryId as Id<'entries'>)
              : scoped.lt('entryId', cursor.entryId as Id<'entries'>)
          })
          .order(direction)
          .take(remaining)
        if (sameValueRows.length >= remaining) return sameValueRows
        const nextValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_path_entry', (q) => {
            const scoped = q.eq('collectionId', args.collectionId).eq('locale', args.locale)
            return scoped.gt('path', value).lt('path', upperBound)
          })
          .order('asc')
          .take(remaining - sameValueRows.length)
        return [...sameValueRows, ...nextValueRows]
      })
    }
  } else if (sortField === 'orderKey') {
    if (!cursor) {
      rows = await ctx.db
        .query('publicEntries')
        .withIndex('by_collection_locale_orderKey_entry', (q) =>
          q.eq('collectionId', args.collectionId).eq('locale', args.locale),
        )
        .order(direction)
        .take(args.limit + 1)
    } else {
      const value = String(cursor.value)
      rows = await takePublicEntryTuplePage(args.limit, async (remaining) => {
        const sameValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_orderKey_entry', (q) => {
            const scoped = q
              .eq('collectionId', args.collectionId)
              .eq('locale', args.locale)
              .eq('orderKey', value)
            return direction === 'asc'
              ? scoped.gt('entryId', cursor.entryId as Id<'entries'>)
              : scoped.lt('entryId', cursor.entryId as Id<'entries'>)
          })
          .order(direction)
          .take(remaining)
        if (sameValueRows.length >= remaining) return sameValueRows
        const nextValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_orderKey_entry', (q) => {
            const scoped = q.eq('collectionId', args.collectionId).eq('locale', args.locale)
            return direction === 'asc' ? scoped.gt('orderKey', value) : scoped.lt('orderKey', value)
          })
          .order(direction)
          .take(remaining - sameValueRows.length)
        return [...sameValueRows, ...nextValueRows]
      })
    }
  } else if (sortField === 'entryCreatedAt') {
    if (!cursor) {
      rows = await ctx.db
        .query('publicEntries')
        .withIndex('by_collection_locale_entryCreatedAt_entry', (q) =>
          q.eq('collectionId', args.collectionId).eq('locale', args.locale),
        )
        .order(direction)
        .take(args.limit + 1)
    } else {
      const value = Number(cursor.value)
      rows = await takePublicEntryTuplePage(args.limit, async (remaining) => {
        const sameValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_entryCreatedAt_entry', (q) => {
            const scoped = q
              .eq('collectionId', args.collectionId)
              .eq('locale', args.locale)
              .eq('entryCreatedAt', value)
            return direction === 'asc'
              ? scoped.gt('entryId', cursor.entryId as Id<'entries'>)
              : scoped.lt('entryId', cursor.entryId as Id<'entries'>)
          })
          .order(direction)
          .take(remaining)
        if (sameValueRows.length >= remaining) return sameValueRows
        const nextValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_entryCreatedAt_entry', (q) => {
            const scoped = q.eq('collectionId', args.collectionId).eq('locale', args.locale)
            return direction === 'asc'
              ? scoped.gt('entryCreatedAt', value)
              : scoped.lt('entryCreatedAt', value)
          })
          .order(direction)
          .take(remaining - sameValueRows.length)
        return [...sameValueRows, ...nextValueRows]
      })
    }
  } else if (sortField === 'firstPublishedAt') {
    if (!cursor) {
      rows = await ctx.db
        .query('publicEntries')
        .withIndex('by_collection_locale_firstPublishedAt_entry', (q) =>
          q.eq('collectionId', args.collectionId).eq('locale', args.locale),
        )
        .order(direction)
        .take(args.limit + 1)
    } else {
      const value = Number(cursor.value)
      rows = await takePublicEntryTuplePage(args.limit, async (remaining) => {
        const sameValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_firstPublishedAt_entry', (q) => {
            const scoped = q
              .eq('collectionId', args.collectionId)
              .eq('locale', args.locale)
              .eq('firstPublishedAt', value)
            return direction === 'asc'
              ? scoped.gt('entryId', cursor.entryId as Id<'entries'>)
              : scoped.lt('entryId', cursor.entryId as Id<'entries'>)
          })
          .order(direction)
          .take(remaining)
        if (sameValueRows.length >= remaining) return sameValueRows
        const nextValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_firstPublishedAt_entry', (q) => {
            const scoped = q.eq('collectionId', args.collectionId).eq('locale', args.locale)
            return direction === 'asc'
              ? scoped.gt('firstPublishedAt', value)
              : scoped.lt('firstPublishedAt', value)
          })
          .order(direction)
          .take(remaining - sameValueRows.length)
        return [...sameValueRows, ...nextValueRows]
      })
    }
  } else {
    if (!cursor) {
      rows = await ctx.db
        .query('publicEntries')
        .withIndex('by_collection_locale_lastPublishedAt_entry', (q) =>
          q.eq('collectionId', args.collectionId).eq('locale', args.locale),
        )
        .order(direction)
        .take(args.limit + 1)
    } else {
      const value = Number(cursor.value)
      rows = await takePublicEntryTuplePage(args.limit, async (remaining) => {
        const sameValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_lastPublishedAt_entry', (q) => {
            const scoped = q
              .eq('collectionId', args.collectionId)
              .eq('locale', args.locale)
              .eq('lastPublishedAt', value)
            return direction === 'asc'
              ? scoped.gt('entryId', cursor.entryId as Id<'entries'>)
              : scoped.lt('entryId', cursor.entryId as Id<'entries'>)
          })
          .order(direction)
          .take(remaining)
        if (sameValueRows.length >= remaining) return sameValueRows
        const nextValueRows = await ctx.db
          .query('publicEntries')
          .withIndex('by_collection_locale_lastPublishedAt_entry', (q) => {
            const scoped = q.eq('collectionId', args.collectionId).eq('locale', args.locale)
            return direction === 'asc'
              ? scoped.gt('lastPublishedAt', value)
              : scoped.lt('lastPublishedAt', value)
          })
          .order(direction)
          .take(remaining - sameValueRows.length)
        return [...sameValueRows, ...nextValueRows]
      })
    }
  }

  return publicEntriesPage(rows, args.limit, sortField, direction)
}

async function takePublicEntryTuplePage(
  limit: number,
  readRows: (remaining: number) => Promise<PublicEntryRow[]>,
) {
  return await readRows(limit + 1)
}

function publicEntriesPage(
  rows: PublicEntryRow[],
  limit: number,
  sortField: PublicSortField,
  direction: 'asc' | 'desc',
) {
  const isDone = rows.length <= limit
  const page = isDone ? rows : rows.slice(0, limit)
  return {
    page,
    isDone,
    continueCursor:
      isDone || page.length === 0
        ? null
        : encodePublicEntryCursor(page[page.length - 1]!, sortField, direction),
  }
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
    value: row[field],
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

function encodePublicSearchCursor(offset: number) {
  return JSON.stringify({
    v: 1,
    kind: 'publicSearch',
    offset,
  } satisfies PublicSearchCursor)
}

function parsePublicSearchCursor(cursor: string | null | undefined) {
  if (!cursor) return 0
  let parsed: unknown
  try {
    parsed = JSON.parse(cursor)
  } catch {
    throwCmsError('INVALID_CURSOR', 'Invalid search pagination cursor.', { cursor })
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as PublicSearchCursor).v !== 1 ||
    (parsed as PublicSearchCursor).kind !== 'publicSearch' ||
    !Number.isInteger((parsed as PublicSearchCursor).offset) ||
    (parsed as PublicSearchCursor).offset < 0 ||
    (parsed as PublicSearchCursor).offset >= SEARCH_SCAN_MAX_ROWS
  ) {
    throwCmsError('INVALID_CURSOR', 'Invalid search pagination cursor.', { cursor })
  }
  return (parsed as PublicSearchCursor).offset
}

function mapPublicEntry(row: PublicEntryRow, collection: CollectionDoc) {
  return mapActivePublicEntryRow(row, collection) as PublicProjectionEntry
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
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
): Promise<PublicTranslationSummary[]> {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
    .collect()
  return rows.map((row) => ({
    locale: row.locale,
    slug: row.slug,
    path: row.path,
    href: row.href,
    published: true,
  }))
}

async function getTranslationsByEntryId(
  ctx: Parameters<typeof getCmsSettings>[0],
  rows: Array<{ entryId: Id<'entries'> }>,
) {
  const result = new Map<string, PublicTranslationSummary[]>()
  for (const row of rows) {
    result.set(String(row.entryId), await getTranslationsForEntry(ctx, row.entryId))
  }
  return result
}

async function resolvePublicPage(
  ctx: QueryOrMutationCtx,
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
    }
  }

  const chain = args.ref ? await resolvePublicLocaleChain(ctx, args) : [args.locale]
  let requestedPath = args.path ?? args.ref ?? ''
  let projected = null
  let translations: PublicTranslationSummary[] = []

  for (const locale of chain) {
    if (args.ref) {
      projected = await getActivePublicPageByStableId(ctx, args.collection._id, locale, args.ref)
      if (projected) {
        translations = await getTranslationsForEntry(ctx, projected.entryId)
        break
      }
      continue
    }

    requestedPath = args.path!
    projected = await getActivePublicPageByPath(ctx, args.collection._id, locale, args.path!)
    if (projected) {
      translations = await getTranslationsForEntry(ctx, projected.entryId)
      break
    }

    if (!needsStableId(args.collection)) {
      continue
    }

    const stableId = parseStableIdFromPath(args.path!)
    if (stableId) {
      projected = await getActivePublicPageByStableId(ctx, args.collection._id, locale, stableId)
    }
    if (projected) {
      translations = await getTranslationsForEntry(ctx, projected.entryId)
      break
    }
  }

  return { requestedPath, projected, translations }
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
export const page = callerQuery.protected({
  identityForwardingFunctionRef: 'public:page',
  args: pageArgs.args,
  guard: allowPublic,
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

    const { requestedPath, projected, translations } = await resolvePublicPage(ctx, {
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
        defaultLocale: await getDefaultLocale(ctx, collection.locales[0] ?? 'en'),
      })
    }

    const mapped = mapPublicEntry(projected, collection)
    return toGinkoPageResult({
      collection: args.collection,
      requestedLocale: args.locale,
      requestedPath,
      result: {
        page: mapped,
        redirectTo: args.ref || mapped.path === requestedPath ? null : mapped.path,
      },
      translations,
      defaultLocale: await getDefaultLocale(ctx, collection.locales[0] ?? 'en'),
    })
  },
})

export const routeMeta = callerQuery.protected({
  identityForwardingFunctionRef: 'public:routeMeta',
  args: routeMetaArgs.args,
  guard: allowPublic,
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

    const { requestedPath, projected, translations } = await resolvePublicPage(ctx, {
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
        defaultLocale: await getDefaultLocale(ctx, collection.locales[0] ?? 'en'),
      })
    }

    const mapped = {
      ...mapPublicEntry(projected, collection),
      data: {},
    }
    return toGinkoPageResult({
      collection: args.collection,
      requestedLocale: args.locale,
      requestedPath,
      result: {
        page: mapped,
        redirectTo: args.ref || mapped.path === requestedPath ? null : mapped.path,
      },
      translations,
      defaultLocale: await getDefaultLocale(ctx, collection.locales[0] ?? 'en'),
    })
  },
})

export const list = callerQuery.protected({
  identityForwardingFunctionRef: 'public:list',
  args: listArgs.args,
  guard: allowPublic,
  returns: ginkoListResultValidator,
  handler: async (ctx, args) => {
    validatePublicTextArgs(args)
    validatePublicListSort(args)
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
    const [sortField = 'orderKey', sortDirection = 'asc'] = (args.sort ?? 'orderKey:asc').split(
      ':',
    ) as [keyof typeof PUBLIC_SORT_INDEXES, 'asc' | 'desc']
    const result = await paginatePublicEntriesForCollection(ctx, {
      collectionId: collection._id,
      locale: args.locale,
      limit,
      cursor: args.cursor,
      sortField,
      direction: sortDirection,
      pathPrefix: args.pathPrefix,
    })
    const pageRows = result.page
    const translationsByEntryId = await getTranslationsByEntryId(ctx, pageRows)

    return toGinkoListResult({
      collection: args.collection,
      requestedLocale: args.locale,
      result: {
        page: pageRows.map((row) => mapPublicEntry(row, collection)),
        isDone: result.isDone,
        continueCursor: result.isDone ? null : result.continueCursor,
      },
      translationsByEntryId,
    })
  },
})

export const nav = callerQuery.protected({
  identityForwardingFunctionRef: 'public:nav',
  args: navArgs.args,
  guard: allowPublic,
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
    const scannedRows = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_orderKey', (q) =>
        q.eq('collectionId', collection._id).eq('locale', args.locale),
      )
      .order('asc')
      .take(NAV_MAX_ROWS + 1)
    if (scannedRows.length > NAV_MAX_ROWS) {
      throwCmsError(
        'PUBLIC_NAV_TOO_LARGE',
        `Public navigation tree for "${args.collection}" and locale "${args.locale}" exceeds ${NAV_MAX_ROWS} rows. Split the tree or exclude entries from navigation.`,
        { collection: args.collection, locale: args.locale, maxRows: NAV_MAX_ROWS },
      )
    }
    const rows = scannedRows.filter((row) => publicFlag(row, 'navigation'))
    const translationsByEntryId = await getTranslationsByEntryId(ctx, rows)
    const nodes = new Map<string, { entry: ReturnType<typeof toGinkoEntry>; children: unknown[] }>()
    const roots: Array<{ entry: ReturnType<typeof toGinkoEntry>; children: unknown[] }> = []

    for (const row of rows) {
      if (row.navIncluded === false) continue
      const entry = toNavigationEntry(
        mapPublicEntry(row, collection),
        args.locale,
        translationsByEntryId.get(String(row.entryId)) ?? [],
      )
      nodes.set(String(row.entryId), { entry, children: [] })
    }

    for (const row of rows) {
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

export const surround = callerQuery.protected({
  identityForwardingFunctionRef: 'public:surround',
  args: surroundArgs.args,
  guard: allowPublic,
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
    const current = await getActivePublicPageByPath(ctx, collection._id, args.locale, args.path)
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
          .eq('collectionId', collection._id)
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
          .eq('collectionId', collection._id)
          .eq('locale', args.locale)
          .eq('parentEntryId', current.parentEntryId ?? null)
          .gt('orderKey', current.orderKey),
      )
      .order('asc')
      .take(nextLimit)
    const allRows = [...previousRows, ...nextRows]
    const translationsByEntryId = await getTranslationsByEntryId(ctx, allRows)
    const mapRow = (row: (typeof allRows)[number]) =>
      toGinkoEntry(
        mapPublicEntry(row, collection),
        args.locale,
        translationsByEntryId.get(String(row.entryId)) ?? [],
      )

    return {
      previous: previousRows.map(mapRow),
      next: nextRows.map(mapRow),
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

export const search = callerQuery.protected({
  identityForwardingFunctionRef: 'public:search',
  args: searchArgs.args,
  guard: allowPublic,
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
    const offset = parsePublicSearchCursor(args.cursor)
    const scanLimit = Math.min(offset + limit + 1, SEARCH_SCAN_MAX_ROWS + 1)
    const searchRows = await ctx.db
      .query('publicEntries')
      .withSearchIndex('search_locale', (q) =>
        q
          .search('searchText', args.query)
          .eq('locale', args.locale)
          .eq('collectionId', collection._id),
      )
      .take(scanLimit)
    const resultRows = searchRows.slice(offset, offset + limit + 1)
    const hasNextPage = resultRows.length > limit && offset + limit < SEARCH_SCAN_MAX_ROWS
    const pageRows = hasNextPage ? resultRows.slice(0, limit) : resultRows
    const matches = []
    for (const row of pageRows) {
      if (!publicFlag(row, 'search')) continue
      const snippet = buildSnippet(row.searchText, args.query)
      const mapped = mapPublicEntry(row, collection)
      matches.push({
        ...mapped,
        snippet: snippet.text,
        highlights: snippet.highlights,
      })
    }
    return toGinkoSearchResult({
      requestedLocale: args.locale,
      results: matches as PublicProjectionEntry[],
      pageInfo: {
        hasNextPage,
        endCursor: hasNextPage ? encodePublicSearchCursor(offset + pageRows.length) : null,
      },
    })
  },
})

export const sitemap = callerQuery.protected({
  identityForwardingFunctionRef: 'public:sitemap',
  args: sitemapArgs.args,
  guard: allowPublic,
  returns: ginkoSitemapResultValidator,
  handler: async (ctx, args) => {
    validatePublicTextArgs(args)
    const collection = await getCollection(ctx, args.collection)
    if (!collection) {
      return toGinkoSitemapResult({
        entries: [],
        translationsByEntryId: new Map(),
        defaultLocale: await getDefaultLocale(ctx, 'en'),
      })
    }
    assertRouteBackedCollection(collection)
    assertCollectionSupportsLocale(collection, args.locale)
    const limit = validatePublicLimit(args.limit, SITEMAP_DEFAULT_LIMIT, SITEMAP_MAX_LIMIT)
    const result = await paginatePublicEntriesForCollection(ctx, {
      collectionId: collection._id,
      locale: args.locale,
      limit,
      cursor: args.cursor,
      sortField: 'orderKey',
      direction: 'asc',
    })

    const filteredRows = result.page.filter((row) => publicFlag(row, 'sitemap'))
    const entries = filteredRows.map((row) => mapPublicEntry(row, collection))
    const translationRows = filteredRows.map((row) => ({ entryId: row.entryId }))
    const translationsByEntryId = await getTranslationsByEntryId(ctx, translationRows)

    return toGinkoSitemapResult({
      entries,
      translationsByEntryId,
      defaultLocale: await getDefaultLocale(ctx, 'en'),
      pageInfo: {
        hasNextPage: !result.isDone,
        endCursor: result.isDone ? null : result.continueCursor,
      },
    })
  },
})

export const singleton = callerQuery.protected({
  identityForwardingFunctionRef: 'public:singleton',
  args: singletonArgs.args,
  guard: allowPublic,
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
        q.eq('collectionId', collection._id).eq('locale', args.locale!),
      )
      .first()

    return toGinkoSingletonResult({
      name: args.name,
      requestedLocale: args.locale,
      entry: row ? mapPublicEntry(row, collection) : null,
      translations: row ? await getTranslationsForEntry(ctx, row.entryId) : [],
      failure: row ? null : 'no_published_entry',
    })
  },
})

export const siteData = callerQuery.protected({
  identityForwardingFunctionRef: 'public:siteData',
  args: siteDataArgs.args,
  guard: allowPublic,
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
