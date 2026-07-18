import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../_generated/server.js'
import { canManageSettings } from '../auth/checks.js'
import { callerAction } from '../functions.js'
import { logActivity } from '../lib/activity.js'
import { assertValidTargetEndpoint } from './targets.js'
import { hmacSha256Hex } from './worker.js'

declare const process: { env: Record<string, string | undefined> }

const REVALIDATION_DIAGNOSTIC_TIMEOUT_MS = 5_000

const getRevalidationTargetForTestRef = makeFunctionReference<
  'query',
  { targetId: string },
  { id: string; endpoint: string; secretEnv: string } | null
>('revalidation/diagnostics:getRevalidationTargetForTest')
const recordRevalidationTargetTestRef = makeFunctionReference<
  'mutation',
  {
    targetId: string
    actorUserId: string
    status: 'passed' | 'failed'
    code: string
    statusCode: number | null
    durationMs: number
  },
  null
>('revalidation/diagnostics:recordRevalidationTargetTest')

const revalidationDiagnosticResultValidator = v.object({
  status: v.union(v.literal('passed'), v.literal('failed')),
  code: v.union(
    v.literal('REVALIDATION_TEST_PASSED'),
    v.literal('REVALIDATION_SECRET_MISSING'),
    v.literal('REVALIDATION_TEST_TIMEOUT'),
    v.literal('REVALIDATION_TEST_HTTP_ERROR'),
    v.literal('REVALIDATION_TEST_NETWORK_ERROR'),
  ),
  statusCode: v.union(v.number(), v.null()),
  durationMs: v.number(),
  message: v.string(),
})

export const getRevalidationTargetForTest = internalQuery({
  args: { targetId: v.string() },
  returns: v.union(
    v.object({ id: v.string(), endpoint: v.string(), secretEnv: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const targetId = ctx.db.normalizeId('revalidationTargets', args.targetId)
    const target = targetId ? await ctx.db.get(targetId) : null
    return target
      ? { id: String(target._id), endpoint: target.endpoint, secretEnv: target.secretEnv }
      : null
  },
})

export const recordRevalidationTargetTest = internalMutation({
  args: {
    targetId: v.string(),
    actorUserId: v.string(),
    status: v.union(v.literal('passed'), v.literal('failed')),
    code: v.string(),
    statusCode: v.union(v.number(), v.null()),
    durationMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const targetId = ctx.db.normalizeId('revalidationTargets', args.targetId)
    const target = targetId ? await ctx.db.get(targetId) : null
    if (!target) return null
    await logActivity(ctx, {
      kind: 'revalidation.tested',
      summary: `Revalidation target diagnostic ${args.status}`,
      appIdentityId: args.actorUserId,
      subjectKey: args.targetId,
      detail: {
        targetId: args.targetId,
        status: args.status,
        code: args.code,
        statusCode: args.statusCode,
        durationMs: args.durationMs,
      },
    })
    return null
  },
})

export const testRevalidationTarget = callerAction.protected({
  id: 'revalidation:testRevalidationTarget',
  args: { targetId: v.string() },
  guard: canManageSettings,
  contractWrite: 'bypass',
  returns: revalidationDiagnosticResultValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.appIdentity()
    const target = await ctx.runQuery(getRevalidationTargetForTestRef, { targetId: args.targetId })
    if (!target) throw new Error('REVALIDATION_TARGET_NOT_FOUND')
    assertValidTargetEndpoint(target.endpoint)
    const startedAt = Date.now()
    let result: {
      status: 'passed' | 'failed'
      code:
        | 'REVALIDATION_TEST_PASSED'
        | 'REVALIDATION_SECRET_MISSING'
        | 'REVALIDATION_TEST_TIMEOUT'
        | 'REVALIDATION_TEST_HTTP_ERROR'
        | 'REVALIDATION_TEST_NETWORK_ERROR'
      statusCode: number | null
      durationMs: number
      message: string
    }
    const secret = process.env[target.secretEnv]
    if (!secret) {
      result = {
        status: 'failed',
        code: 'REVALIDATION_SECRET_MISSING',
        statusCode: null,
        durationMs: Date.now() - startedAt,
        message: 'The configured revalidation credential is unavailable to this deployment.',
      }
    } else {
      const eventId = `diagnostic-${globalThis.crypto.randomUUID()}`
      const timestamp = String(Date.now())
      const body = JSON.stringify({
        eventId,
        idempotencyKey: eventId,
        reason: 'diagnostic',
        tags: [],
        paths: [],
      })
      const signature = await hmacSha256Hex(secret, `${timestamp}.${eventId}.${body}`)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REVALIDATION_DIAGNOSTIC_TIMEOUT_MS)
      try {
        const response = await fetch(target.endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'content-type': 'application/json',
            'x-ginko-revalidation-event': eventId,
            'x-ginko-revalidation-test': '1',
            'x-ginko-signature': `sha256=${signature}`,
            'x-ginko-signature-timestamp': timestamp,
          },
          body,
          signal: controller.signal,
        })
        result = response.ok
          ? {
              status: 'passed',
              code: 'REVALIDATION_TEST_PASSED',
              statusCode: response.status,
              durationMs: Date.now() - startedAt,
              message: 'The revalidation endpoint accepted the signed diagnostic.',
            }
          : {
              status: 'failed',
              code: 'REVALIDATION_TEST_HTTP_ERROR',
              statusCode: response.status,
              durationMs: Date.now() - startedAt,
              message: `The revalidation endpoint returned HTTP ${response.status}.`,
            }
      } catch {
        const timedOut = controller.signal.aborted
        result = {
          status: 'failed',
          code: timedOut ? 'REVALIDATION_TEST_TIMEOUT' : 'REVALIDATION_TEST_NETWORK_ERROR',
          statusCode: null,
          durationMs: Date.now() - startedAt,
          message: timedOut
            ? 'The revalidation diagnostic timed out after 5 seconds.'
            : 'The revalidation endpoint could not be reached.',
        }
      } finally {
        clearTimeout(timeout)
      }
    }
    await ctx.runMutation(recordRevalidationTargetTestRef, {
      targetId: target.id,
      actorUserId: identity.userId,
      status: result.status,
      code: result.code,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
    })
    return result
  },
})
