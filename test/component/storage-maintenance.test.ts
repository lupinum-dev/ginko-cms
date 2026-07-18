/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { classifyStorageDiagnosticFailure } from '#component/storageMaintenance.js'

import { createCtx, seedMember, seedStorageObject } from './entries/helpers'

const api = anyApi
const DAY_MS = 24 * 60 * 60 * 1000

afterEach(() => {
  vi.useRealTimers()
})

async function seedOutboxEvent(
  ctx: ReturnType<typeof createCtx>,
  input: {
    key: string
    status: 'pending' | 'delivering' | 'delivered' | 'dead'
    updatedAt: number
    deliveredAt?: number | null
    deliveryGeneration?: number
    leaseId?: string | null
  },
) {
  return await ctx.seed(
    'outboxEvents' as never,
    {
      type: 'content.revalidate',
      status: input.status,
      idempotencyKey: `storage-maintenance:${input.key}`,
      versionId: null,
      targetId: null,
      tags: [],
      paths: [],
      payload: {},
      attempts: input.status === 'delivering' ? 3 : 0,
      deliveryGeneration: input.deliveryGeneration ?? 0,
      leaseId: input.leaseId ?? null,
      nextAttemptAt: input.updatedAt,
      lastError: input.status === 'dead' ? 'terminal failure' : null,
      lockedAt: input.status === 'delivering' ? input.updatedAt : null,
      lockExpiresAt: input.status === 'delivering' ? input.updatedAt + DAY_MS : null,
      deliveredAt: input.deliveredAt ?? null,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
    } as never,
  )
}

async function seedAgentRun(
  ctx: ReturnType<typeof createCtx>,
  input: {
    key: string
    status: 'active' | 'completed' | 'revoked' | 'failed'
    updatedAt: number
    expiresAt?: number | null
  },
) {
  return await ctx.seed(
    'agentRuns' as never,
    {
      credentialApiKeyId: `${input.key}-credential`,
      delegatedUserId: 'owner-1',
      scopeSnapshot: ['read'],
      taskName: input.key,
      status: input.status,
      createdBy: 'owner-1',
      createdAt: input.updatedAt - DAY_MS,
      updatedAt: input.updatedAt,
      expiresAt: input.expiresAt ?? null,
      endedAt: input.status === 'active' ? null : input.updatedAt,
    } as never,
  )
}

async function seedReview(
  ctx: ReturnType<typeof createCtx>,
  input: {
    key: string
    status: 'pending' | 'approved' | 'rejected'
    updatedAt: number
    agentRunId?: string | null
  },
) {
  return await ctx.seed(
    'reviewRequests' as never,
    {
      agentRunId: input.agentRunId ?? null,
      entryId: `entry-${input.key}`,
      locales: ['en'],
      expectedVersion: 1,
      title: input.key,
      summary: input.key,
      status: input.status,
      preview: {},
      requestedBy: 'owner-1',
      reviewedBy: input.status === 'pending' ? null : 'owner-1',
      createdAt: input.updatedAt - DAY_MS,
      updatedAt: input.updatedAt,
      reviewedAt: input.status === 'pending' ? null : input.updatedAt,
    } as never,
  )
}

describe('storage maintenance', () => {
  it('[ADM-06] reports bounded tracked usage, missing bytes, and upload cleanup health to owners', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const storageId = await seedStorageObject(ctx, { bytes: 'tracked bytes', type: 'image/png' })
    await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'tracked.png',
        mimeType: 'image/png',
        size: 13,
        sha256: 'sha256-tracked',
        width: 1,
        height: 1,
        frames: 1,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collection: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: 1,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
        kind: 'image',
        filenameSort: 'tracked.png',
        discoveryText: 'tracked.png',
        effectiveUpdatedAt: 1,
        deletedState: 'active',
      } as never,
    )

    await expect(
      ctx.asCmsUser('owner-1').query(api.storageMaintenance.getStorageHealth, {}),
    ).resolves.toMatchObject({
      status: 'healthy',
      usage: {
        trackedAssets: 1,
        trackedBytes: 13,
        quotaBytes: null,
        quotaSource: 'provider-managed',
      },
      constraints: { supportedAssets: 500, countComplete: true },
      bytes: { checked: 1, missing: 0 },
      issues: [],
    })

    await ctx.raw.run(async (innerCtx) => await innerCtx.storage.delete(storageId as never))
    await expect(
      ctx.asCmsUser('owner-1').query(api.storageMaintenance.getStorageHealth, {}),
    ).resolves.toMatchObject({
      status: 'attention',
      bytes: { checked: 1, missing: 1 },
      issues: [expect.objectContaining({ code: 'missing-bytes', count: 1 })],
    })
  })

  it('[ADM-06] keeps storage health owner-only and diagnostics leave no CMS records or bytes', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })

    await expect(
      ctx.asCmsUser('viewer-1').query(api.storageMaintenance.getStorageHealth, {}),
    ).rejects.toThrow(/forbidden/i)
    const beforeAssets = await ctx.readAll('assets')
    const beforeSessions = await ctx.readAll('assetUploadSessions')
    const beforeStorage = await ctx.raw.run(
      async (innerCtx) => await innerCtx.db.system.query('_storage').collect(),
    )
    await expect(
      ctx.asCmsUser('owner-1').mutation(api.storageMaintenance.runStorageDiagnostic, {}),
    ).resolves.toMatchObject({
      status: 'healthy',
      code: 'STORAGE_UPLOAD_READY',
      createdStorageObject: false,
    })
    expect(await ctx.readAll('assets')).toEqual(beforeAssets)
    expect(await ctx.readAll('assetUploadSessions')).toEqual(beforeSessions)
    expect(
      await ctx.raw.run(async (innerCtx) => await innerCtx.db.system.query('_storage').collect()),
    ).toEqual(beforeStorage)
  })

  it('[ADM-06] redacts provider diagnostics while distinguishing setup, quota, and transient failures', () => {
    expect(
      classifyStorageDiagnosticFailure(new Error('missing configuration SECRET=value')),
    ).toEqual(expect.objectContaining({ status: 'missing-setup', code: 'STORAGE_SETUP_MISSING' }))
    expect(classifyStorageDiagnosticFailure(new Error('quota exceeded SECRET=value'))).toEqual(
      expect.objectContaining({ status: 'quota-or-limit', code: 'STORAGE_LIMIT_REACHED' }),
    )
    expect(classifyStorageDiagnosticFailure(new Error('provider SECRET=value failed'))).toEqual(
      expect.objectContaining({
        status: 'temporary-failure',
        code: 'STORAGE_TEMPORARILY_UNAVAILABLE',
      }),
    )
    for (const result of [
      classifyStorageDiagnosticFailure(new Error('missing configuration SECRET=value')),
      classifyStorageDiagnosticFailure(new Error('quota exceeded SECRET=value')),
      classifyStorageDiagnosticFailure(new Error('provider SECRET=value failed')),
    ]) {
      expect(result.message).not.toContain('SECRET=value')
    }
  })

  it('retains live generation-fenced work while pruning expired operational history', async () => {
    const ctx = createCtx()
    const now = Date.UTC(2026, 4, 13)
    const oldDelivered = await seedOutboxEvent(ctx, {
      key: 'old-delivered',
      status: 'delivered',
      updatedAt: now - 31 * DAY_MS,
      deliveredAt: now - 31 * DAY_MS,
    })
    const recentDelivered = await seedOutboxEvent(ctx, {
      key: 'recent-delivered',
      status: 'delivered',
      updatedAt: now - 29 * DAY_MS,
      deliveredAt: now - 29 * DAY_MS,
    })
    const oldDead = await seedOutboxEvent(ctx, {
      key: 'old-dead',
      status: 'dead',
      updatedAt: now - 91 * DAY_MS,
    })
    const recentDead = await seedOutboxEvent(ctx, {
      key: 'recent-dead',
      status: 'dead',
      updatedAt: now - 89 * DAY_MS,
    })
    const pending = await seedOutboxEvent(ctx, {
      key: 'pending',
      status: 'pending',
      updatedAt: now - 400 * DAY_MS,
    })
    const delivering = await seedOutboxEvent(ctx, {
      key: 'delivering',
      status: 'delivering',
      updatedAt: now - 400 * DAY_MS,
      deliveryGeneration: 7,
      leaseId: 'lease-generation-7',
    })

    const oldActivity = await ctx.seed(
      'activity' as never,
      {
        kind: 'entry.updated',
        outcome: 'applied',
        summary: 'old activity',
        retention: 'standard',
        entryId: null,
        collection: null,
        locale: null,
        detail: null,
        appIdentityId: 'owner-1',
        actorLabel: null,
        createdAt: now - 181 * DAY_MS,
      } as never,
    )
    const recentActivity = await ctx.seed(
      'activity' as never,
      {
        kind: 'entry.updated',
        outcome: 'applied',
        summary: 'recent activity',
        retention: 'standard',
        entryId: null,
        collection: null,
        locale: null,
        detail: null,
        appIdentityId: 'owner-1',
        actorLabel: null,
        createdAt: now - 179 * DAY_MS,
      } as never,
    )
    const auditId = await ctx.seed(
      'destructiveAuditLog' as never,
      {
        operationId: 'test.operation',
        jti: 'jti-1',
        callerKey: 'caller',
        scopeKey: 'scope',
        argsHash: 'args',
        previewHash: 'preview',
        status: 'applied',
        code: null,
        message: null,
        recordedAt: now - 400 * DAY_MS,
        executePath: 'path',
      } as never,
    )

    const oldCompletedRun = await seedAgentRun(ctx, {
      key: 'old-completed',
      status: 'completed',
      updatedAt: now - 181 * DAY_MS,
    })
    const retainedCompletedRun = await seedAgentRun(ctx, {
      key: 'retained-completed',
      status: 'completed',
      updatedAt: now - 181 * DAY_MS,
    })
    const expiredActiveRun = await seedAgentRun(ctx, {
      key: 'expired-active',
      status: 'active',
      updatedAt: now - DAY_MS,
      expiresAt: now - 1,
    })
    const oldApprovedReview = await seedReview(ctx, {
      key: 'old-approved',
      status: 'approved',
      updatedAt: now - 181 * DAY_MS,
    })
    const retainedReview = await seedReview(ctx, {
      key: 'retained',
      status: 'pending',
      updatedAt: now - 179 * DAY_MS,
      agentRunId: retainedCompletedRun,
    })

    const result = await ctx.raw.mutation(api.storageMaintenance.cleanupStorageHygiene, { now })
    expect(result).toEqual({
      outboxDelivered: 1,
      outboxFailed: 1,
      activity: 1,
      agentRuns: 2,
      reviewRequests: 1,
      remaining: false,
    })

    const outboxRows = await ctx.readAll('outboxEvents')
    const outboxIds = outboxRows.map((row) => String(row._id))
    expect(outboxIds).not.toContain(oldDelivered)
    expect(outboxIds).not.toContain(oldDead)
    expect(outboxIds).toEqual(
      expect.arrayContaining([recentDelivered, recentDead, pending, delivering]),
    )
    expect(outboxRows.find((row) => String(row._id) === delivering)).toMatchObject({
      status: 'delivering',
      attempts: 3,
      deliveryGeneration: 7,
      leaseId: 'lease-generation-7',
    })

    const activityIds = (await ctx.readAll('activity')).map((row) => String(row._id))
    expect(activityIds).not.toContain(oldActivity)
    expect(activityIds).toContain(recentActivity)
    expect((await ctx.readAll('destructiveAuditLog')).map((row) => String(row._id))).toContain(
      auditId,
    )

    const runIds = (await ctx.readAll('agentRuns')).map((row) => String(row._id))
    expect(runIds).not.toContain(oldCompletedRun)
    expect(runIds).not.toContain(expiredActiveRun)
    expect(runIds).toContain(retainedCompletedRun)
    const reviewIds = (await ctx.readAll('reviewRequests')).map((row) => String(row._id))
    expect(reviewIds).not.toContain(oldApprovedReview)
    expect(reviewIds).toContain(retainedReview)
  })

  it('continues closed-review cleanup in bounded indexed pages', async () => {
    const ctx = createCtx()
    const now = Date.UTC(2026, 4, 13)
    vi.useFakeTimers()
    vi.setSystemTime(now)
    for (let index = 0; index < 3; index += 1) {
      await seedReview(ctx, {
        key: `old-rejected-${index}`,
        status: 'rejected',
        updatedAt: now - 181 * DAY_MS,
      })
    }

    await expect(
      ctx.raw.mutation(api.storageMaintenance.cleanupStorageHygiene, { now, limit: 2 }),
    ).resolves.toMatchObject({ reviewRequests: 2, remaining: true })
    await ctx.raw.finishAllScheduledFunctions(() => vi.runAllTimers())

    expect(await ctx.readAll('reviewRequests')).toEqual([])
  })

  it('advances its durable cursor past a full retained page', async () => {
    const ctx = createCtx()
    const now = Date.UTC(2026, 4, 13)
    vi.useFakeTimers()
    vi.setSystemTime(now)
    for (let index = 0; index < 2; index += 1) {
      const runId = await seedAgentRun(ctx, {
        key: `retained-${index}`,
        status: 'completed',
        updatedAt: now - (183 - index) * DAY_MS,
      })
      await seedReview(ctx, {
        key: `retained-${index}`,
        status: 'pending',
        updatedAt: now - 179 * DAY_MS,
        agentRunId: runId,
      })
    }
    const deletableRun = await seedAgentRun(ctx, {
      key: 'deletable-after-retained-page',
      status: 'completed',
      updatedAt: now - 181 * DAY_MS,
    })

    await expect(
      ctx.raw.mutation(api.storageMaintenance.cleanupStorageHygiene, { now, limit: 2 }),
    ).resolves.toMatchObject({ agentRuns: 0, remaining: true })
    await ctx.raw.finishAllScheduledFunctions(() => vi.runAllTimers())

    const remainingRunIds = (await ctx.readAll('agentRuns')).map((row) => String(row._id))
    expect(remainingRunIds).not.toContain(deletableRun)
    expect(remainingRunIds).toHaveLength(2)
  })
})
