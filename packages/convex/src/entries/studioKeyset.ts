import type { Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import type { HandlerQueryCtx } from '../lib/types.js'
import type { StudioEntryStatus } from './studioRows.js'
import {
  readStudioFacetRows,
  readStudioSearchRows,
  type IndexedStudioWorkState,
} from './studioSearchIndex.js'

type DraftSearchCursor = {
  v: 1
  kind: 'draftSearch'
  collection: string
  locale: string
  status: StudioEntryStatus | null
  workState: IndexedStudioWorkState
  query: string
  updatedAt: number
  entryId: string
}

type StudioTreeCursor = {
  v: 1
  kind: 'studioTree'
  collection: string
  locale: string
  parentEntryId: string | null
  orderRank: string
  creationTime: number
}

function parseJsonCursor(value: string | null | undefined, message: string): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    throwCmsError('INVALID_CURSOR', message, { cursor: value })
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeQuery(value?: string) {
  return value?.trim().toLocaleLowerCase() ?? ''
}

function parseDraftSearchCursor(
  ctx: HandlerQueryCtx,
  value: string | null | undefined,
  expected: Pick<DraftSearchCursor, 'collection' | 'locale' | 'status' | 'workState' | 'query'>,
) {
  const parsed = parseJsonCursor(value, 'Invalid filtered entry pagination cursor.')
  if (parsed === null) return null
  const cursor = parsed as Partial<DraftSearchCursor>
  if (
    cursor.v !== 1 ||
    cursor.kind !== 'draftSearch' ||
    cursor.collection !== expected.collection ||
    cursor.locale !== expected.locale ||
    cursor.status !== expected.status ||
    cursor.workState !== expected.workState ||
    cursor.query !== expected.query ||
    !isFiniteNumber(cursor.updatedAt) ||
    typeof cursor.entryId !== 'string' ||
    !ctx.db.normalizeId('entries', cursor.entryId)
  ) {
    throwCmsError('INVALID_CURSOR', 'Invalid filtered entry pagination cursor.', {
      cursor: value ?? null,
    })
  }
  return cursor as DraftSearchCursor
}

function parseStudioTreeCursor(
  value: string | null | undefined,
  expected: Pick<StudioTreeCursor, 'collection' | 'locale' | 'parentEntryId'>,
) {
  const parsed = parseJsonCursor(value, 'Invalid tree pagination cursor.')
  if (parsed === null) return null
  const cursor = parsed as Partial<StudioTreeCursor>
  if (
    cursor.v !== 1 ||
    cursor.kind !== 'studioTree' ||
    cursor.collection !== expected.collection ||
    cursor.locale !== expected.locale ||
    cursor.parentEntryId !== expected.parentEntryId ||
    typeof cursor.orderRank !== 'string' ||
    !isFiniteNumber(cursor.creationTime)
  ) {
    throwCmsError('INVALID_CURSOR', 'Invalid tree pagination cursor.', {
      cursor: value ?? null,
    })
  }
  return cursor as StudioTreeCursor
}

async function readDraftRows(
  ctx: HandlerQueryCtx,
  args: {
    collection: string
    locale: string
    status: StudioEntryStatus | null
    cursor: DraftSearchCursor | null
    take: number
  },
) {
  const cursorEntryId = args.cursor ? ctx.db.normalizeId('entries', args.cursor.entryId) : null
  if (args.cursor && !cursorEntryId) {
    throwCmsError('INVALID_CURSOR', 'Invalid filtered entry pagination cursor.')
  }
  const read = async (sameTimestamp: boolean, take: number) => {
    if (args.status) {
      return await ctx.db
        .query('draftSearchEntries')
        .withIndex('by_collection_locale_status_updatedAt', (query) => {
          const scope = query
            .eq('collection', args.collection)
            .eq('locale', args.locale)
            .eq('status', args.status!)
          if (!args.cursor) return scope
          return sameTimestamp
            ? scope.eq('updatedAt', args.cursor.updatedAt).lt('entryId', cursorEntryId!)
            : scope.lt('updatedAt', args.cursor.updatedAt)
        })
        .order('desc')
        .take(take)
    }
    return await ctx.db
      .query('draftSearchEntries')
      .withIndex('by_collection_locale_lifecycle_updatedAt', (query) => {
        const scope = query
          .eq('collection', args.collection)
          .eq('locale', args.locale)
          .eq('lifecycle', 'active')
        if (!args.cursor) return scope
        return sameTimestamp
          ? scope.eq('updatedAt', args.cursor.updatedAt).lt('entryId', cursorEntryId!)
          : scope.lt('updatedAt', args.cursor.updatedAt)
      })
      .order('desc')
      .take(take)
  }

  if (!args.cursor) return await read(false, args.take)
  const sameTimestamp = await read(true, args.take)
  if (sameTimestamp.length >= args.take) return sameTimestamp
  return [...sameTimestamp, ...(await read(false, args.take - sameTimestamp.length))]
}

export async function readDraftSearchCandidatePage(
  ctx: HandlerQueryCtx,
  args: {
    collection: string
    locale: string
    status?: StudioEntryStatus
    workState?: 'changed' | 'needs_attention' | 'missing_translation' | 'all'
    query?: string
    cursor?: string | null
    limit: number
  },
) {
  const expected = {
    collection: args.collection,
    locale: args.locale,
    status: args.status ?? null,
    workState:
      args.workState === 'changed' || args.workState === 'missing_translation'
        ? args.workState
        : null,
    query: normalizeQuery(args.query),
  }
  if (expected.query) {
    if (args.cursor) {
      throwCmsError(
        'INVALID_CURSOR',
        'Studio search results are a bounded relevance page and do not accept a cursor.',
      )
    }
    const rows = await readStudioSearchRows(ctx, {
      ...expected,
      take: args.limit,
    })
    return {
      page: rows,
      scannedCount: rows.length,
      isDone: true,
      continueCursor: null,
    }
  }

  const cursor = parseDraftSearchCursor(ctx, args.cursor, expected)
  const rows = expected.workState
    ? await readStudioFacetRows(ctx, {
        ...expected,
        workState: expected.workState,
        cursor,
        take: args.limit + 1,
      })
    : await readDraftRows(ctx, { ...expected, cursor, take: args.limit + 1 })
  const candidates = rows.slice(0, args.limit)
  const last = candidates.at(-1)
  const isDone = rows.length <= args.limit
  return {
    page: candidates,
    scannedCount: candidates.length,
    isDone,
    continueCursor:
      isDone || !last
        ? null
        : JSON.stringify({
            v: 1,
            kind: 'draftSearch',
            ...expected,
            updatedAt: last.updatedAt,
            entryId: String(last.entryId),
          } satisfies DraftSearchCursor),
  }
}

async function readTreeRows(
  ctx: HandlerQueryCtx,
  args: {
    collection: string
    parentEntryId: Id<'entries'> | null
    cursor: StudioTreeCursor | null
    take: number
  },
) {
  const read = async (sameRank: boolean, take: number) =>
    await ctx.db
      .query('entries')
      .withIndex('by_parent_lifecycle', (query) => {
        const scope = query
          .eq('collection', args.collection)
          .eq('parentEntryId', args.parentEntryId)
          .eq('lifecycle', 'active')
        if (!args.cursor) return scope
        return sameRank
          ? scope
              .eq('orderRank', args.cursor.orderRank)
              .gt('_creationTime', args.cursor.creationTime)
          : scope.gt('orderRank', args.cursor.orderRank)
      })
      .order('asc')
      .take(take)

  if (!args.cursor) return await read(false, args.take)
  const sameRank = await read(true, args.take)
  if (sameRank.length >= args.take) return sameRank
  return [...sameRank, ...(await read(false, args.take - sameRank.length))]
}

export async function readStudioTreeCandidatePage(
  ctx: HandlerQueryCtx,
  args: {
    collection: string
    locale: string
    parentEntryId: Id<'entries'> | null
    cursor?: string | null
    limit: number
  },
) {
  const expected = {
    collection: args.collection,
    locale: args.locale,
    parentEntryId: args.parentEntryId ? String(args.parentEntryId) : null,
  }
  const cursor = parseStudioTreeCursor(args.cursor, expected)
  const rows = await readTreeRows(ctx, { ...args, cursor, take: args.limit + 1 })
  const page = rows.slice(0, args.limit)
  const last = page.at(-1)
  const isDone = rows.length <= args.limit
  return {
    page,
    isDone,
    continueCursor:
      isDone || !last
        ? null
        : JSON.stringify({
            v: 1,
            kind: 'studioTree',
            ...expected,
            orderRank: last.orderRank,
            creationTime: last._creationTime,
          } satisfies StudioTreeCursor),
  }
}
