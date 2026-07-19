import { describe, expect, it } from 'vitest'

import {
  setupAssetsPageHandler,
  setupEntriesPageHandler,
  setupMembersHandler,
} from '../../packages/convex/src/liveFixtures'
import {
  cleanupAssetsPageHandler,
  cleanupControlPageHandler,
  cleanupEntriesPageHandler,
} from '../../packages/convex/src/liveFixtures/cleanup'
import { cleanupBootstrapOwnerHandler } from '../../packages/convex/src/liveFixtures/finalize'
import { seedStorageObject } from '../component/entries/helpers'
import { createCtx } from '../helpers'

const prefix = 'refactor-live-abc123'

async function seedContract(ctx: ReturnType<typeof createCtx>) {
  await ctx.seed('cmsContract', {
    key: 'active',
    content: { collections: { docs: { locales: ['en', 'de', 'fr'] } } },
    presentation: { collections: {} },
    contentHash: 'content-hash',
    presentationHash: 'presentation-hash',
    writeGeneration: 1,
    transitionState: 'ready',
    transitionRunId: null,
    installedAt: 1,
    installedBy: prefix,
  })
}

describe('deployment-admin live fixtures', () => {
  it('materializes the exact live target scale in bounded restart-safe pages', async () => {
    const ctx = createCtx({ transactionLimits: true })
    await seedContract(ctx)
    for (let start = 0; start < 1_500; start += 100) {
      await ctx.raw.run((inner) => setupEntriesPageHandler(inner, { prefix, start, count: 100 }))
    }
    expect(await ctx.readAll('entries')).toHaveLength(1_500)
    expect(await ctx.readAll('entryLocaleDrafts')).toHaveLength(4_500)
    expect(await ctx.readAll('entryRevisions')).toHaveLength(1_500)
    expect(await ctx.readAll('draftSearchEntries')).toHaveLength(4_500)
    expect(await ctx.readAll('publicEntries')).toHaveLength(4_500)
    expect(await ctx.readAll('publicSearchEntries')).toHaveLength(4_500)
    while (true) {
      const page = await ctx.raw.run((inner) =>
        cleanupEntriesPageHandler(inner, { prefix, count: 50 }),
      )
      if (page.complete) break
    }
    expect(await ctx.readAll('entries')).toHaveLength(0)
    expect(await ctx.readAll('entryLocaleDrafts')).toHaveLength(0)
    expect(await ctx.readAll('entryRevisions')).toHaveLength(0)
    expect(await ctx.readAll('draftSearchEntries')).toHaveLength(0)
    expect(await ctx.readAll('publicEntries')).toHaveLength(0)
    expect(await ctx.readAll('publicSearchEntries')).toHaveLength(0)
  }, 90_000)

  it('seeds bounded idempotent entry pages with exact derived rows and a depth-five tree', async () => {
    const ctx = createCtx({ transactionLimits: true })
    await seedContract(ctx)

    await expect(
      ctx.raw.run((inner) => setupEntriesPageHandler(inner, { prefix, start: 0, count: 101 })),
    ).rejects.toThrow(/count must be from 1 through 100/i)

    const first = await ctx.raw.run((inner) =>
      setupEntriesPageHandler(inner, { prefix, start: 0, count: 5 }),
    )
    const repeated = await ctx.raw.run((inner) =>
      setupEntriesPageHandler(inner, { prefix, start: 0, count: 5 }),
    )
    expect(first).toMatchObject({ inserted: 5, end: 5, complete: false })
    expect(repeated).toMatchObject({ inserted: 0, end: 5, complete: false })

    const entries = await ctx.readAll('entries')
    const revisions = await ctx.readAll('entryRevisions')
    expect(entries).toHaveLength(5)
    expect(revisions).toHaveLength(5)
    expect(await ctx.readAll('entryLocaleDrafts')).toHaveLength(15)
    const searchRows = await ctx.readAll('draftSearchEntries')
    expect(searchRows).toHaveLength(15)
    expect(await ctx.readAll('publicEntries')).toHaveLength(15)
    expect(await ctx.readAll('publicSearchEntries')).toHaveLength(15)

    const firstEnglishSearch = searchRows.find(
      (row) => row.locale === 'en' && row.slug.endsWith('0001'),
    )!
    expect(firstEnglishSearch.searchText).toContain(`${prefix}-docs-0001`)
    expect(firstEnglishSearch.searchText).toContain(`${prefix} fixture 1`)
    expect(firstEnglishSearch.searchText.split(firstEnglishSearch.title)).toHaveLength(4)

    const byId = new Map(entries.map((entry) => [String(entry._id), entry]))
    let depth = 0
    let cursor = entries.find((entry) => entry.stableId.endsWith('0004'))
    while (cursor) {
      depth += 1
      cursor = cursor.parentEntryId ? byId.get(String(cursor.parentEntryId)) : undefined
    }
    expect(depth).toBe(5)
    const longRevision = revisions.find((revision) => revision.operationId.endsWith('-0'))!
    expect(new TextEncoder().encode(longRevision.snapshots.en!.bodyMdc).byteLength).toBe(65_408)
  })

  it('seeds 500 searchable asset records pagewise without duplicating retries', async () => {
    const ctx = createCtx({ transactionLimits: true })
    const storageIds = await Promise.all(
      Array.from(
        { length: 500 },
        async () => await seedStorageObject(ctx, { bytes: 'x', type: 'image/png' }),
      ),
    )
    for (let start = 0; start < 500; start += 100) {
      await ctx.raw.run((inner) =>
        setupAssetsPageHandler(inner, {
          prefix,
          start,
          count: 100,
          storageIds: storageIds.slice(start, start + 100),
        }),
      )
    }
    const retry = await ctx.raw.run((inner) =>
      setupAssetsPageHandler(inner, {
        prefix,
        start: 400,
        count: 100,
        storageIds: storageIds.slice(400),
      }),
    )
    expect(retry).toMatchObject({ inserted: 0, complete: true })
    expect(await ctx.readAll('assets')).toHaveLength(500)
  })

  it('binds exactly one disposable identity to every role idempotently', async () => {
    const ctx = createCtx()
    const members = ['owner', 'publisher', 'editor', 'viewer'].map((role) => ({
      userId: `${prefix}-${role}`,
      email: `${prefix}-${role}@example.test`,
      role: role as 'owner' | 'publisher' | 'editor' | 'viewer',
    }))
    await ctx.raw.run((inner) => setupMembersHandler(inner, { prefix, members }))
    await ctx.raw.run((inner) => setupMembersHandler(inner, { prefix, members }))
    expect(await ctx.readAll('members')).toHaveLength(4)
    await ctx.raw.run((inner) =>
      cleanupControlPageHandler(inner, { prefix, phase: 'members', count: 100 }),
    )
    expect(await ctx.readAll('members')).toHaveLength(0)
  })

  it('tracks disposable members by the fixture marker when the prefix is not first in the email', async () => {
    const ctx = createCtx()
    const members = ['owner', 'publisher', 'editor', 'viewer'].map((role) => ({
      userId: `${prefix}-${role}`,
      email: `${role}-${prefix}@example.test`,
      role: role as 'owner' | 'publisher' | 'editor' | 'viewer',
    }))
    await ctx.raw.run((inner) => setupMembersHandler(inner, { prefix, members }))
    await ctx.raw.run((inner) =>
      cleanupControlPageHandler(inner, { prefix, phase: 'members', count: 100 }),
    )
    expect(await ctx.readAll('members')).toHaveLength(0)
  })

  it('removes only the configured bootstrap owner while a disposable owner remains', async () => {
    const ctx = createCtx()
    await ctx.seed('members', {
      userId: 'bootstrap-user',
      email: 'bootstrap@example.test',
      displayName: 'Bootstrap',
      role: 'owner',
      createdAt: 1,
      updatedAt: null,
      updatedBy: null,
    })
    await ctx.seed('members', {
      userId: `${prefix}-owner`,
      email: `${prefix}-owner@example.test`,
      displayName: 'Fixture owner',
      role: 'owner',
      createdAt: 2,
      updatedAt: null,
      updatedBy: prefix,
    })
    expect(
      await ctx.raw.run((inner) =>
        cleanupBootstrapOwnerHandler(inner, {
          prefix,
          configuredOwnerEmail: 'BOOTSTRAP@example.test',
        }),
      ),
    ).toMatchObject({ deleted: 1 })
    expect((await ctx.readAll('members')).map(({ email }) => email)).toEqual([
      `${prefix}-owner@example.test`,
    ])
  })

  it('removes canonical and derived fixture rows in bounded idempotent pages', async () => {
    const ctx = createCtx({ transactionLimits: true })
    await seedContract(ctx)
    await ctx.raw.run((inner) => setupEntriesPageHandler(inner, { prefix, start: 0, count: 5 }))
    const storageIds = await Promise.all(
      Array.from(
        { length: 5 },
        async () => await seedStorageObject(ctx, { bytes: 'x', type: 'image/png' }),
      ),
    )
    await ctx.raw.run((inner) =>
      setupAssetsPageHandler(inner, { prefix, start: 0, count: 5, storageIds }),
    )

    const entryCleanup = await ctx.raw.run((inner) =>
      cleanupEntriesPageHandler(inner, { prefix, count: 25 }),
    )
    const entryRetry = await ctx.raw.run((inner) =>
      cleanupEntriesPageHandler(inner, { prefix, count: 25 }),
    )
    const assetCleanup = await ctx.raw.run((inner) =>
      cleanupAssetsPageHandler(inner, { prefix, count: 100 }),
    )
    expect(entryCleanup).toMatchObject({ deleted: 5, complete: false })
    expect(entryRetry).toMatchObject({ deleted: 0, complete: true })
    expect(assetCleanup.deleted).toBe(5)
    expect(new Set(assetCleanup.storageIds)).toEqual(new Set(storageIds.map(String)))
    expect(await ctx.readAll('entries')).toHaveLength(0)
    expect(await ctx.readAll('entryLocaleDrafts')).toHaveLength(0)
    expect(await ctx.readAll('entryRevisions')).toHaveLength(0)
    expect(await ctx.readAll('draftSearchEntries')).toHaveLength(0)
    expect(await ctx.readAll('publicEntries')).toHaveLength(0)
    expect(await ctx.readAll('publicSearchEntries')).toHaveLength(0)
    expect(await ctx.readAll('assets')).toHaveLength(0)
  })
})
