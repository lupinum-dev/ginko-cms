import { v } from 'convex/values'

import { internal } from './_generated/api.js'
import type { Id } from './_generated/dataModel.js'
import { internalMutation } from './_generated/server.js'
import type { QueryOrMutationCtx } from './lib/types.js'

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
const ASSISTED_AUTHORING_RETENTION_MS = 180 * DAY_MS

const cleanupResultValidator = v.object({
  outboxDelivered: v.number(),
  outboxFailed: v.number(),
  activity: v.number(),
  agentRuns: v.number(),
  reviewRequests: v.number(),
  remaining: v.boolean(),
})

function cleanupLimit(value: number | undefined) {
  return Math.min(
    Math.max(Math.floor(value ?? DEFAULT_CLEANUP_BATCH_SIZE), 1),
    DEFAULT_CLEANUP_BATCH_SIZE,
  )
}

type AgentRunCleanupCursor = {
  updatedAt: number
  creationTime: number
  id: string
}

function parseAgentRunCleanupCursor(
  value: string | null | undefined,
): AgentRunCleanupCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<AgentRunCleanupCursor>
    if (
      typeof parsed.updatedAt !== 'number' ||
      !Number.isFinite(parsed.updatedAt) ||
      typeof parsed.creationTime !== 'number' ||
      !Number.isFinite(parsed.creationTime) ||
      typeof parsed.id !== 'string' ||
      !parsed.id
    ) {
      throw new Error('invalid cursor payload')
    }
    return { updatedAt: parsed.updatedAt, creationTime: parsed.creationTime, id: parsed.id }
  } catch {
    throw new Error('STORAGE_MAINTENANCE_INVALID_CURSOR')
  }
}

function encodeAgentRunCleanupCursor(row: {
  updatedAt: number
  _creationTime: number
  _id: Id<'agentRuns'>
}): string {
  return JSON.stringify({
    updatedAt: row.updatedAt,
    creationTime: row._creationTime,
    id: String(row._id),
  })
}

export const cleanupStorageHygiene = internalMutation({
  args: {
    now: v.optional(v.number()),
    limit: v.optional(v.number()),
    agentRunStatus: v.optional(
      v.union(v.literal('completed'), v.literal('revoked'), v.literal('failed')),
    ),
    agentRunCursor: v.optional(v.union(v.string(), v.null())),
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
        q.eq('status', 'dead').lt('updatedAt', now - FAILED_OUTBOX_RETENTION_MS),
      )
      .take(limit)
    for (const row of failedOutbox) await ctx.db.delete(row._id)

    const activity = await ctx.db
      .query('activity')
      .withIndex('by_time', (q) => q.lt('createdAt', now - ACTIVITY_RETENTION_MS))
      .take(limit)
    for (const row of activity) await ctx.db.delete(row._id)

    const reviewCutoff = now - ASSISTED_AUTHORING_RETENTION_MS
    const approvedReviews = await ctx.db
      .query('reviewRequests')
      .withIndex('by_status_updated_at', (q) =>
        q.eq('status', 'approved').lt('updatedAt', reviewCutoff),
      )
      .take(limit)
    const rejectedReviews = await ctx.db
      .query('reviewRequests')
      .withIndex('by_status_updated_at', (q) =>
        q.eq('status', 'rejected').lt('updatedAt', reviewCutoff),
      )
      .take(limit)
    const reviews = [...approvedReviews, ...rejectedReviews]
    for (const row of reviews) await ctx.db.delete(row._id)

    const runCutoff = now - ASSISTED_AUTHORING_RETENTION_MS
    const expiredActiveRuns = await ctx.db
      .query('agentRuns')
      .withIndex('by_status_expires_at', (q) =>
        q.eq('status', 'active').gt('expiresAt', 0).lt('expiresAt', now),
      )
      .take(limit)
    const abandonedLegacyRuns = (
      await ctx.db
        .query('agentRuns')
        .withIndex('by_status_updated_at', (q) =>
          q.eq('status', 'active').lt('updatedAt', runCutoff),
        )
        .take(limit)
    ).filter((run) => run.expiresAt == null)
    const terminalStatuses = ['completed', 'revoked', 'failed'] as const
    const agentRunStatus = args.agentRunStatus ?? terminalStatuses[0]
    const terminalCursor = parseAgentRunCleanupCursor(args.agentRunCursor)
    const terminalRunRows = await ctx.db
      .query('agentRuns')
      .withIndex('by_status_updated_at', (q) => {
        const status = q.eq('status', agentRunStatus)
        return terminalCursor
          ? status.gte('updatedAt', terminalCursor.updatedAt).lt('updatedAt', runCutoff)
          : status.lt('updatedAt', runCutoff)
      })
      .filter((q) =>
        terminalCursor
          ? q.or(
              q.gt(q.field('updatedAt'), terminalCursor.updatedAt),
              q.and(
                q.eq(q.field('updatedAt'), terminalCursor.updatedAt),
                q.or(
                  q.gt(q.field('_creationTime'), terminalCursor.creationTime),
                  q.and(
                    q.eq(q.field('_creationTime'), terminalCursor.creationTime),
                    q.gt(q.field('_id'), terminalCursor.id),
                  ),
                ),
              ),
            )
          : true,
      )
      .take(limit + 1)
    const terminalRunPage = terminalRunRows.slice(0, limit)
    const terminalRunPageDone = terminalRunRows.length <= limit
    let deletedRuns = 0
    for (const row of [...expiredActiveRuns, ...abandonedLegacyRuns]) {
      const retainedReview = await ctx.db
        .query('reviewRequests')
        .withIndex('by_agent_run', (q) => q.eq('agentRunId', row._id))
        .first()
      if (retainedReview) {
        await ctx.db.patch(row._id, {
          status: 'failed',
          updatedAt: now,
          endedAt: now,
          lastError: 'Agent run expired before completion.',
        })
      } else {
        await ctx.db.delete(row._id)
        deletedRuns += 1
      }
    }
    for (const row of terminalRunPage) {
      const retainedReview = await ctx.db
        .query('reviewRequests')
        .withIndex('by_agent_run', (q) => q.eq('agentRunId', row._id))
        .first()
      if (retainedReview) continue
      await ctx.db.delete(row._id)
      deletedRuns += 1
    }
    const activeRunPageFull =
      expiredActiveRuns.length === limit || abandonedLegacyRuns.length === limit
    const nonTerminalRemaining =
      deliveredOutbox.length === limit ||
      failedOutbox.length === limit ||
      activity.length === limit ||
      approvedReviews.length === limit ||
      rejectedReviews.length === limit ||
      activeRunPageFull

    let nextAgentRunStatus: (typeof terminalStatuses)[number] | null = null
    let nextAgentRunCursor: string | null = null
    if (!terminalRunPageDone) {
      nextAgentRunStatus = agentRunStatus
      nextAgentRunCursor = encodeAgentRunCleanupCursor(terminalRunPage.at(-1)!)
    } else {
      const currentStatusIndex = terminalStatuses.indexOf(agentRunStatus)
      for (const status of terminalStatuses.slice(currentStatusIndex + 1)) {
        const nextRow = await ctx.db
          .query('agentRuns')
          .withIndex('by_status_updated_at', (q) =>
            q.eq('status', status).lt('updatedAt', runCutoff),
          )
          .first()
        if (nextRow) {
          nextAgentRunStatus = status
          break
        }
      }
    }

    const remaining = nextAgentRunStatus != null || nonTerminalRemaining
    if (remaining) {
      await ctx.scheduler.runAfter(
        0,
        internalApi.storageMaintenance.cleanupStorageHygiene as never,
        {
          now,
          limit,
          agentRunStatus: nextAgentRunStatus ?? terminalStatuses[0],
          agentRunCursor: nextAgentRunCursor,
        } as never,
      )
    }

    return {
      outboxDelivered: deliveredOutbox.length,
      outboxFailed: failedOutbox.length,
      activity: activity.length,
      agentRuns: deletedRuns,
      reviewRequests: reviews.length,
      remaining,
    }
  },
})

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
