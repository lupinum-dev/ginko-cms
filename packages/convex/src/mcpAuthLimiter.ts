import { v } from 'convex/values'

import { internalMutation } from './_generated/server.js'
import { callerMutation, callerQuery } from './functions.js'
import type { MutationCtx, QueryCtx } from './lib/types.js'

const IP_LIMIT = { max: 30, windowMs: 60_000 }
const CREDENTIAL_LIMIT = { max: 5, windowMs: 5 * 60_000 }
const CLEANUP_BATCH_SIZE = 100
const OPPORTUNISTIC_CLEANUP_BATCH_SIZE = 2

const limiterResult = v.object({ limited: v.boolean() })

function activeAttempts(
  attempts: Array<{ requestId: string; timestamp: number }>,
  now: number,
  windowMs: number,
) {
  return attempts.filter((attempt) => now - attempt.timestamp < windowMs)
}

async function bucketIsLimited(
  ctx: QueryCtx | MutationCtx,
  bucketKey: string,
  now: number,
  config: typeof IP_LIMIT,
) {
  const bucket = await ctx.db
    .query('mcpAuthFailureBuckets')
    .withIndex('by_key', (q) => q.eq('bucketKey', bucketKey))
    .first()
  return bucket ? activeAttempts(bucket.attempts, now, config.windowMs).length >= config.max : false
}

export const checkFailureBudget = callerQuery.public({
  args: {
    ipBucketKey: v.string(),
    credentialBucketKey: v.string(),
    now: v.number(),
  },
  returns: limiterResult,
  handler: checkFailureBudgetHandler,
})

export async function checkFailureBudgetHandler(
  ctx: QueryCtx | MutationCtx,
  args: { ipBucketKey: string; credentialBucketKey: string; now: number },
) {
  const [ipLimited, credentialLimited] = await Promise.all([
    bucketIsLimited(ctx, args.ipBucketKey, args.now, IP_LIMIT),
    bucketIsLimited(ctx, args.credentialBucketKey, args.now, CREDENTIAL_LIMIT),
  ])
  return { limited: ipLimited || credentialLimited }
}

async function readBucket(ctx: MutationCtx, bucketKey: string) {
  return await ctx.db
    .query('mcpAuthFailureBuckets')
    .withIndex('by_key', (q) => q.eq('bucketKey', bucketKey))
    .first()
}

async function writeBucket(
  ctx: MutationCtx,
  args: {
    existing: Awaited<ReturnType<typeof readBucket>>
    bucketKey: string
    attempts: Array<{ requestId: string; timestamp: number }>
    expiresAt: number
  },
) {
  const { existing, bucketKey, attempts, expiresAt } = args
  if (existing) {
    await ctx.db.patch(existing._id, { attempts, expiresAt })
  } else {
    await ctx.db.insert('mcpAuthFailureBuckets', {
      bucketKey,
      attempts,
      expiresAt,
    })
  }
}

async function deleteExpiredFailureBuckets(ctx: MutationCtx, now: number, limit: number) {
  const expired = await ctx.db
    .query('mcpAuthFailureBuckets')
    .withIndex('by_expires_at', (q) => q.lte('expiresAt', now))
    .take(limit)
  for (const bucket of expired) await ctx.db.delete(bucket._id)
  return expired.length
}

const recordFailureArgs = {
  ipBucketKey: v.string(),
  credentialBucketKey: v.string(),
  requestId: v.string(),
}

export async function recordFailureHandler(
  ctx: MutationCtx,
  args: {
    ipBucketKey: string
    credentialBucketKey: string
    requestId: string
  },
  now = Date.now(),
) {
  await deleteExpiredFailureBuckets(ctx, now, OPPORTUNISTIC_CLEANUP_BATCH_SIZE)

  const [ipBucket, credentialBucket] = await Promise.all([
    readBucket(ctx, args.ipBucketKey),
    readBucket(ctx, args.credentialBucketKey),
  ])
  const ipAttempts = activeAttempts(ipBucket?.attempts ?? [], now, IP_LIMIT.windowMs)
  const credentialAttempts = activeAttempts(
    credentialBucket?.attempts ?? [],
    now,
    CREDENTIAL_LIMIT.windowMs,
  )
  const limited =
    ipAttempts.length >= IP_LIMIT.max || credentialAttempts.length >= CREDENTIAL_LIMIT.max
  const replayed =
    ipAttempts.some((attempt) => attempt.requestId === args.requestId) ||
    credentialAttempts.some((attempt) => attempt.requestId === args.requestId)
  if (limited || replayed) return { limited }

  const attempt = { requestId: args.requestId, timestamp: now }
  await Promise.all([
    writeBucket(ctx, {
      existing: ipBucket,
      bucketKey: args.ipBucketKey,
      attempts: [...ipAttempts, attempt],
      expiresAt: now + IP_LIMIT.windowMs,
    }),
    writeBucket(ctx, {
      existing: credentialBucket,
      bucketKey: args.credentialBucketKey,
      attempts: [...credentialAttempts, attempt],
      expiresAt: now + CREDENTIAL_LIMIT.windowMs,
    }),
  ])
  return { limited: false }
}

export const recordFailure = callerMutation.public({
  id: 'mcpAuthLimiter:recordFailure',
  contractWrite: 'bypass',
  args: recordFailureArgs,
  returns: limiterResult,
  handler: async (ctx, args) => await recordFailureHandler(ctx, args),
})

export const cleanupExpiredFailureBuckets = internalMutation({
  args: {
    now: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? CLEANUP_BATCH_SIZE), 1),
      CLEANUP_BATCH_SIZE,
    )
    return await deleteExpiredFailureBuckets(ctx, now, limit)
  },
})
