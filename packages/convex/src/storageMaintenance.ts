import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import { internal } from './_generated/api.js'
import type { Id } from './_generated/dataModel.js'
import { internalAction, internalMutation, internalQuery } from './_generated/server.js'
import type { QueryOrMutationCtx } from './lib/types.js'

const internalApi = internal as typeof internal & {
  storageMaintenance: {
    cleanupStorageHygiene: unknown
    readStorageOrphanPage: unknown
    reconcileStorageOrphans: unknown
  }
}

const DEFAULT_CLEANUP_BATCH_SIZE = 100
const DAY_MS = 24 * 60 * 60 * 1000
const DELIVERED_OUTBOX_RETENTION_MS = 30 * DAY_MS
const FAILED_OUTBOX_RETENTION_MS = 90 * DAY_MS
const ACTIVITY_RETENTION_MS = 180 * DAY_MS
const STORAGE_ORPHAN_GRACE_MS = 10 * 60 * 1_000
const DEFAULT_STORAGE_SCAN_BATCH_SIZE = 100
const readStorageOrphanPageRef = makeFunctionReference<
  'query',
  { now: number; cursor: string | null; limit: number },
  { candidates: string[]; scanned: number; cursor: string | null; complete: boolean }
>('storageMaintenance:readStorageOrphanPage')
const reconcileStorageOrphansRef = makeFunctionReference<
  'action',
  { now: number; cursor: string | null; limit: number },
  { scanned: number; deleted: number; complete: boolean }
>('storageMaintenance:reconcileStorageOrphans')

const cleanupResultValidator = v.object({
  outboxDelivered: v.number(),
  outboxFailed: v.number(),
  activity: v.number(),
  remaining: v.boolean(),
})

function cleanupLimit(value: number | undefined) {
  return Math.min(
    Math.max(Math.floor(value ?? DEFAULT_CLEANUP_BATCH_SIZE), 1),
    DEFAULT_CLEANUP_BATCH_SIZE,
  )
}

export const cleanupStorageHygiene = internalMutation({
  args: {
    now: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: cleanupResultValidator,
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const limit = cleanupLimit(args.limit)

    const deliveredOutbox = await ctx.db
      .query('outboxEvents')
      .withIndex('by_status_updatedAt', (q) =>
        q.eq('status', 'delivered').lt('updatedAt', now - DELIVERED_OUTBOX_RETENTION_MS),
      )
      .take(limit)
    for (const row of deliveredOutbox) await ctx.db.delete(row._id)

    const failedOutbox = await ctx.db
      .query('outboxEvents')
      .withIndex('by_status_updatedAt', (q) =>
        q.eq('status', 'failed').lt('updatedAt', now - FAILED_OUTBOX_RETENTION_MS),
      )
      .take(limit)
    for (const row of failedOutbox) await ctx.db.delete(row._id)

    const activity = await ctx.db
      .query('activity')
      .withIndex('by_time', (q) => q.lt('createdAt', now - ACTIVITY_RETENTION_MS))
      .take(limit)
    for (const row of activity) await ctx.db.delete(row._id)

    const remaining =
      deliveredOutbox.length === limit || failedOutbox.length === limit || activity.length === limit
    if (remaining) {
      await ctx.scheduler.runAfter(
        0,
        internalApi.storageMaintenance.cleanupStorageHygiene as never,
        { now, limit } as never,
      )
    }

    return {
      outboxDelivered: deliveredOutbox.length,
      outboxFailed: failedOutbox.length,
      activity: activity.length,
      remaining,
    }
  },
})

export const readStorageOrphanPage = internalQuery({
  args: {
    now: v.number(),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), DEFAULT_STORAGE_SCAN_BATCH_SIZE)
    const cursor = parseStorageCursor(args.cursor)
    const ordered = ctx.db.system.query('_storage').order('asc')
    const fetched = await (cursor
      ? ordered
          .filter((query) =>
            query.or(
              query.gt(query.field('_creationTime'), cursor.creationTime),
              query.and(
                query.eq(query.field('_creationTime'), cursor.creationTime),
                query.gt(query.field('_id'), cursor.id as Id<'_storage'>),
              ),
            ),
          )
          .take(limit + 1)
      : ordered.take(limit + 1))
    const page = fetched.slice(0, limit)
    const candidates: string[] = []
    for (const storage of page) {
      if (storage._creationTime >= args.now - STORAGE_ORPHAN_GRACE_MS) continue
      if (!(await isCmsStorageReferenced(ctx, storage._id))) candidates.push(String(storage._id))
    }
    const complete = fetched.length <= limit
    const last = page.at(-1)
    return {
      candidates,
      scanned: page.length,
      cursor:
        !complete && last
          ? JSON.stringify({ creationTime: last._creationTime, id: String(last._id) })
          : null,
      complete,
    }
  },
})

function parseStorageCursor(value: string | null) {
  if (value === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Storage reconciliation cursor is invalid.')
  }
  const cursor = parsed as { creationTime?: unknown; id?: unknown }
  if (
    !Number.isFinite(cursor.creationTime) ||
    Number(cursor.creationTime) < 0 ||
    typeof cursor.id !== 'string' ||
    !cursor.id
  ) {
    throw new Error('Storage reconciliation cursor is invalid.')
  }
  return { creationTime: Number(cursor.creationTime), id: cursor.id }
}

export async function isCmsStorageReferenced(
  ctx: QueryOrMutationCtx,
  storageId: Id<'_storage'>,
  ignore: { assetId?: Id<'assets'>; portableStageId?: Id<'portableAssetStages'> } = {},
) {
  const assets = await ctx.db
    .query('assets')
    .withIndex('by_storage', (query) => query.eq('storageId', storageId))
    .take(ignore.assetId ? 2 : 1)
  if (assets.some((asset) => asset._id !== ignore.assetId)) {
    return true
  }
  if (
    await ctx.db
      .query('assetCleanupTasks')
      .withIndex('by_storage', (query) => query.eq('storageId', storageId))
      .first()
  ) {
    return true
  }
  const stages = await ctx.db
    .query('portableAssetStages')
    .withIndex('by_storage', (query) => query.eq('storageId', storageId))
    .take(ignore.portableStageId ? 2 : 1)
  if (stages.some((stage) => stage._id !== ignore.portableStageId)) {
    return true
  }
  if (
    await ctx.db
      .query('portableExportAssets')
      .withIndex('by_storage', (query) => query.eq('storageId', storageId))
      .first()
  ) {
    return true
  }
  return Boolean(
    await ctx.db
      .query('backupArtifacts')
      .withIndex('by_driver_storage', (query) =>
        query.eq('driver', 'convex-storage-json').eq('storageRef', String(storageId)),
      )
      .first(),
  )
}

export const reconcileStorageOrphans = internalAction({
  args: {
    now: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: v.object({ scanned: v.number(), deleted: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? DEFAULT_STORAGE_SCAN_BATCH_SIZE), 1),
      DEFAULT_STORAGE_SCAN_BATCH_SIZE,
    )
    const page = await ctx.runQuery(readStorageOrphanPageRef, {
      now,
      cursor: args.cursor ?? null,
      limit,
    })
    let deleted = 0
    for (const candidate of page.candidates) {
      await ctx.storage.delete(candidate as Id<'_storage'>)
      deleted += 1
    }
    if (!page.complete) {
      await ctx.scheduler.runAfter(0, reconcileStorageOrphansRef, {
        now,
        cursor: page.cursor,
        limit,
      })
    }
    return { scanned: page.scanned, deleted, complete: page.complete }
  },
})
