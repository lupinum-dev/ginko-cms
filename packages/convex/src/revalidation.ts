import { retryRevalidationJob as retryRevalidationJobArgs } from '@lupinum/ginko-cms-contract/convex/schemas/revalidation.js'
import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import { internal } from './_generated/api.js'
import type { Doc, Id } from './_generated/dataModel.js'
import { internalAction, internalMutation } from './_generated/server.js'
import { canManageSettings } from './auth/checks.js'
import { callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import { toStringId } from './lib/ids.js'
import type { MutationCtx, QueryOrMutationCtx } from './lib/types.js'
import {
  blockedPreview,
  defineCmsOperation,
  operationEffect,
  operationIssue,
  buildPreview,
  previewResultValidator,
  definePreview,
} from './operationHelpers.js'

declare const process: { env: Record<string, string | undefined> }

const internalRevalidationApi = internal as typeof internal & {
  revalidation: {
    claimDueRevalidationEvents: unknown
    recordRevalidationDelivery: unknown
    recoverExpiredDeliveries: unknown
    deliverDue: unknown
  }
}

const DEFAULT_BATCH_LIMIT = 10
const LOCK_TTL_MS = 2 * 60 * 1000
const MAX_ATTEMPTS = 8
const ERROR_BODY_LIMIT = 500
const REVALIDATION_FETCH_TIMEOUT_MS = 10_000
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000]
const LOCAL_REVALIDATION_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
])
const REVALIDATION_ALLOWED_HOSTS_ENV = 'GINKO_CMS_REVALIDATION_ALLOWED_HOSTS'

type OutboxEventDoc = Doc<'outboxEvents'>
type RevalidationTargetDoc = Doc<'revalidationTargets'>

type ClaimedEvent = {
  id: string
  idempotencyKey: string
  type: OutboxEventDoc['type']
  tags: string[]
  paths: string[]
  payload: JsonObject
  attempts: number
  target: {
    id: string
    name: string
    endpoint: string
    secretEnv: string
    environment: RevalidationTargetDoc['environment']
  }
}

function asOutboxEventId(id: string) {
  return id as Id<'outboxEvents'>
}

function asRevalidationTargetId(id: string) {
  return id as Id<'revalidationTargets'>
}

function getReason(payload: Record<string, unknown>): string {
  return typeof payload.reason === 'string' ? payload.reason : 'publish'
}

function backoffMsForAttempt(attempt: number) {
  return BACKOFF_MS[Math.min(Math.max(attempt - 1, 0), BACKOFF_MS.length - 1)] ?? 7_200_000
}

function truncateError(value: string) {
  return value.length > ERROR_BODY_LIMIT ? `${value.slice(0, ERROR_BODY_LIMIT)}...` : value
}

function permanentErrorStatus(status: number) {
  return status === 400 || status === 401 || status === 403 || status === 404
}

function ipv4Octets(address: string): number[] | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN))
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null
}

function isPrivateOrReservedIpv4(address: string) {
  const octets = ipv4Octets(address)
  if (!octets) return false
  const [a, b, c] = octets as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && (b === 0 || b === 168)) return true
  if (a === 192 && b === 0 && c === 2) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  return a >= 224
}

function isPrivateOrReservedHost(hostname: string) {
  const hostnameLower = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  if (
    LOCAL_REVALIDATION_HOSTS.has(hostnameLower) ||
    hostnameLower === '0' ||
    hostnameLower.endsWith('.localhost') ||
    hostnameLower.endsWith('.local')
  ) {
    return true
  }
  if (isPrivateOrReservedIpv4(hostnameLower)) return true
  if (
    hostnameLower === '::' ||
    hostnameLower === '::1' ||
    hostnameLower.startsWith('fc') ||
    hostnameLower.startsWith('fd') ||
    hostnameLower.startsWith('fe80:') ||
    hostnameLower.startsWith('ff') ||
    hostnameLower.startsWith('100:') ||
    hostnameLower.startsWith('2001:db8:')
  ) {
    return true
  }
  return false
}

async function hmacSha256Hex(secret: string, value: string) {
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

function localRevalidationAllowed() {
  return process.env.GINKO_CMS_ALLOW_LOCAL_REVALIDATION === '1'
}

function allowedRevalidationHosts(): Set<string> {
  return new Set(
    (process.env[REVALIDATION_ALLOWED_HOSTS_ENV] ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

function assertValidTargetEndpoint(endpoint: string) {
  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new Error('REVALIDATION_ENDPOINT_INVALID')
  }

  const privateOrReserved = isPrivateOrReservedHost(parsed.hostname)
  if (privateOrReserved && !localRevalidationAllowed()) {
    throw new Error('REVALIDATION_ENDPOINT_PUBLIC_HTTPS_REQUIRED')
  }
  if (parsed.protocol !== 'https:' && !(privateOrReserved && localRevalidationAllowed())) {
    throw new Error('REVALIDATION_ENDPOINT_HTTPS_REQUIRED')
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  if (!privateOrReserved && !allowedRevalidationHosts().has(hostname)) {
    throw new Error('REVALIDATION_ENDPOINT_HOST_NOT_ALLOWED')
  }
}

async function getEnabledTarget(
  ctx: QueryOrMutationCtx,
  targetId?: Id<'revalidationTargets'> | null,
) {
  if (targetId) {
    const target = await ctx.db.get(targetId)
    return target?.enabled ? target : null
  }

  return await ctx.db
    .query('revalidationTargets')
    .withIndex('by_enabled_environment', (q) =>
      q.eq('enabled', true).eq('environment', 'production'),
    )
    .first()
}

async function scheduleRevalidationDelivery(ctx: MutationCtx) {
  if (!(await getEnabledTarget(ctx))) return
  await ctx.scheduler.runAfter(1, internalRevalidationApi.revalidation.deliverDue as never, {})
}

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
  handler: async (ctx, args) => {
    assertValidTargetEndpoint(args.endpoint)
    if (!args.secretEnv.trim()) throw new Error('REVALIDATION_SECRET_ENV_REQUIRED')
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const patch = {
      name: args.name,
      environment: args.environment,
      endpoint: args.endpoint,
      secretEnv: args.secretEnv,
      enabled: args.enabled,
      updatedBy: appIdentity.userId,
      updatedAt: now,
    }

    if (args.targetId) {
      const targetId = asRevalidationTargetId(args.targetId)
      const existing = await ctx.db.get(targetId)
      if (!existing) throw new Error('REVALIDATION_TARGET_NOT_FOUND')
      await ctx.db.patch(targetId, patch)
      return args.targetId
    }

    return toStringId(
      await ctx.db.insert('revalidationTargets', {
        ...patch,
        createdBy: appIdentity.userId,
        createdAt: now,
      }),
    )
  },
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
  handler: async (ctx) => {
    const targets = await ctx.db.query('revalidationTargets').collect()
    return targets.map((target) => ({
      id: toStringId(target._id),
      name: target.name,
      environment: target.environment,
      endpoint: target.endpoint,
      secretEnv: target.secretEnv,
      enabled: target.enabled,
      createdAt: target.createdAt,
      updatedAt: target.updatedAt,
    }))
  },
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
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100)
    const rows = args.status
      ? await ctx.db
          .query('outboxEvents')
          .withIndex('by_status_nextAttemptAt', (q) => q.eq('status', args.status!))
          .take(limit)
      : await ctx.db.query('outboxEvents').take(limit)

    return rows.map((row) => ({
      id: toStringId(row._id),
      status: row.status,
      tags: row.tags,
      paths: row.paths,
      attempts: row.attempts,
      nextAttemptAt: row.nextAttemptAt,
      lastError: row.lastError,
      deliveredAt: row.deliveredAt ?? null,
      payload: row.payload,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
  },
})

export const retryRevalidationJobOperation = defineCmsOperation({
  id: 'ginko-cms.retry-revalidation-job',
  name: 'retry-revalidation-job',
  kind: 'destructive',
  executeFunctionRef: 'revalidation:retryRevalidationJobOperationExecute',
  args: retryRevalidationJobArgs.args,
  guard: canManageSettings,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const eventId = asOutboxEventId(args.eventId)
    const event = await ctx.db.get(eventId)
    return { event, eventId }
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
  handler: async (ctx, _args, { event, eventId }) => {
    if (!event) throw new Error('REVALIDATION_EVENT_NOT_FOUND')

    const now = Date.now()
    await ctx.db.patch(eventId, {
      status: 'pending',
      nextAttemptAt: now,
      lastError: null,
      lockedAt: null,
      lockExpiresAt: null,
      updatedAt: now,
    })
    await scheduleRevalidationDelivery(ctx)
    return null
  },
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
  args: {
    now: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.string(),
      idempotencyKey: v.string(),
      type: v.union(
        v.literal('content.revalidate'),
        v.literal('content.webhook'),
        v.literal('content.publish'),
      ),
      tags: v.array(v.string()),
      paths: v.array(v.string()),
      payload: jsonObjectValidator,
      attempts: v.number(),
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
  handler: async (ctx, args): Promise<ClaimedEvent[]> => {
    const limit = Math.min(Math.max(args.limit ?? DEFAULT_BATCH_LIMIT, 1), 50)
    const due = await ctx.db
      .query('outboxEvents')
      .withIndex('by_status_nextAttemptAt', (q) => q.eq('status', 'pending'))
      .filter((q) => q.lte(q.field('nextAttemptAt'), args.now))
      .take(limit)
    const claimed: ClaimedEvent[] = []

    for (const event of due) {
      if (event.type !== 'content.revalidate') continue
      if (event.attempts >= MAX_ATTEMPTS) {
        await ctx.db.patch(event._id, {
          status: 'failed',
          lastError: `Maximum delivery attempts reached (${MAX_ATTEMPTS}).`,
          updatedAt: args.now,
        })
        continue
      }

      const target = await getEnabledTarget(ctx, event.targetId ?? null)
      if (!target) {
        continue
      }

      await ctx.db.patch(event._id, {
        status: 'delivering',
        targetId: target._id,
        attempts: event.attempts + 1,
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
  },
})

export const recordRevalidationDelivery = internalMutation({
  args: {
    eventId: v.string(),
    ok: v.boolean(),
    statusCode: v.optional(v.number()),
    error: v.optional(v.string()),
    permanent: v.optional(v.boolean()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const eventId = asOutboxEventId(args.eventId)
    const event = await ctx.db.get(eventId)
    if (!event) return null

    if (args.ok) {
      await ctx.db.patch(eventId, {
        status: 'delivered',
        lastError: null,
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
      return null
    }

    const lastError = truncateError(args.error ?? 'Revalidation delivery failed.')
    if (args.permanent === true || event.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(eventId, {
        status: 'failed',
        lastError,
        lockedAt: null,
        lockExpiresAt: null,
        updatedAt: args.now,
      })
      return null
    }

    await ctx.db.patch(eventId, {
      status: 'pending',
      nextAttemptAt: args.now + backoffMsForAttempt(event.attempts),
      lastError,
      lockedAt: null,
      lockExpiresAt: null,
      updatedAt: args.now,
    })
    return null
  },
})

export const recoverExpiredDeliveries = internalMutation({
  args: {
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('outboxEvents')
      .withIndex('by_status_nextAttemptAt', (q) => q.eq('status', 'delivering'))
      .collect()
    for (const row of rows) {
      if ((row.lockExpiresAt ?? 0) > args.now) continue
      await ctx.db.patch(row._id, {
        status: 'pending',
        nextAttemptAt: args.now,
        lockedAt: null,
        lockExpiresAt: null,
        lastError: 'Delivery lock expired before completion.',
        updatedAt: args.now,
      })
    }
    return null
  },
})

export const deliverDue = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now()
    await ctx.runMutation(
      internalRevalidationApi.revalidation.recoverExpiredDeliveries as never,
      { now } as never,
    )
    const jobs = (await ctx.runMutation(
      internalRevalidationApi.revalidation.claimDueRevalidationEvents as never,
      { now, limit: DEFAULT_BATCH_LIMIT } as never,
    )) as ClaimedEvent[]

    for (const job of jobs) {
      const token = process.env[job.target.secretEnv]
      if (!token) {
        await ctx.runMutation(
          internalRevalidationApi.revalidation.recordRevalidationDelivery as never,
          {
            eventId: job.id,
            ok: false,
            permanent: true,
            now: Date.now(),
            error: `Missing revalidation secret env "${job.target.secretEnv}".`,
          } as never,
        )
        continue
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
          if (controller.signal.aborted) {
            throw new Error('Revalidation endpoint timed out.')
          }
          throw error
        } finally {
          clearTimeout(timeout)
        }

        if (response.ok) {
          await ctx.runMutation(
            internalRevalidationApi.revalidation.recordRevalidationDelivery as never,
            {
              eventId: job.id,
              ok: true,
              statusCode: response.status,
              now: Date.now(),
            } as never,
          )
          continue
        }

        const responseText = await response.text().catch(() => '')
        await ctx.runMutation(
          internalRevalidationApi.revalidation.recordRevalidationDelivery as never,
          {
            eventId: job.id,
            ok: false,
            statusCode: response.status,
            permanent: permanentErrorStatus(response.status),
            now: Date.now(),
            error: `Revalidation endpoint returned HTTP ${response.status}${responseText ? `: ${truncateError(responseText)}` : ''}`,
          } as never,
        )
      } catch (error) {
        await ctx.runMutation(
          internalRevalidationApi.revalidation.recordRevalidationDelivery as never,
          {
            eventId: job.id,
            ok: false,
            now: Date.now(),
            error: error instanceof Error ? error.message : 'Network error during revalidation.',
          } as never,
        )
      }
    }

    return null
  },
})
