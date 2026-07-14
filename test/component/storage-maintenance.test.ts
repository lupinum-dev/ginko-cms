/// <reference types="vite/client" />

import { anyApi, type FunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedEditorFixture, seedOwner, seedSettings } from './entries/helpers'

const api = anyApi
const DAY_MS = 24 * 60 * 60 * 1000
const componentOrphanReconciler = Object.assign(
  {},
  {
    [Symbol.for('toReferencePath')]:
      '_reference/childComponent/ginkoCms/storageMaintenance/reconcileStorageOrphans',
  },
) as FunctionReference<'action', 'internal'>

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
  it('enumerates only the component storage namespace before deleting old unreferenced objects', async () => {
    const ctx = createCtx()
    const rootStorageId = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob(['root-only'], { type: 'text/plain' })),
    )) as string
    const now = Date.now() + 11 * 60 * 1_000

    await expect(
      ctx.raw.action(componentOrphanReconciler, { now, cursor: null, limit: 100 }),
    ).resolves.toMatchObject({ scanned: 0, deleted: 0, complete: true })
    expect(
      await ctx.raw.run(async (innerCtx) =>
        Boolean(await innerCtx.storage.get(rootStorageId as never)),
      ),
    ).toBe(true)

    await expect(
      ctx.raw.action(api.storageMaintenance.reconcileStorageOrphans, {
        now,
        cursor: null,
        limit: 100,
      }),
    ).resolves.toMatchObject({ scanned: 1, deleted: 1, complete: true })
    expect(
      await ctx.raw.run(async (innerCtx) =>
        Boolean(await innerCtx.storage.get(rootStorageId as never)),
      ),
    ).toBe(false)
  })

  it('keeps every storage object present in the canonical CMS reference inventory', async () => {
    const ctx = createCtx()
    const ids = await Promise.all(
      ['asset', 'backup', 'stage', 'cleanup', 'orphan'].map(async (value) =>
        ctx.raw.run(async (innerCtx) =>
          innerCtx.storage.store(new Blob([value], { type: 'text/plain' })),
        ),
      ),
    )
    await ctx.seed(
      'assets' as never,
      {
        storageId: ids[0],
        filename: 'asset.png',
        mimeType: 'image/png',
        size: 5,
        width: 1,
        height: 1,
        scope: 'global',
        createdBy: 'owner-1',
        createdAt: Date.now(),
      } as never,
    )
    await ctx.seed(
      'backupArtifacts' as never,
      {
        artifactId: 'backup-1',
        scope: 'snapshot',
        checksum: 'a'.repeat(64),
        driver: 'convex-storage-json',
        storageRef: String(ids[1]),
        counts: { entries: 0, revisions: 0, assets: 0, members: 0 },
        createdBy: 'owner-1',
        createdAt: Date.now(),
      } as never,
    )
    await ctx.seed(
      'portableAssetStages' as never,
      {
        runId: 'run-1',
        callerId: 'owner-1',
        sha256: 'b'.repeat(64),
        byteLength: 5,
        mediaType: 'image/png',
        state: 'uploaded',
        storageId: ids[2],
        assetId: null,
        attemptTokenHash: 'c'.repeat(64),
        attemptGeneration: 1,
        leaseExpiresAt: Date.now(),
        storageOrigin: 'https://storage.example.test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never,
    )
    await ctx.seed(
      'assetCleanupTasks' as never,
      {
        storageId: ids[3],
        status: 'cleanup-required',
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never,
    )

    await expect(
      ctx.raw.action(api.storageMaintenance.reconcileStorageOrphans, {
        now: Date.now() + 11 * 60 * 1_000,
        cursor: null,
        limit: 100,
      }),
    ).resolves.toMatchObject({ scanned: 5, deleted: 1, complete: true })
    const present = await ctx.raw.run(async (innerCtx) =>
      Promise.all(ids.map(async (id) => Boolean(await innerCtx.storage.get(id as never)))),
    )
    expect(present).toEqual([true, true, true, true, false])
  })

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

    const result = await ctx.raw.mutation(api.storageMaintenance.cleanupStorageHygiene, { now })
    expect(result).toMatchObject({
      outboxDelivered: 1,
      outboxFailed: 1,
      activity: 1,
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
