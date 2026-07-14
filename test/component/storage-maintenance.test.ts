/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedEditorFixture, seedOwner, seedSettings } from './entries/helpers'

const api = anyApi
const DAY_MS = 24 * 60 * 60 * 1000
async function seedOutboxEvent(
  ctx: ReturnType<typeof createCtx>,
  input: {
    status: 'pending' | 'delivering' | 'delivered' | 'failed'
    updatedAt: number
    deliveredAt?: number | null
  },
) {
  return await ctx.seed(
    'outboxEvents' as never,
    {
      type: 'content.revalidate',
      status: input.status,
      idempotencyKey: `storage-maintenance:${input.status}:${input.updatedAt}`,
      versionId: null,
      targetId: null,
      tags: [],
      paths: [],
      payload: {},
      attempts: 0,
      nextAttemptAt: input.updatedAt,
      lastError: input.status === 'failed' ? 'failed' : null,
      lockedAt: null,
      lockExpiresAt: null,
      deliveredAt: input.deliveredAt ?? null,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
    } as never,
  )
}

describe('storage maintenance', () => {
  it('cleans expired operational history without deleting security audit rows', async () => {
    const ctx = createCtx()
    const now = Date.UTC(2026, 4, 13)
    const oldDelivered = await seedOutboxEvent(ctx, {
      status: 'delivered',
      updatedAt: now - 31 * DAY_MS,
      deliveredAt: now - 31 * DAY_MS,
    })
    const recentDelivered = await seedOutboxEvent(ctx, {
      status: 'delivered',
      updatedAt: now - 29 * DAY_MS,
      deliveredAt: now - 29 * DAY_MS,
    })
    const oldFailed = await seedOutboxEvent(ctx, {
      status: 'failed',
      updatedAt: now - 91 * DAY_MS,
    })
    const recentFailed = await seedOutboxEvent(ctx, {
      status: 'failed',
      updatedAt: now - 89 * DAY_MS,
    })
    const pending = await seedOutboxEvent(ctx, {
      status: 'pending',
      updatedAt: now - 400 * DAY_MS,
    })

    const oldActivity = await ctx.seed(
      'activity' as never,
      {
        kind: 'entry.updated',
        summary: 'old activity',
        entryId: null,
        collectionId: null,
        locale: null,
        detail: null,
        appIdentityId: 'owner-1',
        createdAt: now - 181 * DAY_MS,
      } as never,
    )
    const recentActivity = await ctx.seed(
      'activity' as never,
      {
        kind: 'entry.updated',
        summary: 'recent activity',
        entryId: null,
        collectionId: null,
        locale: null,
        detail: null,
        appIdentityId: 'owner-1',
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
        executedAt: now - 400 * DAY_MS,
        executePath: 'path',
      } as never,
    )

    const oldCompletedRun = await ctx.seed(
      'agentRuns' as never,
      {
        credentialApiKeyId: 'old-run-key',
        delegatedUserId: 'owner-1',
        scopeSnapshot: ['read'],
        taskName: 'old completed run',
        status: 'completed',
        createdBy: 'owner-1',
        createdAt: now - 200 * DAY_MS,
        updatedAt: now - 181 * DAY_MS,
        endedAt: now - 181 * DAY_MS,
      } as never,
    )
    const retainedCompletedRun = await ctx.seed(
      'agentRuns' as never,
      {
        credentialApiKeyId: 'retained-run-key',
        delegatedUserId: 'owner-1',
        scopeSnapshot: ['read'],
        taskName: 'completed run with retained review',
        status: 'completed',
        createdBy: 'owner-1',
        createdAt: now - 200 * DAY_MS,
        updatedAt: now - 181 * DAY_MS,
        endedAt: now - 181 * DAY_MS,
      } as never,
    )
    const activeRun = await ctx.seed(
      'agentRuns' as never,
      {
        credentialApiKeyId: 'active-run-key',
        delegatedUserId: 'owner-1',
        scopeSnapshot: ['read'],
        taskName: 'old active run',
        status: 'active',
        createdBy: 'owner-1',
        createdAt: now - 400 * DAY_MS,
        updatedAt: now - 400 * DAY_MS,
      } as never,
    )
    const oldApprovedReview = await ctx.seed(
      'reviewRequests' as never,
      {
        agentRunId: null,
        entryId: 'old-entry',
        locales: ['en'],
        expectedVersion: 1,
        title: 'old approved review',
        summary: 'old approved review',
        status: 'approved',
        preview: {},
        requestedBy: 'owner-1',
        reviewedBy: 'owner-1',
        createdAt: now - 200 * DAY_MS,
        updatedAt: now - 181 * DAY_MS,
        reviewedAt: now - 181 * DAY_MS,
      } as never,
    )
    const retainedApprovedReview = await ctx.seed(
      'reviewRequests' as never,
      {
        agentRunId: retainedCompletedRun,
        entryId: 'recent-entry',
        locales: ['en'],
        expectedVersion: 1,
        title: 'recent approved review',
        summary: 'recent approved review',
        status: 'approved',
        preview: {},
        requestedBy: 'owner-1',
        reviewedBy: 'owner-1',
        createdAt: now - 200 * DAY_MS,
        updatedAt: now - 179 * DAY_MS,
        reviewedAt: now - 179 * DAY_MS,
      } as never,
    )
    const pendingReview = await ctx.seed(
      'reviewRequests' as never,
      {
        agentRunId: null,
        entryId: 'pending-entry',
        locales: ['en'],
        expectedVersion: 1,
        title: 'old pending review',
        summary: 'old pending review',
        status: 'pending',
        preview: {},
        requestedBy: 'owner-1',
        createdAt: now - 400 * DAY_MS,
        updatedAt: now - 400 * DAY_MS,
      } as never,
    )

    const result = await ctx.raw.mutation(api.storageMaintenance.cleanupStorageHygiene, { now })
    expect(result).toMatchObject({
      outboxDelivered: 1,
      outboxFailed: 1,
      activity: 1,
      agentRuns: 2,
      reviewRequests: 1,
      remaining: false,
    })

    const outboxIds = (await ctx.readAll('outboxEvents')).map((row) => String(row._id))
    expect(outboxIds).not.toContain(oldDelivered)
    expect(outboxIds).not.toContain(oldFailed)
    expect(outboxIds).toEqual(expect.arrayContaining([recentDelivered, recentFailed, pending]))

    const activityIds = (await ctx.readAll('activity')).map((row) => String(row._id))
    expect(activityIds).not.toContain(oldActivity)
    expect(activityIds).toContain(recentActivity)

    expect((await ctx.readAll('destructiveAuditLog')).map((row) => String(row._id))).toContain(
      auditId,
    )
    const runIds = (await ctx.readAll('agentRuns')).map((row) => String(row._id))
    expect(runIds).not.toContain(oldCompletedRun)
    expect(runIds).not.toContain(activeRun)
    expect(runIds).toContain(retainedCompletedRun)

    const reviewIds = (await ctx.readAll('reviewRequests')).map((row) => String(row._id))
    expect(reviewIds).not.toContain(oldApprovedReview)
    expect(reviewIds).toEqual(expect.arrayContaining([retainedApprovedReview, pendingReview]))
  })

  it('continues closed-review cleanup in bounded indexed batches', async () => {
    const ctx = createCtx()
    const now = Date.UTC(2026, 4, 13)
    for (let index = 0; index < 3; index += 1) {
      await ctx.seed(
        'reviewRequests' as never,
        {
          agentRunId: null,
          entryId: `old-entry-${index}`,
          locales: ['en'],
          expectedVersion: 1,
          title: `old review ${index}`,
          summary: `old review ${index}`,
          status: 'rejected',
          preview: {},
          requestedBy: 'owner-1',
          reviewedBy: 'owner-1',
          createdAt: now - 200 * DAY_MS,
          updatedAt: now - 181 * DAY_MS,
          reviewedAt: now - 181 * DAY_MS,
        } as never,
      )
    }

    await expect(
      ctx.raw.mutation(api.storageMaintenance.cleanupStorageHygiene, { now, limit: 2 }),
    ).resolves.toMatchObject({ reviewRequests: 2, remaining: true })
    expect(await ctx.readAll('reviewRequests')).toHaveLength(1)

    await expect(
      ctx.raw.mutation(api.storageMaintenance.cleanupStorageHygiene, { now, limit: 2 }),
    ).resolves.toMatchObject({ reviewRequests: 1, remaining: false })
    expect(await ctx.readAll('reviewRequests')).toEqual([])
  })

  it('reports storage hygiene counts and largest growth risks for owners', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collectionId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await ctx.seed(
      'entryRevisions' as never,
      {
        entryId,
        collectionId,
        revisionNumber: 1,
        parentRevisionId: null,
        kind: 'publish',
        snapshot: { shared: {}, locales: {} },
        affectedLocales: ['en'],
        message: null,
        createdBy: 'owner-1',
        createdAt: Date.now(),
      } as never,
    )
    await ctx.seed(
      'contentAssetRefs' as never,
      {
        sourceKind: 'draft',
        sourceId: `${entryId}:en`,
        assetId: 'asset-one',
        fieldPath: 'hero',
        locale: 'en',
        entryId,
        collectionId,
        updatedAt: Date.now(),
      } as never,
    )
    await seedOutboxEvent(ctx, { status: 'delivered', updatedAt: Date.now() })

    const report = await owner.query(api.diagnostics.storageHygieneReport, {})
    expect(report.counts).toMatchObject({
      entries: 1,
      entryDrafts: 2,
      entryRevisions: 1,
      contentAssetRefs: 1,
      outboxEvents: 1,
      backupArtifacts: 0,
    })
    expect(report.revisionsPerEntry).toEqual({ max: 1, average: 1 })
    expect(report.assetRefsPerEntry).toEqual({ max: 1, average: 1 })
    expect(report.outbox.delivered).toBe(1)
    expect(report.truncatedTables).toEqual([])
  })
})
