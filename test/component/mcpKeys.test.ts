import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedMember } from '../helpers'

const api = anyApi

describe('component: mcpKeys consumeToken', () => {
  it('returns an mcpKeyId for an active key bound to a member', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const now = Date.now()

    const keyId = await ctx.seed(
      'mcpKeys' as never,
      {
        name: 'Claude local',
        prefix: 'mcp_deadbeef...',
        hash: 'hash_123',
        boundUserId: 'owner-1',
        issuedBy: 'owner-1',
        status: 'active',
        createdAt: now,
        expiresAt: now + 60_000,
      } as never,
    )

    await expect(
      ctx.raw.mutation(api.mcpKeys.consumeToken, {
        hash: 'hash_123',
        seenAt: Date.now(),
        clientIp: '127.0.0.1',
      }),
    ).resolves.toEqual({
      mcpKeyId: String(keyId),
    })
  })

  it('debounces lastUsedAt updates but still returns the bound key id', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })

    const createdAt = Date.now() - 120_000
    const keyId = await ctx.seed(
      'mcpKeys' as never,
      {
        name: 'Claude local',
        prefix: 'mcp_deadbeef...',
        hash: 'hash_touch',
        boundUserId: 'owner-1',
        issuedBy: 'owner-1',
        status: 'active',
        createdAt,
        expiresAt: createdAt + 120_000,
        lastUsedAt: createdAt,
      } as never,
    )

    await expect(
      ctx.raw.mutation(api.mcpKeys.consumeToken, {
        hash: 'hash_touch',
        seenAt: createdAt + 30_000,
        clientIp: null,
      }),
    ).resolves.toEqual({
      mcpKeyId: String(keyId),
    })

    const untouched = await ctx.raw.run(async (innerCtx) => await innerCtx.db.get(keyId as never))
    expect(untouched?.lastUsedAt).toBe(createdAt)

    await expect(
      ctx.raw.mutation(api.mcpKeys.consumeToken, {
        hash: 'hash_touch',
        seenAt: createdAt + 60_001,
        clientIp: null,
      }),
    ).resolves.toEqual({
      mcpKeyId: String(keyId),
    })

    const touched = await ctx.raw.run(async (innerCtx) => await innerCtx.db.get(keyId as never))
    expect(touched?.lastUsedAt).toBe(createdAt + 60_001)
  })

  it('returns null for revoked keys or missing members', async () => {
    const ctx = createCtx()
    const now = Date.now()

    await ctx.seed(
      'mcpKeys' as never,
      {
        name: 'revoked',
        prefix: 'mcp_revoked...',
        hash: 'hash_revoked',
        boundUserId: 'owner-1',
        issuedBy: 'owner-1',
        status: 'revoked',
        createdAt: now,
        expiresAt: now + 60_000,
      } as never,
    )

    await ctx.seed(
      'mcpKeys' as never,
      {
        name: 'orphaned',
        prefix: 'mcp_orphaned...',
        hash: 'hash_orphaned',
        boundUserId: 'missing-user',
        issuedBy: 'owner-1',
        status: 'active',
        createdAt: now,
        expiresAt: now + 60_000,
      } as never,
    )

    await expect(
      ctx.raw.mutation(api.mcpKeys.consumeToken, {
        hash: 'hash_revoked',
        seenAt: Date.now(),
        clientIp: null,
      }),
    ).resolves.toBeNull()

    await expect(
      ctx.raw.mutation(api.mcpKeys.consumeToken, {
        hash: 'hash_orphaned',
        seenAt: Date.now(),
        clientIp: null,
      }),
    ).resolves.toBeNull()
  })

  it('returns null for expired keys', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const now = Date.now()

    await ctx.seed(
      'mcpKeys' as never,
      {
        name: 'expired',
        prefix: 'mcp_expired...',
        hash: 'hash_expired',
        boundUserId: 'owner-1',
        issuedBy: 'owner-1',
        status: 'active',
        createdAt: now - 120_000,
        expiresAt: now - 1,
      } as never,
    )

    await expect(
      ctx.raw.mutation(api.mcpKeys.consumeToken, {
        hash: 'hash_expired',
        seenAt: now,
        clientIp: null,
      }),
    ).resolves.toBeNull()
  })

  it('returns null for legacy keys without an expiry', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const now = Date.now()

    await ctx.seed(
      'mcpKeys' as never,
      {
        name: 'legacy',
        prefix: 'mcp_legacy...',
        hash: 'hash_legacy',
        boundUserId: 'owner-1',
        issuedBy: 'owner-1',
        status: 'active',
        createdAt: now - 120_000,
      } as never,
    )

    await expect(
      ctx.raw.mutation(api.mcpKeys.consumeToken, {
        hash: 'hash_legacy',
        seenAt: now,
        clientIp: null,
      }),
    ).resolves.toBeNull()
  })
})

describe('component: mcpKeys lifecycle', () => {
  it('defaults new keys to a 90 day expiry and surfaces it in list responses', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const owner = ctx.asCmsUser('owner-1')
    const before = Date.now()

    const keyId = await owner.mutation(api.mcpKeys.create, {
      name: 'Claude local',
      prefix: 'mcp_deadbeef...',
      hash: 'hash_created',
      boundUserId: 'owner-1',
    })

    const rows = await owner.query(api.mcpKeys.list, {})
    const key = rows.find((row) => row._id === keyId)
    expect(key?.expiresAt).toBeGreaterThanOrEqual(before + 90 * 24 * 60 * 60 * 1000)
    expect(key?.expiresAt).toBeLessThanOrEqual(Date.now() + 90 * 24 * 60 * 60 * 1000)
  })
})

describe('component: destructive confirmation retention', () => {
  it('cleans expired confirmations in bounded batches and keeps unexpired rows', async () => {
    const ctx = createCtx()
    const now = Date.now()
    const expiredOne = await ctx.seed(
      'destructiveConfirmations' as never,
      {
        tokenHash: 'expired_token_1',
        jti: 'jti_expired_1',
        operationId: 'ginko-cms.delete-entry',
        executePath: 'execute',
        previewPath: 'preview',
        callerKey: 'mcp:key_123',
        scopeKey: 'tenant_123',
        argsHash: 'args_hash_1',
        previewHash: 'preview_hash_1',
        createdAt: now - 60_000,
        redeemedAt: now - 60_000,
        expiresAt: now - 1,
      } as never,
    )
    const expiredTwo = await ctx.seed(
      'destructiveConfirmations' as never,
      {
        tokenHash: 'expired_token_2',
        jti: 'jti_expired_2',
        operationId: 'ginko-cms.delete-entry',
        executePath: 'execute',
        previewPath: 'preview',
        callerKey: 'mcp:key_123',
        scopeKey: 'tenant_123',
        argsHash: 'args_hash_2',
        previewHash: 'preview_hash_2',
        createdAt: now - 60_000,
        redeemedAt: now - 60_000,
        expiresAt: now - 1,
      } as never,
    )
    const unexpired = await ctx.seed(
      'destructiveConfirmations' as never,
      {
        tokenHash: 'unexpired_token_1',
        jti: 'jti_unexpired_1',
        operationId: 'ginko-cms.delete-entry',
        executePath: 'execute',
        previewPath: 'preview',
        callerKey: 'mcp:key_123',
        scopeKey: 'tenant_123',
        argsHash: 'args_hash_3',
        previewHash: 'preview_hash_3',
        createdAt: now,
        redeemedAt: now,
        expiresAt: now + 60_000,
      } as never,
    )

    await expect(
      ctx.raw.mutation(api.mcpKeys.cleanupExpiredConfirmations, {
        now,
        limit: 1,
      }),
    ).resolves.toEqual({ deleted: 1, remaining: true })

    const afterFirstBatch = await ctx.raw.run(async (innerCtx) => ({
      expiredOne: await innerCtx.db.get(expiredOne as never),
      expiredTwo: await innerCtx.db.get(expiredTwo as never),
      unexpired: await innerCtx.db.get(unexpired as never),
    }))
    expect([afterFirstBatch.expiredOne, afterFirstBatch.expiredTwo].filter(Boolean)).toHaveLength(1)
    expect(afterFirstBatch.unexpired).not.toBeNull()

    await expect(
      ctx.raw.mutation(api.mcpKeys.cleanupExpiredConfirmations, {
        now,
        limit: 100,
      }),
    ).resolves.toEqual({ deleted: 1, remaining: false })

    const afterSecondBatch = await ctx.raw.run(async (innerCtx) => ({
      expiredOne: await innerCtx.db.get(expiredOne as never),
      expiredTwo: await innerCtx.db.get(expiredTwo as never),
      unexpired: await innerCtx.db.get(unexpired as never),
    }))
    expect(afterSecondBatch.expiredOne).toBeNull()
    expect(afterSecondBatch.expiredTwo).toBeNull()
    expect(afterSecondBatch.unexpired).not.toBeNull()
  })
})
