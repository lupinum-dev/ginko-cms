import { v } from 'convex/values'

import { internalMutation } from './_generated/server.js'
import { callerMutation, callerQuery } from './functions.js'
import type { MutationCtx, QueryCtx } from './lib/types.js'

const IP_LIMIT = { max: 30, windowMs: 60_000 }
const CREDENTIAL_LIMIT = { max: 5, windowMs: 5 * 60_000 }
const CLEANUP_BATCH_SIZE = 100

const limiterResult = v.object({ limited: v.boolean() })

function activeAttempts(
  attempts: Array<{ requestId: string; timestamp: number }>,
  now: number,
  windowMs: number,
) {
  return attempts.filter((attempt) => now - attempt.timestamp < windowMs)
}

async function bucketIsLimited(
  ctx: QueryCtx,
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
  },
  returns: limiterResult,
  handler: async (ctx, args) => {
    const now = Date.now()
    const [ipLimited, credentialLimited] = await Promise.all([
      bucketIsLimited(ctx, args.ipBucketKey, now, IP_LIMIT),
      bucketIsLimited(ctx, args.credentialBucketKey, now, CREDENTIAL_LIMIT),
    ])
    return { limited: ipLimited || credentialLimited }
  },
})

async function recordBucket(
  ctx: MutationCtx,
  args: {
    bucketKey: string
    requestId: string
    now: number
    config: typeof IP_LIMIT
  },
) {
  const existing = await ctx.db
    .query('mcpAuthFailureBuckets')
    .withIndex('by_key', (q) => q.eq('bucketKey', args.bucketKey))
    .first()
  const attempts = activeAttempts(existing?.attempts ?? [], args.now, args.config.windowMs)
  if (attempts.some((attempt) => attempt.requestId === args.requestId)) {
    return attempts.length >= args.config.max
  }
  const wasLimited = attempts.length >= args.config.max
  if (!wasLimited) attempts.push({ requestId: args.requestId, timestamp: args.now })
  const expiresAt = args.now + args.config.windowMs
  if (existing) {
    await ctx.db.patch(existing._id, { attempts, expiresAt })
  } else {
    await ctx.db.insert('mcpAuthFailureBuckets', {
      bucketKey: args.bucketKey,
      attempts,
      expiresAt,
    })
  }
  return wasLimited
}

export const recordFailure = callerMutation.public({
  args: {
    ipBucketKey: v.string(),
    credentialBucketKey: v.string(),
    requestId: v.string(),
  },
  returns: limiterResult,
  handler: async (ctx, args) => {
    const now = Date.now()
    const [ipLimited, credentialLimited] = await Promise.all([
      recordBucket(ctx, {
        bucketKey: args.ipBucketKey,
        requestId: args.requestId,
        now,
        config: IP_LIMIT,
      }),
      recordBucket(ctx, {
        bucketKey: args.credentialBucketKey,
        requestId: args.requestId,
        now,
        config: CREDENTIAL_LIMIT,
      }),
    ])
    return { limited: ipLimited || credentialLimited }
  },
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
    const expired = await ctx.db
      .query('mcpAuthFailureBuckets')
      .withIndex('by_expires_at', (q) => q.lte('expiresAt', now))
      .take(limit)
    for (const bucket of expired) await ctx.db.delete(bucket._id)
    return expired.length
  },
})
