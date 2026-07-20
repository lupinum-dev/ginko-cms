import type { Doc } from './_generated/dataModel.js'
import {
  MAX_PUBLIC_TREE_DEPTH,
  publicPathForEntry,
  publicPathsForEntries,
  resolvePublicTreePath,
} from './entries/workflow/publicTree.js'
import { throwCmsError } from './errors.js'
import type { getCollection } from './lib/collections.js'
import {
  PUBLIC_SEARCH_MAX_MATCHES,
  PUBLIC_SEARCH_MAX_MATCHES_PER_SHARD,
  PUBLIC_SEARCH_SHARD_COUNT,
} from './lib/contentLimits.js'
import { pathPrefixForLocale, rootSlugForLocale } from './lib/paths.js'
import type { QueryCtx } from './lib/types.js'

type PublicEntryRow = Doc<'publicEntries'>
type PublicSearchRow = Doc<'publicSearchEntries'>
type CollectionDoc = NonNullable<Awaited<ReturnType<typeof getCollection>>>
type PublicSearchCursor = {
  v: 2
  kind: 'publicSearch'
  collection: string
  locale: string
  query: string
  generation: string
  offset: number
}
type PublicRoutesCursor = {
  v: 2
  g: string
  s: string
  p: string
}
type PublicSubtreeFrame = {
  parentEntryId: string | null
  orderKey: string | null
  entryId: string | null
}
type PublicSubtreeState = {
  rootEmitted: boolean
  frames: PublicSubtreeFrame[]
}
type PublicSubtreeCursor = {
  v: 1
  kind: 'publicSubtree'
  collection: string
  locale: string
  pathPrefix: string
  generation: number
  rootEntryId: string | null
  state: PublicSubtreeState
}

function cloneSubtreeState(state: PublicSubtreeState): PublicSubtreeState {
  return {
    rootEmitted: state.rootEmitted,
    frames: state.frames.map((frame) => ({ ...frame })),
  }
}

async function nextPublicChild(
  ctx: QueryCtx,
  args: {
    collection: string
    locale: string
    parentEntryId: string | null
    orderKey: string | null
    entryId: string | null
  },
) {
  const parentEntryId = args.parentEntryId as PublicEntryRow['parentEntryId']
  if (args.orderKey === null) {
    return await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
        query
          .eq('collection', args.collection)
          .eq('locale', args.locale)
          .eq('parentEntryId', parentEntryId),
      )
      .order('asc')
      .first()
  }

  const sameRank = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
      query
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq('parentEntryId', parentEntryId)
        .eq('orderKey', args.orderKey!)
        .gt('entryId', args.entryId as PublicEntryRow['entryId']),
    )
    .order('asc')
    .first()
  if (sameRank) return sameRank

  return await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
      query
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq('parentEntryId', parentEntryId)
        .gt('orderKey', args.orderKey!),
    )
    .order('asc')
    .first()
}

async function assertSubtreeState(
  ctx: QueryCtx,
  args: {
    collection: string
    locale: string
    rootEntryId: string | null
    state: PublicSubtreeState
  },
) {
  if (args.state.frames.length > MAX_PUBLIC_TREE_DEPTH + 1) {
    throwCmsError('INVALID_CURSOR', 'Public subtree cursor exceeds the supported tree depth.')
  }
  let expectedParent = args.rootEntryId
  for (const frame of args.state.frames) {
    if (frame.parentEntryId !== expectedParent) {
      throwCmsError('INVALID_CURSOR', 'Public subtree cursor does not describe one tree branch.')
    }
    if ((frame.orderKey === null) !== (frame.entryId === null)) {
      throwCmsError('INVALID_CURSOR', 'Public subtree cursor has an incomplete sibling position.')
    }
    if (frame.entryId === null && frame !== args.state.frames[args.state.frames.length - 1]) {
      throwCmsError('INVALID_CURSOR', 'Public subtree cursor has an incomplete branch position.')
    }
    if (frame.entryId !== null) {
      const row = await ctx.db
        .query('publicEntries')
        .withIndex('by_entry_locale', (query) =>
          query.eq('entryId', frame.entryId as PublicEntryRow['entryId']).eq('locale', args.locale),
        )
        .unique()
      if (
        !row ||
        row.collection !== args.collection ||
        row.locale !== args.locale ||
        String(row.parentEntryId ?? '') !== String(frame.parentEntryId ?? '') ||
        row.orderKey !== frame.orderKey
      ) {
        throwCmsError('INVALID_CURSOR', 'Public subtree cursor no longer matches the public tree.')
      }
      expectedParent = String(row.entryId)
    }
  }
}

function encodePublicSubtreeCursor(args: {
  collection: string
  locale: string
  pathPrefix: string
  generation: number
  rootEntryId: string | null
  state: PublicSubtreeState
}) {
  return JSON.stringify({
    v: 1,
    kind: 'publicSubtree',
    ...args,
  } satisfies PublicSubtreeCursor)
}

function parsePublicSubtreeCursor(
  value: string | null | undefined,
  expected: {
    collection: string
    locale: string
    pathPrefix: string
    generation: number
    rootEntryId: string | null
  },
): PublicSubtreeCursor | null {
  if (!value) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throwCmsError('INVALID_CURSOR', 'Public subtree cursor is invalid.')
  }
  const cursor = parsed as Partial<PublicSubtreeCursor>
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    cursor.v !== 1 ||
    cursor.kind !== 'publicSubtree' ||
    cursor.collection !== expected.collection ||
    cursor.locale !== expected.locale ||
    cursor.pathPrefix !== expected.pathPrefix ||
    cursor.generation !== expected.generation ||
    cursor.rootEntryId !== expected.rootEntryId ||
    !cursor.state ||
    typeof cursor.state !== 'object' ||
    typeof cursor.state.rootEmitted !== 'boolean' ||
    !Array.isArray(cursor.state.frames) ||
    cursor.state.frames.some(
      (frame) =>
        !frame ||
        typeof frame !== 'object' ||
        (frame.parentEntryId !== null && typeof frame.parentEntryId !== 'string') ||
        (frame.orderKey !== null && typeof frame.orderKey !== 'string') ||
        (frame.entryId !== null && typeof frame.entryId !== 'string'),
    )
  ) {
    throwCmsError('INVALID_CURSOR', 'Public subtree cursor is invalid or expired.')
  }
  return cursor as PublicSubtreeCursor
}

/**
 * Pages a structural subtree without scanning unrelated public rows. The
 * cursor contains the bounded depth-first traversal stack and is fenced by the
 * locale route generation, so a move or publication invalidates it cleanly.
 */
export async function paginatePublicSubtree(
  ctx: QueryCtx,
  args: {
    collection: CollectionDoc
    locale: string
    pathPrefix: string
    limit: number
    cursor?: string | null
    generation: number
    include?: (row: PublicEntryRow) => boolean
  },
) {
  const requestedPrefix = args.pathPrefix
  const options = {
    pathPrefix: pathPrefixForLocale(args.collection, args.locale),
    rootSlug: rootSlugForLocale(args.collection, args.locale),
  }
  const resolvedRoot = await resolvePublicTreePath(ctx, {
    collection: args.collection.slug,
    locale: args.locale,
    path: requestedPrefix,
    options,
  })
  const collectionPrefix = pathPrefixForLocale(args.collection, args.locale) || '/'
  const virtualRoot = !resolvedRoot && requestedPrefix === collectionPrefix && !options.rootSlug
  if (!resolvedRoot && !virtualRoot) {
    return { page: [], paths: new Map<string, string>(), isDone: true, continueCursor: null }
  }

  const rootEntryId = resolvedRoot ? String(resolvedRoot.row.entryId) : null
  const cursor = parsePublicSubtreeCursor(args.cursor, {
    collection: args.collection.slug,
    locale: args.locale,
    pathPrefix: requestedPrefix,
    generation: args.generation,
    rootEntryId,
  })
  const state: PublicSubtreeState = cursor
    ? cloneSubtreeState(cursor.state)
    : resolvedRoot
      ? { rootEmitted: false, frames: [] }
      : {
          rootEmitted: true,
          frames: [{ parentEntryId: null, orderKey: null, entryId: null }],
        }
  await assertSubtreeState(ctx, {
    collection: args.collection.slug,
    locale: args.locale,
    rootEntryId,
    state,
  })

  const candidates: Array<{
    row: PublicEntryRow
    path: string
    state: PublicSubtreeState
  }> = []
  const nextRow = async (): Promise<PublicEntryRow | null> => {
    if (!state.rootEmitted && resolvedRoot) {
      state.rootEmitted = true
      state.frames.push({
        parentEntryId: String(resolvedRoot.row.entryId),
        orderKey: null,
        entryId: null,
      })
      return resolvedRoot.row
    }
    while (state.frames.length > 0) {
      const frame = state.frames[state.frames.length - 1]!
      const child = await nextPublicChild(ctx, {
        collection: args.collection.slug,
        locale: args.locale,
        ...frame,
      })
      if (!child) {
        state.frames.pop()
        continue
      }
      frame.orderKey = child.orderKey
      frame.entryId = String(child.entryId)
      state.frames.push({
        parentEntryId: String(child.entryId),
        orderKey: null,
        entryId: null,
      })
      return child
    }
    return null
  }

  while (candidates.length <= args.limit) {
    const row = await nextRow()
    if (!row) break
    const path = await publicPathForEntry(ctx, row, options)
    if (!path || !(args.include?.(row) ?? true)) continue
    candidates.push({ row, path, state: cloneSubtreeState(state) })
  }

  const hasNextPage = candidates.length > args.limit
  const selected = hasNextPage ? candidates.slice(0, args.limit) : candidates
  const page = selected.map((candidate) => candidate.row)
  return {
    page,
    paths: new Map(selected.map((candidate) => [String(candidate.row.entryId), candidate.path])),
    isDone: !hasNextPage,
    continueCursor:
      hasNextPage && selected.length > 0
        ? encodePublicSubtreeCursor({
            collection: args.collection.slug,
            locale: args.locale,
            pathPrefix: requestedPrefix,
            generation: args.generation,
            rootEntryId,
            state: selected[selected.length - 1]!.state,
          })
        : null,
  }
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
  const shardPages = await Promise.all(
    Array.from({ length: PUBLIC_SEARCH_SHARD_COUNT }, async (_, searchShard) =>
      ctx.db
        .query('publicSearchEntries')
        .withSearchIndex('search_locale', (query) =>
          query
            .search('searchText', args.query.trim())
            .eq('locale', args.locale)
            .eq('collection', args.collection.slug)
            .eq('searchShard', searchShard),
        )
        .take(PUBLIC_SEARCH_MAX_MATCHES_PER_SHARD + 1),
    ),
  )
  const broadShard = shardPages.findIndex(
    (page) => page.length > PUBLIC_SEARCH_MAX_MATCHES_PER_SHARD,
  )
  if (broadShard >= 0) {
    return throwCmsError(
      'PUBLIC_SEARCH_TOO_BROAD',
      'Public search matched too many entries. Use a more specific query.',
      {
        collection: args.collection.slug,
        locale: args.locale,
        shard: broadShard,
        maxMatches: PUBLIC_SEARCH_MAX_MATCHES,
      },
    )
  }
  const matches = shardPages.flat()
  if (matches.length > PUBLIC_SEARCH_MAX_MATCHES) {
    return throwCmsError(
      'PUBLIC_SEARCH_TOO_BROAD',
      'Public search matched too many entries. Use a more specific query.',
      {
        collection: args.collection.slug,
        locale: args.locale,
        actualMatches: matches.length,
        maxMatches: PUBLIC_SEARCH_MAX_MATCHES,
      },
    )
  }
  matches.sort((left, right) =>
    left.stableId === right.stableId
      ? String(left._id).localeCompare(String(right._id))
      : left.stableId.localeCompare(right.stableId),
  )
  const offset = cursor?.offset ?? 0
  if (offset > matches.length) {
    return throwCmsError('INVALID_CURSOR', 'Search cursor no longer matches the result set.')
  }
  const selectedSearchRows = matches.slice(offset, offset + args.limit)

  const candidates: Array<{
    row: PublicEntryRow
    searchRow: PublicSearchRow
    path: string
  }> = []
  for (const searchRow of selectedSearchRows) {
    const row = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (query) =>
        query.eq('entryId', searchRow.entryId).eq('locale', searchRow.locale),
      )
      .unique()
    if (
      !row ||
      row.revisionId !== searchRow.revisionId ||
      row.collection !== searchRow.collection
    ) {
      return throwCmsError(
        'PUBLIC_PROJECTION_REBUILD_REQUIRED',
        'Published search projection does not match its active structural projection.',
        { entryId: String(searchRow.entryId), locale: searchRow.locale },
      )
    }
    const path = await publicPathForEntry(ctx, row, {
      pathPrefix: pathPrefixForLocale(args.collection, args.locale),
      rootSlug: rootSlugForLocale(args.collection, args.locale),
    })
    // A published descendant whose public parent is absent remains canonical
    // editorial state, but it is not publicly discoverable.
    if (path) candidates.push({ row, searchRow, path })
  }

  const nextOffset = offset + selectedSearchRows.length
  const hasNextPage = nextOffset < matches.length
  return {
    page: candidates,
    hasNextPage,
    endCursor: hasNextPage
      ? encodePublicSearchCursor({
          collection: args.collection.slug,
          locale: args.locale,
          query: args.query,
          generation: args.generation,
          offset: nextOffset,
        })
      : null,
  }
}

function encodePublicSearchCursor(args: {
  collection: string
  locale: string
  query: string
  generation: string
  offset: number
}) {
  return JSON.stringify({
    v: 2,
    kind: 'publicSearch',
    collection: args.collection,
    locale: args.locale,
    query: args.query,
    generation: args.generation,
    offset: args.offset,
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
    cursor.v !== 2 ||
    cursor.kind !== 'publicSearch' ||
    cursor.collection !== args.collection ||
    cursor.locale !== args.locale ||
    cursor.query !== args.query ||
    cursor.generation !== args.generation ||
    !Number.isSafeInteger(cursor.offset) ||
    cursor.offset! <= 0
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
    generation: args.generation,
  })
  if (cursor) {
    const cursorRow = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_stableId', (query) =>
        query
          .eq('collection', args.collection.slug)
          .eq('locale', args.locale)
          .eq('stableId', cursor.s),
      )
      .unique()
    if (!cursorRow || String(cursorRow._id) !== cursor.p) {
      throwCmsError('INVALID_CURSOR', 'Public route cursor no longer identifies its projection.')
    }
  }

  const candidates: Array<{ row: PublicEntryRow; path: string }> = []
  let afterStableId = cursor?.s ?? null
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
    const paths = await publicPathsForEntries(ctx, batch, {
      pathPrefix: pathPrefixForLocale(args.collection, args.locale),
      rootSlug: rootSlugForLocale(args.collection, args.locale),
    })
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
      const path = paths.get(String(row.entryId)) ?? null
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
            generation: args.generation,
          })
        : null,
  }
}

function encodePublicRoutesCursor(args: { row: PublicEntryRow; generation: string }) {
  const canonicalKey = args.row.stableId
  if (!canonicalKey) {
    throwCmsError('INVALID_QUERY', 'Published route is missing its stable content identity.')
  }
  return JSON.stringify({
    v: 2,
    g: args.generation,
    s: canonicalKey,
    p: String(args.row._id),
  } satisfies PublicRoutesCursor)
}

function parsePublicRoutesCursor(args: { cursor: string | null | undefined; generation: string }) {
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
    cursor.v !== 2 ||
    cursor.g !== args.generation ||
    typeof cursor.s !== 'string' ||
    !cursor.s ||
    typeof cursor.p !== 'string' ||
    !cursor.p
  ) {
    throwCmsError('INVALID_CURSOR', 'Public route cursor is invalid or expired.')
  }
  return cursor as PublicRoutesCursor
}
