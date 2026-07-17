import type { Doc } from './_generated/dataModel.js'
import { publicPathForEntry } from './entries/workflow/publicTree.js'
import { throwCmsError } from './errors.js'
import type { getCollection } from './lib/collections.js'
import { pathPrefixForLocale, rootSlugForLocale } from './lib/paths.js'
import type { QueryCtx } from './lib/types.js'

type PublicEntryRow = Doc<'publicEntries'>
type CollectionDoc = NonNullable<Awaited<ReturnType<typeof getCollection>>>
type PublicSearchCursor = {
  v: 1
  kind: 'publicSearch'
  collection: string
  locale: string
  query: string
  generation: string
  canonicalKey: string
  projectionId: string
}
type PublicRoutesCursor = {
  v: 1
  kind: 'publicRoutes'
  source: 'cms'
  collection: string
  locale: string
  generation: string
  canonicalKey: string
  projectionId: string
}

export async function paginatePublicSearch(
  ctx: QueryCtx,
  args: {
    collection: CollectionDoc
    locale: string
    query: string
    limit: number
    cursor?: string | null
    generation: string
  },
) {
  const cursor = parsePublicSearchCursor({
    cursor: args.cursor,
    collection: args.collection.slug,
    locale: args.locale,
    query: args.query,
    generation: args.generation,
  })
  if (cursor) {
    const cursorRow = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_stableId', (query) =>
        query
          .eq('collection', args.collection.slug)
          .eq('locale', args.locale)
          .eq('stableId', cursor.canonicalKey),
      )
      .unique()
    if (!cursorRow || String(cursorRow._id) !== cursor.projectionId) {
      throwCmsError('INVALID_CURSOR', 'Public search cursor no longer identifies its projection.')
    }
  }

  const normalizedTerms = normalizeSearchText(args.query).split(' ')
  const candidates: Array<{ row: PublicEntryRow; path: string }> = []
  let afterStableId = cursor?.canonicalKey ?? null
  let exhausted = false
  while (!exhausted && candidates.length <= args.limit) {
    const remaining = args.limit + 1 - candidates.length
    const batchSize = Math.max(32, Math.min(250, remaining * 4))
    const batch = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_stableId', (query) => {
        const scope = query.eq('collection', args.collection.slug).eq('locale', args.locale)
        return afterStableId ? scope.gt('stableId', afterStableId) : scope
      })
      .order('asc')
      .take(batchSize)
    exhausted = batch.length < batchSize
    if (!batch.length) break
    for (const row of batch) {
      if (row.stableId === afterStableId) {
        throwCmsError('INVALID_QUERY', 'Published search identity is not unique.', {
          collection: args.collection.slug,
          canonicalKey: row.stableId,
          locale: row.locale,
        })
      }
      const searchable = normalizeSearchText(row.searchText ?? '')
      if (
        row.searchIncluded === true &&
        normalizedTerms.every((term) => searchable.includes(term))
      ) {
        const path = await publicPathForEntry(ctx, row, {
          pathPrefix: pathPrefixForLocale(args.collection, args.locale),
          rootSlug: rootSlugForLocale(args.collection, args.locale),
        })
        if (path) candidates.push({ row, path })
      }
      afterStableId = row.stableId
      if (candidates.length > args.limit) break
    }
  }

  const hasNextPage = candidates.length > args.limit
  const page = hasNextPage ? candidates.slice(0, args.limit) : candidates
  return {
    page,
    hasNextPage,
    endCursor:
      hasNextPage && page.length
        ? encodePublicSearchCursor({
            row: page[page.length - 1]!.row,
            collection: args.collection.slug,
            locale: args.locale,
            query: args.query,
            generation: args.generation,
          })
        : null,
  }
}

function normalizeSearchText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function encodePublicSearchCursor(args: {
  row: PublicEntryRow
  collection: string
  locale: string
  query: string
  generation: string
}) {
  return JSON.stringify({
    v: 1,
    kind: 'publicSearch',
    collection: args.collection,
    locale: args.locale,
    query: args.query,
    generation: args.generation,
    canonicalKey: args.row.stableId,
    projectionId: String(args.row._id),
  } satisfies PublicSearchCursor)
}

function parsePublicSearchCursor(args: {
  cursor: string | null | undefined
  collection: string
  locale: string
  query: string
  generation: string
}) {
  if (!args.cursor) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(args.cursor)
  } catch {
    throwCmsError('INVALID_CURSOR', 'Invalid search pagination cursor.')
  }
  const cursor = parsed as Partial<PublicSearchCursor>
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    cursor.v !== 1 ||
    cursor.kind !== 'publicSearch' ||
    cursor.collection !== args.collection ||
    cursor.locale !== args.locale ||
    cursor.query !== args.query ||
    cursor.generation !== args.generation ||
    typeof cursor.canonicalKey !== 'string' ||
    !cursor.canonicalKey ||
    typeof cursor.projectionId !== 'string' ||
    !cursor.projectionId
  ) {
    throwCmsError('INVALID_CURSOR', 'Invalid or expired search pagination cursor.')
  }
  return cursor as PublicSearchCursor
}

export async function paginatePublicRoutes(
  ctx: QueryCtx,
  args: {
    collection: CollectionDoc
    locale: string
    limit: number
    cursor?: string | null
    generation: string
  },
) {
  const cursor = parsePublicRoutesCursor({
    cursor: args.cursor,
    collection: args.collection.slug,
    locale: args.locale,
    generation: args.generation,
  })
  if (cursor) {
    const cursorRow = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_stableId', (query) =>
        query
          .eq('collection', args.collection.slug)
          .eq('locale', args.locale)
          .eq('stableId', cursor.canonicalKey),
      )
      .unique()
    if (!cursorRow || String(cursorRow._id) !== cursor.projectionId) {
      throwCmsError('INVALID_CURSOR', 'Public route cursor no longer identifies its projection.')
    }
  }

  const candidates: Array<{ row: PublicEntryRow; path: string }> = []
  let afterStableId = cursor?.canonicalKey ?? null
  let exhausted = false
  while (!exhausted && candidates.length <= args.limit) {
    const remaining = args.limit + 1 - candidates.length
    const batchSize = Math.max(32, Math.min(250, remaining * 2))
    const batch = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_stableId', (query) => {
        const scope = query.eq('collection', args.collection.slug).eq('locale', args.locale)
        return afterStableId ? scope.gt('stableId', afterStableId) : scope
      })
      .order('asc')
      .take(batchSize)
    exhausted = batch.length < batchSize
    if (!batch.length) break
    for (const row of batch) {
      if (!row.stableId) {
        throwCmsError('INVALID_QUERY', 'Published route is missing its stable content identity.', {
          collection: args.collection.slug,
          entryId: String(row.entryId),
          locale: row.locale,
        })
      }
      if (row.stableId === afterStableId) {
        throwCmsError('INVALID_QUERY', 'Published route identity is not unique.', {
          collection: args.collection.slug,
          canonicalKey: row.stableId,
          locale: row.locale,
        })
      }
      const path = await publicPathForEntry(ctx, row, {
        pathPrefix: pathPrefixForLocale(args.collection, args.locale),
        rootSlug: rootSlugForLocale(args.collection, args.locale),
      })
      if (path) candidates.push({ row, path })
      afterStableId = row.stableId
      if (candidates.length > args.limit) break
    }
  }

  const hasNextPage = candidates.length > args.limit
  const page = hasNextPage ? candidates.slice(0, args.limit) : candidates
  return {
    page,
    hasNextPage,
    endCursor:
      hasNextPage && page.length
        ? encodePublicRoutesCursor({
            row: page[page.length - 1]!.row,
            collection: args.collection.slug,
            locale: args.locale,
            generation: args.generation,
          })
        : null,
  }
}

function encodePublicRoutesCursor(args: {
  row: PublicEntryRow
  collection: string
  locale: string
  generation: string
}) {
  const canonicalKey = args.row.stableId
  if (!canonicalKey) {
    throwCmsError('INVALID_QUERY', 'Published route is missing its stable content identity.')
  }
  return JSON.stringify({
    v: 1,
    kind: 'publicRoutes',
    source: 'cms',
    collection: args.collection,
    locale: args.locale,
    generation: args.generation,
    canonicalKey,
    projectionId: String(args.row._id),
  } satisfies PublicRoutesCursor)
}

function parsePublicRoutesCursor(args: {
  cursor: string | null | undefined
  collection: string
  locale: string
  generation: string
}) {
  if (!args.cursor) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(args.cursor)
  } catch {
    throwCmsError('INVALID_CURSOR', 'Public route cursor is invalid.')
  }
  const cursor = parsed as Partial<PublicRoutesCursor>
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    cursor.v !== 1 ||
    cursor.kind !== 'publicRoutes' ||
    cursor.source !== 'cms' ||
    cursor.collection !== args.collection ||
    cursor.locale !== args.locale ||
    cursor.generation !== args.generation ||
    typeof cursor.canonicalKey !== 'string' ||
    !cursor.canonicalKey ||
    typeof cursor.projectionId !== 'string' ||
    !cursor.projectionId
  ) {
    throwCmsError('INVALID_CURSOR', 'Public route cursor is invalid or expired.')
  }
  return cursor as PublicRoutesCursor
}
