import type { Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import type { ActivityDoc, HandlerQueryCtx } from '../lib/types.js'
import type { ActivityCursor, ActivityFilter, EntryActivityCursor } from './activityFilters.js'

type TimestampCursor = Pick<ActivityCursor, 'createdAt' | 'creationTime'>

async function readActivityKeysetRows<TCursor extends TimestampCursor>(
  cursor: TCursor | null,
  take: number,
  readSameTimestamp: (cursor: TCursor, take: number) => Promise<ActivityDoc[]>,
  readOlder: (cursor: TCursor | null, take: number) => Promise<ActivityDoc[]>,
): Promise<ActivityDoc[]> {
  const sameTimestampRows = cursor ? await readSameTimestamp(cursor, take) : []
  const remaining = take - sameTimestampRows.length
  const olderRows = remaining > 0 ? await readOlder(cursor, remaining) : []
  return [...sameTimestampRows, ...olderRows]
}

export async function readActivityRows(
  ctx: HandlerQueryCtx,
  filter: ActivityFilter | null,
  cursor: ActivityCursor | null,
  take: number,
): Promise<ActivityDoc[]> {
  if (!filter) {
    return await readActivityKeysetRows(
      cursor,
      take,
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_time', (query) =>
            query
              .eq('createdAt', pageCursor.createdAt)
              .lt('_creationTime', pageCursor.creationTime),
          )
          .order('desc')
          .take(pageSize),
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_time', (query) =>
            pageCursor ? query.lt('createdAt', pageCursor.createdAt) : query,
          )
          .order('desc')
          .take(pageSize),
    )
  }

  if (filter.kind === 'content') {
    const entryId = ctx.db.normalizeId('entries', filter.entryId)
    if (!entryId) throwCmsError('INVALID_ACTIVITY_FILTER', 'Content ID is invalid.')
    return await readActivityKeysetRows(
      cursor,
      take,
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_entry', (query) =>
            query
              .eq('entryId', entryId)
              .eq('createdAt', pageCursor.createdAt)
              .lt('_creationTime', pageCursor.creationTime),
          )
          .order('desc')
          .take(pageSize),
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_entry', (query) => {
            const scope = query.eq('entryId', entryId)
            return pageCursor ? scope.lt('createdAt', pageCursor.createdAt) : scope
          })
          .order('desc')
          .take(pageSize),
    )
  }

  if (filter.kind === 'collection') {
    return await readActivityKeysetRows(
      cursor,
      take,
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_collection', (query) =>
            query
              .eq('collection', filter.collection)
              .eq('createdAt', pageCursor.createdAt)
              .lt('_creationTime', pageCursor.creationTime),
          )
          .order('desc')
          .take(pageSize),
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_collection', (query) => {
            const scope = query.eq('collection', filter.collection)
            return pageCursor ? scope.lt('createdAt', pageCursor.createdAt) : scope
          })
          .order('desc')
          .take(pageSize),
    )
  }

  if (filter.kind === 'actor') {
    return await readActivityKeysetRows(
      cursor,
      take,
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_appIdentity', (query) =>
            query
              .eq('appIdentityId', filter.appIdentityId)
              .eq('createdAt', pageCursor.createdAt)
              .lt('_creationTime', pageCursor.creationTime),
          )
          .order('desc')
          .take(pageSize),
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_appIdentity', (query) => {
            const scope = query.eq('appIdentityId', filter.appIdentityId)
            return pageCursor ? scope.lt('createdAt', pageCursor.createdAt) : scope
          })
          .order('desc')
          .take(pageSize),
    )
  }

  if (filter.kind === 'operation') {
    return await readActivityKeysetRows(
      cursor,
      take,
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_kind_time', (query) =>
            query
              .eq('kind', filter.operationKind)
              .eq('createdAt', pageCursor.createdAt)
              .lt('_creationTime', pageCursor.creationTime),
          )
          .order('desc')
          .take(pageSize),
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_kind_time', (query) => {
            const scope = query.eq('kind', filter.operationKind)
            return pageCursor ? scope.lt('createdAt', pageCursor.createdAt) : scope
          })
          .order('desc')
          .take(pageSize),
    )
  }

  if (filter.kind === 'result') {
    return await readActivityKeysetRows(
      cursor,
      take,
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_outcome_time', (query) =>
            query
              .eq('outcome', filter.outcome)
              .eq('createdAt', pageCursor.createdAt)
              .lt('_creationTime', pageCursor.creationTime),
          )
          .order('desc')
          .take(pageSize),
      async (pageCursor, pageSize) =>
        await ctx.db
          .query('activity')
          .withIndex('by_outcome_time', (query) => {
            const scope = query.eq('outcome', filter.outcome)
            return pageCursor ? scope.lt('createdAt', pageCursor.createdAt) : scope
          })
          .order('desc')
          .take(pageSize),
    )
  }

  return await readActivityKeysetRows(
    cursor,
    take,
    async (pageCursor, pageSize) =>
      await ctx.db
        .query('activity')
        .withIndex('by_time', (query) =>
          query.eq('createdAt', pageCursor.createdAt).lt('_creationTime', pageCursor.creationTime),
        )
        .order('desc')
        .take(pageSize),
    async (pageCursor, pageSize) =>
      await ctx.db
        .query('activity')
        .withIndex('by_time', (query) =>
          pageCursor
            ? query.gte('createdAt', filter.from).lt('createdAt', pageCursor.createdAt)
            : query.gte('createdAt', filter.from).lte('createdAt', filter.to),
        )
        .order('desc')
        .take(pageSize),
  )
}

export async function readEntryActivityRows(
  ctx: HandlerQueryCtx,
  entryId: Id<'entries'>,
  cursor: EntryActivityCursor | null,
  take: number,
): Promise<ActivityDoc[]> {
  return await readActivityKeysetRows(
    cursor,
    take,
    async (pageCursor, pageSize) =>
      await ctx.db
        .query('activity')
        .withIndex('by_entry', (query) =>
          query
            .eq('entryId', entryId)
            .eq('createdAt', pageCursor.createdAt)
            .lt('_creationTime', pageCursor.creationTime),
        )
        .order('desc')
        .take(pageSize),
    async (pageCursor, pageSize) =>
      await ctx.db
        .query('activity')
        .withIndex('by_entry', (query) => {
          const scope = query.eq('entryId', entryId)
          return pageCursor ? scope.lt('createdAt', pageCursor.createdAt) : scope
        })
        .order('desc')
        .take(pageSize),
  )
}
