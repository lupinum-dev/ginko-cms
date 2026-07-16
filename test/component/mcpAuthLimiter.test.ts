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
        now: Date.now(),
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

  it('evaluates the advisory check at the signed request timestamp', async () => {
    const ctx = createCtx()
    const credentialBucketKey = 'e'.repeat(64)
    await ctx.seed(
      'mcpAuthFailureBuckets' as never,
      {
        bucketKey: credentialBucketKey,
        attempts: Array.from({ length: 5 }, (_, index) => ({
          requestId: `request-${index}`,
          timestamp: 1_000,
        })),
        expiresAt: 301_000,
      } as never,
    )

    const args = {
      ipBucketKey: 'f'.repeat(64),
      credentialBucketKey,
    }
    await expect(
      ctx.raw.query(api.mcpAuthLimiter.checkFailureBudget, { ...args, now: 2_000 }),
    ).resolves.toEqual({ limited: true })
    await expect(
      ctx.raw.query(api.mcpAuthLimiter.checkFailureBudget, { ...args, now: 400_000 }),
    ).resolves.toEqual({ limited: false })
  })

  it.each([
    {
      saturatedKey: 'ipBucketKey' as const,
      saturatedBucketKey: 'e'.repeat(64),
      otherBucketKey: 'f'.repeat(64),
      attempts: 30,
    },
    {
      saturatedKey: 'credentialBucketKey' as const,
      saturatedBucketKey: '0'.repeat(64),
      otherBucketKey: '1'.repeat(64),
      attempts: 5,
    },
  ])(
    'does not mutate the other bucket when $saturatedKey is already saturated',
    async ({ saturatedKey, saturatedBucketKey, otherBucketKey, attempts }) => {
      const ctx = createCtx()
      const now = Date.now()
      await ctx.seed(
        'mcpAuthFailureBuckets' as never,
        {
          bucketKey: saturatedBucketKey,
          attempts: Array.from({ length: attempts }, (_, index) => ({
            requestId: `existing-${index}`,
            timestamp: now,
          })),
          expiresAt: now + 300_000,
        } as never,
      )

      const args = {
        ipBucketKey: saturatedKey === 'ipBucketKey' ? saturatedBucketKey : otherBucketKey,
        credentialBucketKey:
          saturatedKey === 'credentialBucketKey' ? saturatedBucketKey : otherBucketKey,
        requestId: 'blocked-request',
      }
      await expect(ctx.raw.mutation(api.mcpAuthLimiter.recordFailure, args)).resolves.toEqual({
        limited: true,
      })

      const rows = (await ctx.readAll('mcpAuthFailureBuckets')) as Array<{
        bucketKey: string
        attempts: Array<{ requestId: string }>
      }>
      expect(rows).toHaveLength(1)
      expect(rows[0]?.bucketKey).toBe(saturatedBucketKey)
      expect(rows[0]?.attempts).toHaveLength(attempts)
    },
  )

  it('opportunistically drains enough expired buckets to self-stabilize under new keys', async () => {
    const ctx = createCtx()
    const now = Date.now()
    for (let index = 0; index < 6; index += 1) {
      await ctx.seed(
        'mcpAuthFailureBuckets' as never,
        {
          bucketKey: `${index}`.repeat(64),
          attempts: [{ requestId: `expired-${index}`, timestamp: now - 600_000 }],
          expiresAt: now - 1,
        } as never,
      )
    }

    const ipBucketKey = 'a'.repeat(64)
    for (let index = 0; index < 4; index += 1) {
      await ctx.raw.mutation(api.mcpAuthLimiter.recordFailure, {
        ipBucketKey,
        credentialBucketKey: String.fromCharCode(98 + index).repeat(64),
        requestId: `current-${index}`,
      })
    }

    const rows = (await ctx.readAll('mcpAuthFailureBuckets')) as Array<{
      expiresAt: number
    }>
    expect(rows).toHaveLength(5)
    expect(rows.every((row) => row.expiresAt > now)).toBe(true)
  })

  it('keeps a bounded explicit cleanup mutation for idle periods', async () => {
    const ctx = createCtx()
    const now = Date.now()
    for (let index = 0; index < 3; index += 1) {
      await ctx.seed(
        'mcpAuthFailureBuckets' as never,
        {
          bucketKey: `${index}`.repeat(64),
          attempts: [{ requestId: `expired-${index}`, timestamp: now - 600_000 }],
          expiresAt: now - 1,
        } as never,
      )
    }

    await expect(
      ctx.raw.mutation(api.mcpAuthLimiter.cleanupExpiredFailureBuckets, { now, limit: 2 }),
    ).resolves.toBe(2)
    expect(await ctx.readAll('mcpAuthFailureBuckets')).toHaveLength(1)
  })
})
