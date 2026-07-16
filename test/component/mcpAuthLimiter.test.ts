import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx } from '../helpers'

const api = anyApi

describe('component: MCP authentication failure limiter', () => {
  it('atomically records concurrent failures and keeps the two budgets independent', async () => {
    const ctx = createCtx()
    const ipBucketKey = 'a'.repeat(64)
    const credentialBucketKey = 'b'.repeat(64)

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        ctx.raw.mutation(api.mcpAuthLimiter.recordFailure, {
          ipBucketKey,
          credentialBucketKey,
          requestId: `request-${index}`,
        }),
      ),
    )
    expect(results).toEqual(Array.from({ length: 5 }, () => ({ limited: false })))
    await expect(
      ctx.raw.query(api.mcpAuthLimiter.checkFailureBudget, {
        ipBucketKey,
        credentialBucketKey,
      }),
    ).resolves.toEqual({ limited: true })

    const rows = (await ctx.readAll('mcpAuthFailureBuckets')) as Array<{
      bucketKey: string
      attempts: Array<{ requestId: string; timestamp: number }>
    }>
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.attempts.length).sort()).toEqual([5, 5])
  })

  it('records replayed request IDs idempotently', async () => {
    const ctx = createCtx()
    const args = {
      ipBucketKey: 'c'.repeat(64),
      credentialBucketKey: 'd'.repeat(64),
      requestId: 'same-request',
    }
    await ctx.raw.mutation(api.mcpAuthLimiter.recordFailure, args)
    await ctx.raw.mutation(api.mcpAuthLimiter.recordFailure, args)

    const rows = (await ctx.readAll('mcpAuthFailureBuckets')) as Array<{
      attempts: Array<{ requestId: string }>
    }>
    expect(rows.map((row) => row.attempts)).toEqual([
      [{ requestId: 'same-request', timestamp: expect.any(Number) }],
      [{ requestId: 'same-request', timestamp: expect.any(Number) }],
    ])
  })

  it('keeps global cleanup out of record transactions and deletes expired buckets separately', async () => {
    const ctx = createCtx()
    const now = Date.now()
    await ctx.seed(
      'mcpAuthFailureBuckets' as never,
      {
        bucketKey: 'e'.repeat(64),
        attempts: [{ requestId: 'expired', timestamp: now - 600_000 }],
        expiresAt: now - 1,
      } as never,
    )

    await ctx.raw.mutation(api.mcpAuthLimiter.recordFailure, {
      ipBucketKey: 'f'.repeat(64),
      credentialBucketKey: '0'.repeat(64),
      requestId: 'current',
    })
    expect(await ctx.readAll('mcpAuthFailureBuckets')).toHaveLength(3)

    await expect(
      ctx.raw.mutation(api.mcpAuthLimiter.cleanupExpiredFailureBuckets, {
        now,
        limit: 100,
      }),
    ).resolves.toBe(1)
    expect(await ctx.readAll('mcpAuthFailureBuckets')).toHaveLength(2)
  })
})
