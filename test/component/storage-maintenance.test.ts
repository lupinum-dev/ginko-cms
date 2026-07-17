/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCtx, seedEditorFixture, seedOwner } from './entries/helpers'

const api = anyApi
const DAY_MS = 24 * 60 * 60 * 1000

async function installCanonicalContract(ctx: ReturnType<typeof createCtx>) {
  const content = buildResolvedContentContract(
    {
      collections: {
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          route: '/posts',
          cms: {
            type: 'flat',
            fields: { hero: { type: 'image', localized: false } },
          },
        },
      },
    },
    { defaultLocale: 'en', locales: ['en'] },
  )
  const contentHash = await hashCanonicalJson(content)
  const presentation = {}
  await ctx.seed('cmsContract', {
    key: 'active',
    content,
    presentation,
    contentHash,
    presentationHash: await hashCanonicalJson(presentation),
    transitionState: 'ready',
    transitionRunId: null,
    installedAt: Date.UTC(2026, 4, 13),
    installedBy: 'test',
  })
  return { contentHash }
}

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
        summary: 'old activity',
        entryId: null,
        collection: null,
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
        collection: null,
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

  it('reports canonical contract, draft, revision, and asset-reference growth', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { contentHash } = await installCanonicalContract(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await ctx.raw.run(async (innerCtx) => {
      const entry = await innerCtx.db.get(entryId as never)
      if (!entry) throw new Error('Expected canonical entry')
      const localeDraft = await innerCtx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', 'en'))
        .unique()
      if (!localeDraft) throw new Error('Expected canonical locale draft')
      const revisionId = await innerCtx.db.insert('entryRevisions', {
        entryId: entry._id,
        collection: entry.collection,
        revisionNumber: 1,
        operationId: 'storage-report-checkpoint',
        parentRevisionId: null,
        kind: 'checkpoint',
        snapshots: {
          en: {
            shared: entry.shared,
            values: localeDraft.values,
            bodyMdc: localeDraft.bodyMdc,
            slug: entry.slug,
            parentEntryId: entry.parentEntryId,
            orderRank: entry.orderRank,
            sharedVersion: entry.sharedVersion,
            localeVersion: localeDraft.version,
          },
        },
        affectedLocales: ['en'],
        contentHash,
        message: null,
        createdBy: 'owner-1',
        createdAt: entry.updatedAt,
      })
      await innerCtx.db.patch(entry._id, { latestEditorialRevisionId: revisionId })
      await innerCtx.db.insert('contentAssetRefs', {
        sourceKind: 'revision',
        sourceId: String(revisionId),
        assetId: 'asset-one',
        fieldPath: 'hero',
        locale: 'en',
        entryId: entry._id,
        collection: entry.collection,
        updatedAt: entry.updatedAt,
      })
    })
    await seedOutboxEvent(ctx, {
      key: 'report-delivered',
      status: 'delivered',
      updatedAt: Date.UTC(2026, 4, 13),
      deliveredAt: Date.UTC(2026, 4, 13),
    })

    const report = await owner.query(api.diagnostics.storageHygieneReport, {})
    expect(report.counts).toMatchObject({
      entries: 1,
      entryDrafts: 1,
      entryRevisions: 1,
      publicEntries: 0,
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
