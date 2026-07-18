import { v } from 'convex/values'

import { internal } from './_generated/api.js'
import type { Id } from './_generated/dataModel.js'
import { internalMutation } from './_generated/server.js'
import { canManageSettings } from './auth/checks.js'
import { callerMutation, callerQuery } from './functions.js'

const DEFAULT_CLEANUP_BATCH_SIZE = 100
const DAY_MS = 24 * 60 * 60 * 1000
const DELIVERED_OUTBOX_RETENTION_MS = 30 * DAY_MS
const FAILED_OUTBOX_RETENTION_MS = 90 * DAY_MS
const ACTIVITY_RETENTION_MS = 180 * DAY_MS
const ASSISTED_AUTHORING_RETENTION_MS = 180 * DAY_MS
const SUPPORTED_ASSET_COUNT = 500

const cleanupResultValidator = v.object({
  outboxDelivered: v.number(),
  outboxFailed: v.number(),
  activity: v.number(),
  agentRuns: v.number(),
  reviewRequests: v.number(),
  remaining: v.boolean(),
})

const storageIssueValidator = v.object({
  code: v.union(
    v.literal('asset-limit-exceeded'),
    v.literal('missing-bytes'),
    v.literal('pending-uploads'),
    v.literal('cleanup-failures'),
  ),
  count: v.number(),
  message: v.string(),
})

const storageHealthValidator = v.object({
  status: v.union(v.literal('healthy'), v.literal('attention')),
  checkedAt: v.number(),
  usage: v.object({
    trackedAssets: v.number(),
    trackedBytes: v.number(),
    quotaBytes: v.null(),
    quotaSource: v.literal('provider-managed'),
  }),
  constraints: v.object({
    supportedAssets: v.number(),
    countComplete: v.boolean(),
  }),
  bytes: v.object({ checked: v.number(), missing: v.number() }),
  operations: v.object({ pendingUploads: v.number(), terminalCleanupFailures: v.number() }),
  issues: v.array(storageIssueValidator),
})

const storageDiagnosticValidator = v.object({
  status: v.union(
    v.literal('healthy'),
    v.literal('missing-setup'),
    v.literal('quota-or-limit'),
    v.literal('temporary-failure'),
  ),
  checkedAt: v.number(),
  code: v.union(
    v.literal('STORAGE_UPLOAD_READY'),
    v.literal('STORAGE_SETUP_MISSING'),
    v.literal('STORAGE_LIMIT_REACHED'),
    v.literal('STORAGE_TEMPORARILY_UNAVAILABLE'),
  ),
  message: v.string(),
  createdStorageObject: v.literal(false),
})

/** Classify provider failures without returning their potentially sensitive text. */
export function classifyStorageDiagnosticFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (/not configured|configuration|missing|environment/.test(message)) {
    return {
      status: 'missing-setup' as const,
      code: 'STORAGE_SETUP_MISSING' as const,
      message: 'Convex storage upload capability is not configured for this deployment.',
    }
  }
  if (/quota|limit|too many|capacity/.test(message)) {
    return {
      status: 'quota-or-limit' as const,
      code: 'STORAGE_LIMIT_REACHED' as const,
      message: 'Convex storage rejected the diagnostic because a provider limit was reached.',
    }
  }
  return {
    status: 'temporary-failure' as const,
    code: 'STORAGE_TEMPORARILY_UNAVAILABLE' as const,
    message: 'Convex storage did not accept the diagnostic. Retry or inspect deployment health.',
  }
}

export const getStorageHealth = callerQuery.protected({
  id: 'storageMaintenance:getStorageHealth',
  args: {},
  guard: canManageSettings,
  returns: storageHealthValidator,
  handler: async (ctx) => {
    const checkedAt = Date.now()
    const assets = await ctx.db
      .query('assets')
      .withIndex('by_created')
      .take(SUPPORTED_ASSET_COUNT + 1)
    const countComplete = assets.length <= SUPPORTED_ASSET_COUNT
    const checkedAssets = assets.slice(0, SUPPORTED_ASSET_COUNT)
    const urls = await Promise.all(
      checkedAssets.map(async (asset) => await ctx.storage.getUrl(asset.storageId)),
    )
    const missingBytes = urls.filter((url) => url === null).length
    const pendingUploads = (
      await Promise.all(
        (['awaiting-upload', 'uploaded', 'cleanup-queued'] as const).map(
          async (state) =>
            await ctx.db
              .query('assetUploadSessions')
              .withIndex('by_state_expires_at', (q) => q.eq('state', state))
              .take(SUPPORTED_ASSET_COUNT + 1),
        ),
      )
    ).reduce((total, rows) => total + rows.length, 0)
    const terminalCleanupFailures = (
      await ctx.db
        .query('assetCleanupTasks')
        .withIndex('by_status', (q) => q.eq('status', 'terminal-failure'))
        .take(SUPPORTED_ASSET_COUNT + 1)
    ).length
    const issues: Array<{
      code: 'asset-limit-exceeded' | 'missing-bytes' | 'pending-uploads' | 'cleanup-failures'
      count: number
      message: string
    }> = []
    if (!countComplete) {
      issues.push({
        code: 'asset-limit-exceeded',
        count: assets.length,
        message: `Tracked assets exceed the supported ${SUPPORTED_ASSET_COUNT}-asset target; counts are bounded.`,
      })
    }
    if (missingBytes > 0) {
      issues.push({
        code: 'missing-bytes',
        count: missingBytes,
        message: 'Tracked asset records are missing their Convex storage bytes.',
      })
    }
    if (pendingUploads > 0) {
      issues.push({
        code: 'pending-uploads',
        count: pendingUploads,
        message: 'Upload sessions are still awaiting finalization or cleanup.',
      })
    }
    if (terminalCleanupFailures > 0) {
      issues.push({
        code: 'cleanup-failures',
        count: terminalCleanupFailures,
        message: 'Abandoned-upload cleanup requires owner attention.',
      })
    }
    return {
      status: issues.length === 0 ? ('healthy' as const) : ('attention' as const),
      checkedAt,
      usage: {
        trackedAssets: checkedAssets.length,
        trackedBytes: checkedAssets.reduce((total, asset) => total + asset.size, 0),
        quotaBytes: null,
        quotaSource: 'provider-managed' as const,
      },
      constraints: { supportedAssets: SUPPORTED_ASSET_COUNT, countComplete },
      bytes: { checked: checkedAssets.length, missing: missingBytes },
      operations: { pendingUploads, terminalCleanupFailures },
      issues,
    }
  },
})

export const runStorageDiagnostic = callerMutation.protected({
  id: 'storageMaintenance:runStorageDiagnostic',
  args: {},
  guard: canManageSettings,
  contractWrite: 'bypass',
  returns: storageDiagnosticValidator,
  handler: async (ctx) => {
    const checkedAt = Date.now()
    try {
      // Generating an expiring upload URL verifies write capability but does not
      // upload bytes, create an asset row, or leave a storage object behind.
      await ctx.storage.generateUploadUrl()
      return {
        status: 'healthy' as const,
        checkedAt,
        code: 'STORAGE_UPLOAD_READY' as const,
        message: 'Convex storage accepted an expiring upload session.',
        createdStorageObject: false as const,
      }
    } catch (error) {
      return {
        ...classifyStorageDiagnosticFailure(error),
        checkedAt,
        createdStorageObject: false as const,
      }
    }
  },
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
      .withIndex('by_retention_time', (q) =>
        q.eq('retention', 'standard').lt('createdAt', now - ACTIVITY_RETENTION_MS),
      )
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
      await ctx.scheduler.runAfter(0, internal.storageMaintenance.cleanupStorageHygiene, {
        now,
        limit,
        agentRunStatus: nextAgentRunStatus ?? terminalStatuses[0],
        agentRunCursor: nextAgentRunCursor,
      })
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
