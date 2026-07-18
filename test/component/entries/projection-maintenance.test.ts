/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { verifyAssetRefSourceForRow } from '../../../packages/convex/src/entries/projections'
import {
  buildPublicProjectionPayload,
  buildPublicSearchProjectionPayload,
} from '../../../packages/convex/src/entries/workflow/projection'
import {
  createCtx,
  publishEntry,
  seedEditorFixture,
  seedOwner,
  seedSettings,
  seedStorageObject,
} from './helpers'

const api = anyApi

afterEach(() => vi.useRealTimers())

type TestCtx = ReturnType<typeof createCtx>
type Owner = ReturnType<TestCtx['asCmsUser']>
type RepairStatus = {
  runId: string
  state: 'running' | 'complete' | 'failed' | 'dead'
  generation: number
  workGeneration: number
  workToken: string | null
  workLeaseExpiresAt: number | null
  workAttempts: number
  workNextAttemptAt: number | null
  workLastError: string | null
  workDeadLetteredAt: number | null
  phase: string
  cursor: string | null
  issueCount: number
  processedEntries: number
}

function repairLease(status: RepairStatus) {
  if (!status.workToken) throw new Error('Projection repair has no active lease token.')
  return {
    runId: status.runId,
    generation: status.generation,
    workGeneration: status.workGeneration,
    token: status.workToken,
    expectedPhase: status.phase,
    expectedCursor: status.cursor,
  }
}

function projectionPayload(row: Record<string, unknown>) {
  const payload = { ...row }
  delete payload._id
  delete payload._creationTime
  return payload
}

function sortedProjectionPayloads(rows: Array<Record<string, unknown>>) {
  return rows
    .map(projectionPayload)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

async function startManualRepair(ctx: TestCtx, owner: Owner, runId: string, pageSize = 1) {
  return await owner.mutation(api.entries.projectionMaintenance.startProjectionRepairRun, {
    runId,
    pageSize,
    autoContinue: false,
  })
}

async function drainRepair(ctx: TestCtx, owner: Owner, runId: string, initial?: RepairStatus) {
  let status = initial ?? (await startManualRepair(ctx, owner, runId))
  let pages = 0
  while (status.state === 'running') {
    pages += 1
    if (pages > 100) throw new Error('Projection repair did not terminate pagewise.')
    await ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, {
      ...repairLease(status),
    })
    status = await owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, { runId })
  }
  return { status, pages }
}

async function publishedFixture() {
  const ctx = createCtx()
  await seedOwner(ctx)
  await seedSettings(ctx)
  const { entryId } = await seedEditorFixture(ctx)
  const owner = ctx.asCmsUser('owner-1')
  await publishEntry(owner, entryId)
  return { ctx, owner, entryId }
}

describe('WEB-06 canonical projection repair', () => {
  it('rebuilds a drifted public row exactly without copying unpublished draft state', async () => {
    const { ctx, owner, entryId } = await publishedFixture()
    const canonicalRow = structuredClone((await ctx.readAll('publicEntries'))[0]!)
    const canonicalSearch = structuredClone((await ctx.readAll('publicSearchEntries'))[0]!)
    expect(canonicalRow).not.toHaveProperty('bodyAst')
    expect(canonicalRow.data).toEqual(expect.objectContaining({ title: 'Hello world' }))

    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Unpublished draft' } } } },
    })
    await ctx.raw.run(async (innerCtx) => {
      const row = await innerCtx.db
        .query('publicEntries')
        .withIndex('by_entry_locale', (query) =>
          query.eq('entryId', entryId as never).eq('locale', 'en'),
        )
        .unique()
      if (!row) throw new Error('Expected the published projection.')
      await innerCtx.db.patch(row._id, {
        title: 'Corrupt title',
        data: { title: 'Corrupt data' },
        navIncluded: false,
        firstPublishedAt: row.firstPublishedAt + 1,
      })
      const search = await innerCtx.db
        .query('publicSearchEntries')
        .withIndex('by_entry_locale', (query) =>
          query.eq('entryId', entryId as never).eq('locale', 'en'),
        )
        .unique()
      if (!search) throw new Error('Expected the public search row.')
      await innerCtx.db.patch(search._id, { searchText: 'corrupt search text' })
    })

    const { status, pages } = await drainRepair(ctx, owner, 'repair-drifted-public')
    expect(status).toMatchObject({ state: 'complete', issueCount: 0 })
    expect(pages).toBeGreaterThan(5)
    expect(await ctx.readAll('publicEntries')).toEqual([canonicalRow])
    expect(await ctx.readAll('publicSearchEntries')).toEqual([canonicalSearch])
    expect((await ctx.readAll('entryLocaleDrafts'))[0]).toMatchObject({
      values: expect.objectContaining({ title: 'Unpublished draft' }),
    })
  })

  it('[WEB-06][AST-05] rebuilds deleted public, asset-reference, and draft-search rows byte-for-byte from canonical sources', async () => {
    const { ctx, owner, entryId } = await publishedFixture()
    const before = (await ctx.readAll('publicEntries'))[0]!
    const publicSearchBefore = (await ctx.readAll('publicSearchEntries'))[0]!
    const draftSearchBefore = (await ctx.readAll('draftSearchEntries'))[0]!
    await ctx.raw.run(async (innerCtx) => {
      for (const row of await innerCtx.db.query('publicEntries').collect()) {
        await innerCtx.db.delete(row._id)
      }
      for (const row of await innerCtx.db.query('publicSearchEntries').collect()) {
        await innerCtx.db.delete(row._id)
      }
      for (const row of await innerCtx.db.query('draftSearchEntries').collect()) {
        await innerCtx.db.delete(row._id)
      }
      await innerCtx.db.insert('publicSearchEntries', {
        entryId: entryId as never,
        collection: 'posts',
        locale: 'removed-locale',
        revisionId: before.revisionId,
        stableId: before.stableId,
        searchShard: 0,
        searchText: 'orphan public search',
        lastPublishedAt: before.lastPublishedAt,
      })
      await innerCtx.db.insert('contentAssetRefs', {
        sourceKind: 'public',
        sourceId: `${entryId}:removed-locale`,
        sourceFence: { kind: 'publicRevision', revisionId: before.revisionId },
        assetId: 'orphan-asset',
        fieldPath: 'data.hero',
        locale: 'removed-locale',
        entryId: entryId as never,
        collection: 'posts',
      })
    })

    const { status } = await drainRepair(ctx, owner, 'repair-deleted-derived')
    expect(status).toMatchObject({ state: 'complete', issueCount: 0 })
    expect((status?.deletedOrphans ?? 0) > 0).toBe(true)
    const rebuilt = (await ctx.readAll('publicEntries'))[0]!
    expect(projectionPayload(rebuilt)).toEqual(projectionPayload(before))
    expect((await ctx.readAll('publicSearchEntries')).map(projectionPayload)).toEqual([
      projectionPayload(publicSearchBefore),
    ])
    expect((await ctx.readAll('draftSearchEntries')).map(projectionPayload)).toEqual([
      projectionPayload(draftSearchBefore),
    ])
    expect(await ctx.readAll('contentAssetRefs')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ assetId: 'orphan-asset' })]),
    )
  })

  it('detects and repairs stale draft, revision, and public asset-reference fences exactly', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, {
      bytes: 'asset-fence-bytes',
      type: 'image/png',
    })
    const now = Date.now()
    const assetId = await ctx.seed('assets', {
      storageId: storageId as never,
      filename: 'asset-fence.png',
      mimeType: 'image/png',
      size: 17,
      sha256: 'a'.repeat(64),
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
      createdAt: now,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
    })
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'asset-fence-source',
      shared: { hero: assetId },
      localized: { title: 'Asset fence source' },
      bodyMdc: `![Asset fence](${assetId})`,
    })
    const published = await publishEntry(owner, entryId)
    const checkpointId = await owner.mutation(api.entries.publish.createCheckpoint, {
      entryId,
      message: 'Alternate revision fence',
    })
    expect(checkpointId).not.toBe(published.versionId)

    const canonicalRefs = sortedProjectionPayloads(await ctx.readAll('contentAssetRefs'))
    expect([...new Set(canonicalRefs.map((row) => row.sourceKind))].sort()).toEqual([
      'draft',
      'public',
      'revision',
    ])

    await ctx.raw.run(async (innerCtx) => {
      const checkpointRevisionId = innerCtx.db.normalizeId('entryRevisions', checkpointId)
      const publishedRevisionId = innerCtx.db.normalizeId('entryRevisions', published.versionId)
      if (!checkpointRevisionId || !publishedRevisionId) {
        throw new Error('Expected both canonical revisions.')
      }
      for (const row of await innerCtx.db.query('contentAssetRefs').collect()) {
        if (row.sourceKind === 'draft') {
          await innerCtx.db.patch(row._id, {
            sourceFence: { kind: 'draftVersion', version: -1 },
          })
        } else if (row.sourceKind === 'revision') {
          if (row.sourceFence.kind !== 'revision') {
            throw new Error('Expected a revision source fence.')
          }
          await innerCtx.db.patch(row._id, {
            sourceFence: {
              kind: 'revision',
              revisionId:
                row.sourceFence.revisionId === checkpointRevisionId
                  ? publishedRevisionId
                  : checkpointRevisionId,
              contentHash: 'stale-content-hash',
            },
          })
        } else {
          await innerCtx.db.patch(row._id, {
            sourceFence: { kind: 'publicRevision', revisionId: checkpointRevisionId },
          })
        }
      }
    })

    const detectedKinds = await ctx.raw.run(async (innerCtx) => {
      const kinds = new Set<string>()
      for (const row of await innerCtx.db.query('contentAssetRefs').collect()) {
        const issues = await verifyAssetRefSourceForRow(innerCtx, row)
        if (issues.some((issue) => issue.code === 'asset-ref-drift')) kinds.add(row.sourceKind)
      }
      return [...kinds].sort()
    })
    expect(detectedKinds).toEqual(['draft', 'public', 'revision'])

    const { status } = await drainRepair(ctx, owner, 'repair-stale-asset-fences')
    expect(status).toMatchObject({ state: 'complete', issueCount: 0 })
    expect(sortedProjectionPayloads(await ctx.readAll('contentAssetRefs'))).toEqual(canonicalRefs)

    const [entry] = (await ctx.readAll('entries')).filter((row) => row._id === entryId)
    const [draft] = (await ctx.readAll('entryLocaleDrafts')).filter(
      (row) => row.entryId === entryId && row.locale === 'en',
    )
    const [publicRow] = (await ctx.readAll('publicEntries')).filter(
      (row) => row.entryId === entryId && row.locale === 'en',
    )
    if (!entry || !draft || !publicRow) throw new Error('Expected canonical source rows.')
    const repairedRefs = await ctx.readAll('contentAssetRefs')
    expect(repairedRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: 'draft',
          sourceId: `${entryId}:shared`,
          sourceFence: { kind: 'draftVersion', version: entry.sharedVersion },
        }),
        expect.objectContaining({
          sourceKind: 'draft',
          sourceId: `${entryId}:en`,
          sourceFence: { kind: 'draftVersion', version: draft.version },
        }),
        expect.objectContaining({
          sourceKind: 'public',
          sourceId: `${entryId}:en`,
          sourceFence: { kind: 'publicRevision', revisionId: publicRow.revisionId },
        }),
      ]),
    )
    const revisions = new Map(
      (await ctx.readAll('entryRevisions')).map((revision) => [revision._id, revision]),
    )
    for (const row of repairedRefs.filter((ref) => ref.sourceKind === 'revision')) {
      expect(row.sourceFence.kind).toBe('revision')
      if (row.sourceFence.kind !== 'revision') throw new Error('Expected a revision source fence.')
      expect(row.sourceFence.contentHash).toBe(
        revisions.get(row.sourceFence.revisionId)?.contentHash,
      )
      expect(row.sourceId.startsWith(`${row.sourceFence.revisionId}:`)).toBe(true)
    }
  })

  it('rolls back an injected page crash and resumes from the same durable cursor', async () => {
    const { ctx, owner } = await publishedFixture()
    await owner.createEntry({
      collection: 'posts',
      locale: 'en',
      slug: 'second-repair-row',
      localized: { title: 'Second repair row' },
    })
    const start = await startManualRepair(ctx, owner, 'repair-page-crash')
    await ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, {
      ...repairLease(start),
    })
    const afterFirstPage = await owner.query(
      api.entries.projectionMaintenance.getProjectionRepairRun,
      { runId: start.runId },
    )
    expect(afterFirstPage.cursor).toEqual(expect.any(String))
    expect(JSON.parse(afterFirstPage.cursor)).toMatchObject({
      v: 1,
      kind: 'projectionScan',
      table: 'entries',
      creationTime: expect.any(Number),
      id: expect.any(String),
    })
    await expect(
      ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, {
        ...repairLease(afterFirstPage),
        failurePoint: 'after-work',
      }),
    ).rejects.toThrow('PROJECTION_REPAIR_INJECTED_PAGE_FAILURE')

    const afterFailure = await owner.query(
      api.entries.projectionMaintenance.getProjectionRepairRun,
      { runId: start.runId },
    )
    expect(afterFailure).toMatchObject({
      state: 'running',
      generation: afterFirstPage.generation,
      phase: afterFirstPage.phase,
      cursor: afterFirstPage.cursor,
      processedEntries: 1,
    })
    const { status } = await drainRepair(ctx, owner, start.runId, afterFailure)
    expect(status).toMatchObject({ state: 'complete', issueCount: 0 })
  })

  it('automatically retries a failed page from its exact cursor and fences the stale token', async () => {
    vi.useFakeTimers()
    const { ctx, owner } = await publishedFixture()
    await owner.createEntry({
      collection: 'posts',
      locale: 'en',
      slug: 'second-auto-retry-row',
      localized: { title: 'Second auto retry row' },
    })
    const start = await owner.mutation(api.entries.projectionMaintenance.startProjectionRepairRun, {
      runId: 'repair-auto-page-retry',
      pageSize: 1,
      autoContinue: true,
    })
    await ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, {
      ...repairLease(start),
    })
    const beforeFailure = await owner.query(
      api.entries.projectionMaintenance.getProjectionRepairRun,
      { runId: start.runId },
    )
    expect(beforeFailure).toMatchObject({
      state: 'running',
      phase: 'entries',
      cursor: expect.any(String),
      processedEntries: 1,
      workAttempts: 0,
    })
    const failedLease = repairLease(beforeFailure)
    const failedAt = Date.now()

    await ctx.raw.action(api.entries.projectionMaintenance.runProjectionRepairPage, {
      ...failedLease,
      failurePoint: 'after-work',
    })

    const retrying = await owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, {
      runId: start.runId,
    })
    expect(retrying).toMatchObject({
      state: 'running',
      generation: beforeFailure.generation,
      workGeneration: beforeFailure.workGeneration + 1,
      phase: beforeFailure.phase,
      cursor: beforeFailure.cursor,
      processedEntries: beforeFailure.processedEntries,
      workAttempts: 1,
      workNextAttemptAt: failedAt + 1_000,
      workLastError: 'PROJECTION_REPAIR_INJECTED_PAGE_FAILURE',
      workDeadLetteredAt: null,
    })
    expect(retrying.workToken).not.toBe(failedLease.token)
    await expect(
      ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, failedLease),
    ).resolves.toMatchObject({ status: 'stale', processed: 0 })

    vi.advanceTimersByTime(1_000)
    await ctx.raw.finishInProgressScheduledFunctions()
    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    await expect(
      owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, {
        runId: start.runId,
      }),
    ).resolves.toMatchObject({
      state: 'complete',
      issueCount: 0,
      workAttempts: 0,
      workLastError: null,
    })
  })

  it('automatically retries a failed phase boundary without advancing canonical progress twice', async () => {
    vi.useFakeTimers()
    const { ctx, owner } = await publishedFixture()
    const start = await owner.mutation(api.entries.projectionMaintenance.startProjectionRepairRun, {
      runId: 'repair-auto-phase-retry',
      pageSize: 25,
      autoContinue: true,
    })

    await ctx.raw.action(api.entries.projectionMaintenance.runProjectionRepairPage, {
      ...repairLease(start),
      failurePoint: 'after-work',
    })

    await expect(
      owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, {
        runId: start.runId,
      }),
    ).resolves.toMatchObject({
      state: 'running',
      phase: 'entries',
      cursor: null,
      processedEntries: 0,
      workAttempts: 1,
    })
    vi.advanceTimersByTime(1_000)
    await ctx.raw.finishInProgressScheduledFunctions()
    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    await expect(
      owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, {
        runId: start.runId,
      }),
    ).resolves.toMatchObject({
      state: 'complete',
      issueCount: 0,
      processedEntries: 2,
    })
  })

  it('dead-letters a repeatedly failing page and resumes from the same cursor', async () => {
    const { ctx, owner } = await publishedFixture()
    await owner.createEntry({
      collection: 'posts',
      locale: 'en',
      slug: 'second-dead-letter-row',
      localized: { title: 'Second dead letter row' },
    })
    const start = await startManualRepair(ctx, owner, 'repair-dead-letter')
    await ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, {
      ...repairLease(start),
    })
    const checkpoint = await owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, {
      runId: start.runId,
    })
    expect(checkpoint).toMatchObject({
      state: 'running',
      phase: 'entries',
      cursor: expect.any(String),
      processedEntries: 1,
    })

    let status = checkpoint
    let lastActiveLease = repairLease(status)
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      lastActiveLease = repairLease(status)
      await ctx.raw.action(api.entries.projectionMaintenance.runProjectionRepairPage, {
        ...lastActiveLease,
        failurePoint: 'after-work',
      })
      status = await owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, {
        runId: start.runId,
      })
      expect(status).toMatchObject({
        state: attempt === 3 ? 'dead' : 'running',
        phase: checkpoint.phase,
        cursor: checkpoint.cursor,
        processedEntries: checkpoint.processedEntries,
        workAttempts: attempt,
        workLastError: 'PROJECTION_REPAIR_INJECTED_PAGE_FAILURE',
      })
    }
    expect(status).toMatchObject({
      workToken: null,
      workLeaseExpiresAt: null,
      workNextAttemptAt: null,
      workDeadLetteredAt: expect.any(Number),
    })
    await expect(
      ctx.raw.mutation(
        api.entries.projectionMaintenance.processProjectionRepairPage,
        lastActiveLease,
      ),
    ).resolves.toMatchObject({ status: 'stale', processed: 0 })

    const resumed = await owner.mutation(
      api.entries.projectionMaintenance.resumeProjectionRepairRun,
      { runId: start.runId, autoContinue: false },
    )
    expect(resumed).toMatchObject({
      state: 'running',
      generation: checkpoint.generation + 1,
      phase: checkpoint.phase,
      cursor: checkpoint.cursor,
      processedEntries: checkpoint.processedEntries,
      workToken: expect.any(String),
      workAttempts: 0,
      workNextAttemptAt: null,
      workLastError: null,
      workDeadLetteredAt: null,
    })
    const { status: complete } = await drainRepair(ctx, owner, start.runId, resumed)
    expect(complete).toMatchObject({ state: 'complete', issueCount: 0 })
  })

  it('expires an abandoned lease and rejects its late completion', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-18T08:00:00.000Z') })
    const { ctx, owner } = await publishedFixture()
    const start = await startManualRepair(ctx, owner, 'repair-expired-lease')
    const expiredLease = repairLease(start)
    if (start.workLeaseExpiresAt === null) throw new Error('Expected an active repair lease.')
    vi.setSystemTime(start.workLeaseExpiresAt)

    await ctx.raw.mutation(api.entries.projectionMaintenance.expireProjectionRepairLease, {
      ...expiredLease,
    })

    const retrying = await owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, {
      runId: start.runId,
    })
    expect(retrying).toMatchObject({
      state: 'running',
      generation: start.generation,
      workGeneration: start.workGeneration + 1,
      phase: start.phase,
      cursor: start.cursor,
      workAttempts: 1,
      workNextAttemptAt: Date.now() + 1_000,
      workLastError: 'Projection repair worker lease expired before completion.',
    })
    expect(retrying.workToken).not.toBe(expiredLease.token)
    await expect(
      ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, expiredLease),
    ).resolves.toMatchObject({ status: 'stale', processed: 0 })
  })

  it('makes duplicate delivery a no-op and fences a worker from an older generation', async () => {
    const { ctx, owner } = await publishedFixture()
    const start = await startManualRepair(ctx, owner, 'repair-generation-fence')
    const args = {
      ...repairLease(start),
    }
    await expect(
      ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, args),
    ).resolves.toMatchObject({ status: 'applied', processed: 1 })
    await expect(
      ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, args),
    ).resolves.toMatchObject({ status: 'stale', processed: 0 })

    const beforeResume = await owner.query(
      api.entries.projectionMaintenance.getProjectionRepairRun,
      { runId: start.runId },
    )
    const resumed = await owner.mutation(
      api.entries.projectionMaintenance.resumeProjectionRepairRun,
      { runId: start.runId, autoContinue: false },
    )
    expect(resumed.generation).toBe(start.generation + 1)
    await expect(
      ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, {
        ...repairLease(beforeResume),
      }),
    ).resolves.toMatchObject({ status: 'stale', generation: resumed.generation })

    const { status } = await drainRepair(ctx, owner, start.runId, resumed)
    expect(status).toMatchObject({ state: 'complete', issueCount: 0 })
  })

  it('automatically continues bounded pages to terminal verification', async () => {
    vi.useFakeTimers()
    const { ctx, owner } = await publishedFixture()
    await owner.mutation(api.entries.projectionMaintenance.startProjectionRepairRun, {
      runId: 'repair-auto-continuation',
      pageSize: 1,
      autoContinue: true,
    })
    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    await expect(
      owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, {
        runId: 'repair-auto-continuation',
      }),
    ).resolves.toMatchObject({ state: 'complete', issueCount: 0 })
  })

  it('repairs every row when one commit creates more tied rows than a page can hold', async () => {
    const { ctx, owner } = await publishedFixture()
    const templateEntry = (await ctx.readAll('entries'))[0]!
    const templateDraft = (await ctx.readAll('entryLocaleDrafts'))[0]!
    const templateRevision = (await ctx.readAll('entryRevisions'))[0]!
    const templatePublic = (await ctx.readAll('publicEntries'))[0]!
    const templateSearch = (await ctx.readAll('draftSearchEntries'))[0]!
    const assetId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    vi.useFakeTimers()
    vi.setSystemTime(templateEntry._creationTime + 1_000)
    const inserted = await ctx.raw.run(async (innerCtx) => {
      const entries: string[] = []
      const drafts: string[] = []
      const revisions: string[] = []
      const publicRows: string[] = []
      const publicSearchRows: string[] = []
      const searchRows: string[] = []
      for (let index = 0; index < 4; index += 1) {
        const slug = `tied-repair-${index}`
        const title = `Tied repair ${index}`
        const entryId = await innerCtx.db.insert('entries', {
          collection: templateEntry.collection,
          stableId: `tied-stable-${index}`,
          lifecycle: templateEntry.lifecycle,
          slug,
          parentEntryId: null,
          orderRank: `${index + 2}`,
          nodeKind: templateEntry.nodeKind,
          shared: templateEntry.shared,
          draftVersion: templateEntry.draftVersion,
          sharedVersion: templateEntry.sharedVersion,
          activePublications: [],
          latestEditorialRevisionId: null,
          createdBy: templateEntry.createdBy,
          updatedBy: templateEntry.updatedBy,
          createdAt: templateEntry.createdAt + index + 1,
          updatedAt: templateEntry.updatedAt + index + 1,
        })
        const draftId = await innerCtx.db.insert('entryLocaleDrafts', {
          entryId,
          locale: templateDraft.locale,
          slug,
          values: { ...templateDraft.values, title, inlineAsset: assetId },
          bodyMdc: templateDraft.bodyMdc,
          version: templateDraft.version,
          updatedBy: templateDraft.updatedBy,
          updatedAt: templateDraft.updatedAt + index + 1,
        })
        const revisionId = await innerCtx.db.insert('entryRevisions', {
          entryId,
          collection: templateRevision.collection,
          revisionNumber: templateRevision.revisionNumber,
          operationId: `tied-repair-operation-${index}`,
          parentRevisionId: null,
          kind: templateRevision.kind,
          snapshots: {
            en: {
              ...templateRevision.snapshots.en!,
              shared: templateRevision.snapshots.en!.shared,
              values: {
                ...templateRevision.snapshots.en!.values,
                title,
                inlineAsset: assetId,
              },
              slug,
              parentEntryId: null,
              orderRank: `${index + 2}`,
            },
          },
          affectedLocales: templateRevision.affectedLocales,
          contentHash: templateRevision.contentHash,
          message: templateRevision.message,
          createdBy: templateRevision.createdBy,
          createdAt: templateRevision.createdAt + index + 1,
        })
        await innerCtx.db.patch(entryId, {
          activePublications: templateEntry.activePublications.map((publication) => ({
            ...publication,
            revisionId,
          })),
          latestEditorialRevisionId: revisionId,
        })
        const projectionInput = {
          entryId,
          collection: templatePublic.collection,
          locale: templatePublic.locale,
          revisionId,
          stableId: `tied-stable-${index}`,
          parentEntryId: null,
          orderKey: `${index + 2}`,
          slug,
          title,
          description: templatePublic.description,
          data: { ...templatePublic.data, title },
          searchText: title,
          cacheTags: [],
          assetFacts: [],
          navIncluded: templatePublic.navIncluded,
          sitemapIncluded: templatePublic.sitemapIncluded,
          searchIncluded: true,
          entryCreatedAt: templateEntry.createdAt + index + 1,
          firstPublishedAt: templatePublic.firstPublishedAt,
          lastPublishedAt: templatePublic.lastPublishedAt,
        }
        const publicRowId = await innerCtx.db.insert(
          'publicEntries',
          buildPublicProjectionPayload(projectionInput),
        )
        const publicSearchRowId = await innerCtx.db.insert(
          'publicSearchEntries',
          buildPublicSearchProjectionPayload(projectionInput),
        )
        const searchRowId = await innerCtx.db.insert('draftSearchEntries', {
          entryId,
          collection: templateSearch.collection,
          locale: templateSearch.locale,
          slug,
          title,
          searchText: title,
          lifecycle: templateSearch.lifecycle,
          status: templateSearch.status,
          updatedAt: templateSearch.updatedAt + index + 1,
          sourceDraftVersion: templateSearch.sourceDraftVersion,
          sourceSharedVersion: templateSearch.sourceSharedVersion,
          sourceLocaleVersion: templateSearch.sourceLocaleVersion,
          sourcePublicationHash: templateSearch.sourcePublicationHash,
          hasUnpublishedChanges: templateSearch.hasUnpublishedChanges,
          hasMissingTranslations: templateSearch.hasMissingTranslations,
        })
        entries.push(String(entryId))
        drafts.push(String(draftId))
        revisions.push(String(revisionId))
        publicRows.push(String(publicRowId))
        publicSearchRows.push(String(publicSearchRowId))
        searchRows.push(String(searchRowId))
      }
      return {
        entries,
        drafts,
        revisions,
        publicRows,
        publicSearchRows,
        searchRows,
      }
    })

    const tableRows = {
      entries: (await ctx.readAll('entries')).filter((row) => inserted.entries.includes(row._id)),
      drafts: (await ctx.readAll('entryLocaleDrafts')).filter((row) =>
        inserted.drafts.includes(row._id),
      ),
      revisions: (await ctx.readAll('entryRevisions')).filter((row) =>
        inserted.revisions.includes(row._id),
      ),
      publicRows: (await ctx.readAll('publicEntries')).filter((row) =>
        inserted.publicRows.includes(row._id),
      ),
      publicSearchRows: (await ctx.readAll('publicSearchEntries')).filter((row) =>
        inserted.publicSearchRows.includes(row._id),
      ),
      searchRows: (await ctx.readAll('draftSearchEntries')).filter((row) =>
        inserted.searchRows.includes(row._id),
      ),
    }
    for (const rows of Object.values(tableRows)) {
      expect(rows).toHaveLength(4)
      const creationTimes = rows.map((row) => row._creationTime)
      // convex-test deliberately advances same-commit creation times by 0.001ms;
      // the explicit cursor still carries the _id tie-breaker used by production.
      expect(Math.max(...creationTimes) - Math.min(...creationTimes)).toBeLessThan(1)
    }

    const baseline = await drainRepair(
      ctx,
      owner,
      'repair-tied-baseline',
      await startManualRepair(ctx, owner, 'repair-tied-baseline', 25),
    )
    expect(baseline.status).toMatchObject({ state: 'complete', issueCount: 0 })
    const canonicalPublic = sortedProjectionPayloads(await ctx.readAll('publicEntries'))
    const canonicalPublicSearch = sortedProjectionPayloads(await ctx.readAll('publicSearchEntries'))
    const canonicalSearch = sortedProjectionPayloads(await ctx.readAll('draftSearchEntries'))
    const canonicalRefs = sortedProjectionPayloads(await ctx.readAll('contentAssetRefs'))

    await ctx.raw.run(async (innerCtx) => {
      for (const row of await innerCtx.db.query('publicEntries').collect()) {
        if (inserted.entries.includes(String(row.entryId))) {
          await innerCtx.db.patch(row._id, {
            title: 'corrupt tied public row',
            data: { title: 'corrupt tied public payload' },
          })
        }
      }
      for (const row of await innerCtx.db.query('publicSearchEntries').collect()) {
        if (inserted.entries.includes(String(row.entryId))) {
          await innerCtx.db.patch(row._id, { searchText: 'corrupt tied public search' })
        }
      }
      for (const row of await innerCtx.db.query('draftSearchEntries').collect()) {
        if (inserted.entries.includes(String(row.entryId))) {
          await innerCtx.db.patch(row._id, { title: 'corrupt tied search row' })
        }
      }
      for (const row of await innerCtx.db.query('contentAssetRefs').collect()) {
        if (
          (row.sourceKind === 'draft' &&
            inserted.entries.some((entryId) => row.sourceId === `${entryId}:en`)) ||
          (row.sourceKind === 'revision' &&
            inserted.revisions.some((revisionId) => row.sourceId === `${revisionId}:en`))
        ) {
          await innerCtx.db.delete(row._id)
        }
      }
    })

    const entryCount = (await ctx.readAll('entries')).length
    const draftCount = (await ctx.readAll('entryLocaleDrafts')).length
    const revisionCount = (await ctx.readAll('entryRevisions')).length
    const publicCount = (await ctx.readAll('publicEntries')).length
    const publicSearchCount = (await ctx.readAll('publicSearchEntries')).length
    const searchCount = (await ctx.readAll('draftSearchEntries')).length
    const repaired = await drainRepair(
      ctx,
      owner,
      'repair-tied-regression',
      await startManualRepair(ctx, owner, 'repair-tied-regression', 2),
    )

    expect(repaired.status).toMatchObject({
      state: 'complete',
      issueCount: 0,
      processedEntries: entryCount * 2,
      processedDrafts: draftCount * 2,
      processedRevisions: revisionCount * 2,
      inspectedPublicRows: (publicCount + publicSearchCount) * 2,
      inspectedDraftSearchRows: searchCount * 2,
    })
    expect(sortedProjectionPayloads(await ctx.readAll('publicEntries'))).toEqual(canonicalPublic)
    expect(sortedProjectionPayloads(await ctx.readAll('publicSearchEntries'))).toEqual(
      canonicalPublicSearch,
    )
    expect(sortedProjectionPayloads(await ctx.readAll('draftSearchEntries'))).toEqual(
      canonicalSearch,
    )
    expect(sortedProjectionPayloads(await ctx.readAll('contentAssetRefs'))).toEqual(canonicalRefs)
  })
})
