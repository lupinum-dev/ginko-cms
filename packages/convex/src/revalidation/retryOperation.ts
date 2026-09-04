import { retryRevalidationJob as retryRevalidationJobArgs } from '@lupinum/ginko-cms-contract/convex/schemas/revalidation.js'
import { v } from 'convex/values'

import { canManageSettings } from '../auth/checks.js'
import {
  blockedPreview,
  buildPreview,
  defineCmsOperation,
  operationEffect,
  operationIssue,
  previewResultValidator,
} from '../operationHelpers.js'
import { scheduleRevalidationDelivery } from './targets.js'

export const retryRevalidationJobOperation = defineCmsOperation({
  id: 'ginko-cms.retry-revalidation-job',
  kind: 'destructive',
  executeFunctionRef: 'revalidation:retryRevalidationJobOperationExecute',
  args: retryRevalidationJobArgs.args,
  guard: canManageSettings,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const eventId = ctx.db.normalizeId('outboxEvents', args.eventId)
    const event = eventId ? await ctx.db.get(eventId) : null
    return { event }
  },
  preview: async (_ctx, args, { event }) => {
    if (!event) {
      return blockedPreview({
        summary: `Revalidation job "${args.eventId}" was not found.`,
        blockers: [
          operationIssue({
            code: 'revalidation-job-not-found',
            message: `Revalidation job "${args.eventId}" was not found.`,
          }),
        ],
        confirm: { operationId: 'ginko-cms.retry-revalidation-job', args },
      })
    }
    return buildPreview({
      summary: `Will retry revalidation job "${args.eventId}" with status "${event.status}".`,
      warnings: [
        operationIssue({
          code: 'cache-purge-repeat',
          message: 'Retrying can purge public host caches again for the recorded paths and tags.',
        }),
      ],
      effects: [
        operationEffect({ kind: 'paths', summary: 'Paths revalidated', count: event.paths.length }),
        operationEffect({
          kind: 'tags',
          summary: 'Cache tags revalidated',
          count: event.tags.length,
        }),
      ],
      details: {
        status: event.status,
        paths: event.paths,
        tags: event.tags,
        attempts: event.attempts,
      },
      confirm: {
        operationId: 'ginko-cms.retry-revalidation-job',
        args,
        effect: {
          status: event.status,
          paths: event.paths,
          tags: event.tags,
          attempts: event.attempts,
        },
      },
      version: { updatedAt: event.updatedAt, attempts: event.attempts },
    })
  },
  handler: async (ctx, _args, { event }) => {
    if (!event) throw new Error('REVALIDATION_EVENT_NOT_FOUND')

    const now = Date.now()
    await ctx.db.patch(event._id, {
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      lastError: null,
      leaseId: null,
      lockedAt: null,
      lockExpiresAt: null,
      updatedAt: now,
    })
    await scheduleRevalidationDelivery(ctx)
    return null
  },
})
