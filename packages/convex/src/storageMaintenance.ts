import { v } from 'convex/values'

import { internal } from './_generated/api.js'
import { internalMutation } from './_generated/server.js'

const internalApi = internal as typeof internal & {
  storageMaintenance: {
    cleanupStorageHygiene: unknown
  }
}

const DEFAULT_CLEANUP_BATCH_SIZE = 100
const DAY_MS = 24 * 60 * 60 * 1000
const DELIVERED_OUTBOX_RETENTION_MS = 30 * DAY_MS
const FAILED_OUTBOX_RETENTION_MS = 90 * DAY_MS
const ACTIVITY_RETENTION_MS = 180 * DAY_MS

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
