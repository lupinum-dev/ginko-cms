import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { internalAction, internalMutation } from './_generated/server.js'
import { canManageSettings } from './auth/checks.js'
import { callerMutation, callerQuery } from './functions.js'
import type { MutationCtx } from './lib/types.js'
import { definePreview } from './operationHelpers.js'
import { retryRevalidationJobOperation } from './revalidation/retryOperation.js'
import {
  listRevalidationJobsHandler,
  listRevalidationTargetsHandler,
  scheduleNextRevalidationDeliveryHandler,
  scheduleRevalidationDelivery,
  upsertRevalidationTargetHandler,
} from './revalidation/targets.js'
import {
  claimDueRevalidationEventsHandler,
  deliverDueHandler,
  recordRevalidationDeliveryHandler,
  recoverExpiredDeliveriesHandler,
} from './revalidation/worker.js'

export { retryRevalidationJobOperation }
export * from './revalidation/diagnostics.js'

export const scheduleNextRevalidationDelivery = internalMutation({
  args: { now: v.number() },
  returns: v.null(),
  handler: scheduleNextRevalidationDeliveryHandler,
})

export async function scheduleRevalidationOutboxDelivery(ctx: MutationCtx) {
  await scheduleRevalidationDelivery(ctx)
}

export const upsertRevalidationTarget = callerMutation.protected({
  id: 'revalidation:upsertRevalidationTarget',
  args: {
    targetId: v.optional(v.string()),
    name: v.string(),
    environment: v.union(v.literal('production'), v.literal('preview'), v.literal('development')),
    endpoint: v.string(),
    secretEnv: v.string(),
    enabled: v.boolean(),
  },
  guard: canManageSettings,
  returns: v.string(),
  handler: upsertRevalidationTargetHandler,
})

export const listRevalidationTargets = callerQuery.protected({
  id: 'revalidation:listRevalidationTargets',
  args: {},
  guard: canManageSettings,
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      environment: v.union(v.literal('production'), v.literal('preview'), v.literal('development')),
      endpoint: v.string(),
      secretEnv: v.string(),
      enabled: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: listRevalidationTargetsHandler,
})

export const listRevalidationJobs = callerQuery.protected({
  id: 'revalidation:listRevalidationJobs',
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('delivering'),
        v.literal('delivered'),
        v.literal('failed'),
      ),
    ),
    limit: v.optional(v.number()),
  },
  guard: canManageSettings,
  returns: v.array(
    v.object({
      id: v.string(),
      status: v.union(
        v.literal('pending'),
        v.literal('delivering'),
        v.literal('delivered'),
        v.literal('failed'),
      ),
      tags: v.array(v.string()),
      paths: v.array(v.string()),
      attempts: v.number(),
      nextAttemptAt: v.number(),
      lastError: v.union(v.string(), v.null()),
      deliveredAt: v.union(v.number(), v.null()),
      payload: jsonObjectValidator,
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: listRevalidationJobsHandler,
})

export const retryRevalidationJobOperationExecute = callerMutation.protected(
  retryRevalidationJobOperation,
)
export const previewRetryRevalidationJobOperation = callerMutation.protected(
  Object.assign(definePreview(retryRevalidationJobOperation), {
    id: 'revalidation:previewRetryRevalidationJobOperation',
  }),
)

export const claimDueRevalidationEvents = internalMutation({
  args: { now: v.number(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      id: v.string(),
      idempotencyKey: v.string(),
      type: v.literal('content.revalidate'),
      tags: v.array(v.string()),
      paths: v.array(v.string()),
      payload: jsonObjectValidator,
      attempts: v.number(),
      deliveryGeneration: v.number(),
      leaseId: v.string(),
      target: v.object({
        id: v.string(),
        name: v.string(),
        endpoint: v.string(),
        secretEnv: v.string(),
        environment: v.union(
          v.literal('production'),
          v.literal('preview'),
          v.literal('development'),
        ),
      }),
    }),
  ),
  handler: claimDueRevalidationEventsHandler,
})

export const recordRevalidationDelivery = internalMutation({
  args: {
    eventId: v.string(),
    deliveryGeneration: v.number(),
    leaseId: v.string(),
    ok: v.boolean(),
    statusCode: v.optional(v.number()),
    error: v.optional(v.string()),
    permanent: v.optional(v.boolean()),
    now: v.number(),
  },
  returns: v.boolean(),
  handler: recordRevalidationDeliveryHandler,
})

export const recoverExpiredDeliveries = internalMutation({
  args: { now: v.number() },
  returns: v.null(),
  handler: recoverExpiredDeliveriesHandler,
})

export const deliverDue = internalAction({
  args: {},
  returns: v.null(),
  handler: deliverDueHandler,
})
