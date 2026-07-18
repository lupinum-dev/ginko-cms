import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'

import { internal } from '../_generated/api.js'
import type { Doc, Id } from '../_generated/dataModel.js'
import type { ActionCtx } from '../_generated/server.js'
import { logActivity } from '../lib/activity.js'
import { toStringId } from '../lib/ids.js'
import type { MutationCtx } from '../lib/types.js'
import { assertValidTargetEndpoint, getEnabledTarget } from './targets.js'

declare const process: { env: Record<string, string | undefined> }

export const DEFAULT_BATCH_LIMIT = 10
const RECOVERY_BATCH_SIZE = 25
const LOCK_TTL_MS = 2 * 60 * 1000
const MAX_ATTEMPTS = 8
const ERROR_BODY_LIMIT = 500
const REVALIDATION_FETCH_TIMEOUT_MS = 10_000
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000]

type OutboxEventDoc = Doc<'outboxEvents'>
type RevalidationTargetDoc = Doc<'revalidationTargets'>

export type ClaimedEvent = {
  id: string
  idempotencyKey: string
  type: OutboxEventDoc['type']
  tags: string[]
  paths: string[]
  payload: JsonObject
  attempts: number
  deliveryGeneration: number
  leaseId: string
  target: {
    id: string
    name: string
    endpoint: string
    secretEnv: string
    environment: RevalidationTargetDoc['environment']
  }
}

function getReason(payload: Record<string, unknown>): string {
  return typeof payload.reason === 'string' ? payload.reason : 'publish'
}

function backoffMsForAttempt(attempt: number) {
  return BACKOFF_MS[Math.min(Math.max(attempt - 1, 0), BACKOFF_MS.length - 1)] ?? 7_200_000
}

function deliveryLeaseId(eventId: Id<'outboxEvents'>, generation: number, claimedAt: number) {
  return `${String(eventId)}:${generation}:${claimedAt}`
}

function truncateError(value: string) {
  return value.length > ERROR_BODY_LIMIT ? `${value.slice(0, ERROR_BODY_LIMIT)}...` : value
}

function permanentErrorStatus(status: number) {
  return status === 400 || status === 401 || status === 403 || status === 404
}

export async function claimDueRevalidationEventsHandler(
  ctx: MutationCtx,
  args: { now: number; limit?: number },
): Promise<ClaimedEvent[]> {
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_BATCH_LIMIT, 1), 50)
  const due = await ctx.db
    .query('outboxEvents')
    .withIndex('by_status_nextAttemptAt', (query) =>
      query.eq('status', 'pending').lte('nextAttemptAt', args.now),
    )
    .take(limit)
  const claimed: ClaimedEvent[] = []

  for (const event of due) {
    if (event.type !== 'content.revalidate') continue
    if (event.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(event._id, {
        status: 'dead',
        leaseId: null,
        lockedAt: null,
        lockExpiresAt: null,
        lastError: `Maximum delivery attempts reached (${MAX_ATTEMPTS}).`,
        updatedAt: args.now,
      })
      continue
    }

    const target = await getEnabledTarget(ctx)
    if (!target) continue

    const deliveryGeneration = event.deliveryGeneration + 1
    const leaseId = deliveryLeaseId(event._id, deliveryGeneration, args.now)
    await ctx.db.patch(event._id, {
      status: 'delivering',
      targetId: target._id,
      attempts: event.attempts + 1,
      deliveryGeneration,
      leaseId,
      lockedAt: args.now,
      lockExpiresAt: args.now + LOCK_TTL_MS,
      updatedAt: args.now,
    })

    claimed.push({
      id: toStringId(event._id),
      idempotencyKey: event.idempotencyKey,
      type: event.type,
      tags: event.tags,
      paths: event.paths,
      payload: event.payload as JsonObject,
      attempts: event.attempts + 1,
      deliveryGeneration,
      leaseId,
      target: {
        id: toStringId(target._id),
        name: target.name,
        endpoint: target.endpoint,
        secretEnv: target.secretEnv,
        environment: target.environment,
      },
    })
  }

  return claimed
}

export async function recordRevalidationDeliveryHandler(
  ctx: MutationCtx,
  args: {
    eventId: string
    deliveryGeneration: number
    leaseId: string
    ok: boolean
    statusCode?: number
    error?: string
    permanent?: boolean
    now: number
  },
) {
  const eventId = ctx.db.normalizeId('outboxEvents', args.eventId)
  const event = eventId ? await ctx.db.get(eventId) : null
  if (
    !event ||
    event.status !== 'delivering' ||
    event.deliveryGeneration !== args.deliveryGeneration ||
    event.leaseId !== args.leaseId
  ) {
    return false
  }

  if (args.ok) {
    await ctx.db.patch(event._id, {
      status: 'delivered',
      lastError: null,
      leaseId: null,
      lockedAt: null,
      lockExpiresAt: null,
      deliveredAt: args.now,
      updatedAt: args.now,
    })
    await logActivity(ctx, {
      kind: 'revalidation.delivered',
      summary: `Delivered revalidation for ${event.paths.length} path${event.paths.length === 1 ? '' : 's'}`,
      appIdentityId: String((event.payload as Record<string, unknown>).appIdentityId ?? 'system'),
      detail: {
        eventId: args.eventId,
        statusCode: args.statusCode ?? null,
        paths: event.paths,
        tags: event.tags,
      },
    })
    return true
  }

  const lastError = truncateError(args.error ?? 'Revalidation delivery failed.')
  if (args.permanent === true || event.attempts >= MAX_ATTEMPTS) {
    await ctx.db.patch(event._id, {
      status: 'dead',
      lastError,
      leaseId: null,
      lockedAt: null,
      lockExpiresAt: null,
      updatedAt: args.now,
    })
    return true
  }

  await ctx.db.patch(event._id, {
    status: 'pending',
    nextAttemptAt: args.now + backoffMsForAttempt(event.attempts),
    lastError,
    leaseId: null,
    lockedAt: null,
    lockExpiresAt: null,
    updatedAt: args.now,
  })
  return true
}

export async function recoverExpiredDeliveriesHandler(ctx: MutationCtx, args: { now: number }) {
  const rows = await ctx.db
    .query('outboxEvents')
    .withIndex('by_status_lock_expiry', (query) =>
      query.eq('status', 'delivering').lt('lockExpiresAt', args.now),
    )
    .take(RECOVERY_BATCH_SIZE + 1)
  for (const row of rows.slice(0, RECOVERY_BATCH_SIZE)) {
    await ctx.db.patch(row._id, {
      status: 'pending',
      nextAttemptAt: args.now,
      leaseId: null,
      lockedAt: null,
      lockExpiresAt: null,
      lastError: 'Delivery lock expired before completion.',
      updatedAt: args.now,
    })
  }
  if (rows.length > RECOVERY_BATCH_SIZE) {
    await ctx.scheduler.runAfter(1, internal.revalidation.deliverDue, {})
  }
  return null
}

async function recordDelivery(
  ctx: ActionCtx,
  job: ClaimedEvent,
  result: {
    ok: boolean
    statusCode?: number
    error?: string
    permanent?: boolean
  },
) {
  await ctx.runMutation(internal.revalidation.recordRevalidationDelivery, {
    eventId: job.id,
    deliveryGeneration: job.deliveryGeneration,
    leaseId: job.leaseId,
    now: Date.now(),
    ...result,
  })
}

async function deliverClaimedEvent(ctx: ActionCtx, job: ClaimedEvent) {
  const token = process.env[job.target.secretEnv]
  if (!token) {
    await recordDelivery(ctx, job, {
      ok: false,
      permanent: true,
      error: `Missing revalidation secret env "${job.target.secretEnv}".`,
    })
    return
  }

  try {
    const timestamp = String(Date.now())
    const body = JSON.stringify({
      eventId: job.id,
      idempotencyKey: job.idempotencyKey,
      reason: getReason(job.payload),
      tags: job.tags,
      paths: job.paths,
      createdAt: typeof job.payload.createdAt === 'number' ? job.payload.createdAt : undefined,
    })
    assertValidTargetEndpoint(job.target.endpoint)
    const signature = await hmacSha256Hex(token, `${timestamp}.${job.id}.${body}`)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REVALIDATION_FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(job.target.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'x-ginko-revalidation-event': job.id,
          'x-ginko-signature': `sha256=${signature}`,
          'x-ginko-signature-timestamp': timestamp,
        },
        body,
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Revalidation endpoint timed out.')
      throw error
    } finally {
      clearTimeout(timeout)
    }

    if (response.ok) {
      await recordDelivery(ctx, job, { ok: true, statusCode: response.status })
      return
    }
    await recordDelivery(ctx, job, {
      ok: false,
      statusCode: response.status,
      permanent: permanentErrorStatus(response.status),
      error: `Revalidation endpoint returned HTTP ${response.status}.`,
    })
  } catch (error) {
    await recordDelivery(ctx, job, {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error during revalidation.',
    })
  }
}

export async function hmacSha256Hex(secret: string, value: string) {
  const encoder = new TextEncoder()
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function deliverDueHandler(ctx: ActionCtx) {
  const now = Date.now()
  await ctx.runMutation(internal.revalidation.recoverExpiredDeliveries, { now })
  const jobs = (await ctx.runMutation(internal.revalidation.claimDueRevalidationEvents, {
    now,
    limit: DEFAULT_BATCH_LIMIT,
  })) as ClaimedEvent[]

  await Promise.all(jobs.map(async (job) => await deliverClaimedEvent(ctx, job)))
  await ctx.runMutation(internal.revalidation.scheduleNextRevalidationDelivery, {
    now: Date.now(),
  })
  return null
}
