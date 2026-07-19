/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { stableHash } from '../../packages/convex/src/entries/workflow/hashing'
import { upsertPublicProjection } from '../../packages/convex/src/entries/workflow/projection'
import {
  createCtx,
  installTestContract,
  publishEntry,
  seedMember,
  seedOwner,
  unpublishEntry,
} from './entries/helpers'

const api = anyApi

type TestCtx = ReturnType<typeof createCtx>

type PublicRowSeed = {
  collection?: 'posts' | 'docs' | 'authors'
  locale?: string
  slug: string
  title: string
  searchText?: string
  searchIncluded?: boolean
  changed?: boolean
  updatedAt?: number
}

const SEED_PAGE_SIZE = 25

async function setupSearchContext(options: Parameters<typeof createCtx>[0] = {}) {
  const ctx = createCtx(options)
  await seedOwner(ctx)
  await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
  const { contentHash } = await installTestContract(ctx, ['en'])
  return { ctx, contentHash }
}

/**
 * Seed canonical identities and their rebuildable draft/public projections in
 * bounded pages. Studio search and inventory filters read the fenced draft
 * projection, then verify each row against canonical entry and locale versions.
 */
async function seedPublicRows(ctx: TestCtx, contentHash: string, inputs: PublicRowSeed[]) {
  const ids: string[] = []

  for (let pageStart = 0; pageStart < inputs.length; pageStart += SEED_PAGE_SIZE) {
    const page = inputs.slice(pageStart, pageStart + SEED_PAGE_SIZE)
    const pageIds = await ctx.raw.run(async (innerCtx) => {
      const inserted: string[] = []

      for (const [pageIndex, input] of page.entries()) {
        const index = pageStart + pageIndex
        const now = input.updatedAt ?? 1_700_000_000_000 + index
        const collection = input.collection ?? 'docs'
        const locale = input.locale ?? 'en'
        const stableId = `search-${String(index).padStart(4, '0')}`
        const orderKey = String(index).padStart(8, '0')
        const draftVersion = input.changed ? 2 : 1
        const entryId = await innerCtx.db.insert('entries', {
          collection,
          stableId,
          lifecycle: 'active',
          slug: input.slug,
          parentEntryId: null,
          orderRank: orderKey,
          nodeKind: 'page',
          shared: {},
          draftVersion,
          sharedVersion: 1,
          activePublications: [],
          latestEditorialRevisionId: null,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: now,
          updatedAt: now,
        })
        const revisionId = await innerCtx.db.insert('entryRevisions', {
          entryId,
          collection,
          revisionNumber: 1,
          operationId: `search-seed-${index}`,
          parentRevisionId: null,
          kind: 'publish',
          snapshots: {
            [locale]: {
              shared: {},
              values: { title: input.title },
              bodyMdc: '',
              searchText: input.searchText ?? input.title,
              slug: input.slug,
              parentEntryId: null,
              orderRank: orderKey,
              sharedVersion: 1,
              localeVersion: 1,
            },
          },
          affectedLocales: [locale],
          contentHash,
          message: null,
          createdBy: 'owner-1',
          createdAt: now,
        })
        await innerCtx.db.patch(entryId, {
          activePublications: [
            {
              locale,
              revisionId,
              sharedVersion: 1,
              localeVersion: 1,
              firstPublishedAt: now,
              activatedAt: now,
              activatedBy: 'owner-1',
            },
          ],
          latestEditorialRevisionId: revisionId,
        })
        await innerCtx.db.insert('entryLocaleDrafts', {
          entryId,
          locale,
          slug: input.slug,
          values: { title: input.title },
          bodyMdc: '',
          version: draftVersion,
          updatedBy: 'owner-1',
          updatedAt: now,
        })
        await innerCtx.db.insert('draftSearchEntries', {
          entryId,
          collection,
          locale,
          slug: input.slug,
          title: input.title,
          searchText: input.searchText ?? input.title,
          lifecycle: 'active',
          status: 'published',
          updatedAt: now,
          sourceDraftVersion: draftVersion,
          sourceSharedVersion: 1,
          sourceLocaleVersion: draftVersion,
          sourcePublicationHash: stableHash([
            {
              locale,
              revisionId: String(revisionId),
              sharedVersion: 1,
              localeVersion: 1,
              firstPublishedAt: now,
              activatedAt: now,
            },
          ]),
          hasUnpublishedChanges: input.changed ?? false,
          hasMissingTranslations: false,
        })
        await upsertPublicProjection(innerCtx, {
          entryId,
          collection,
          locale,
          revisionId,
          stableId,
          parentEntryId: null,
          orderKey,
          slug: input.slug,
          title: input.title,
          description: null,
          data: { title: input.title },
          searchText: input.searchText ?? input.title,
          cacheTags: [],
          assetFacts: [],
          navIncluded: true,
          sitemapIncluded: true,
          searchIncluded: input.searchIncluded ?? true,
          entryCreatedAt: now,
          firstPublishedAt: now,
          lastPublishedAt: now,
        })
        inserted.push(String(entryId))
      }

      return inserted
    })
    ids.push(...pageIds)
  }

  return ids
}

describe('collections: searchStudioEntries', () => {
  it('searches authorized drafts, including unpublished public-search opt-outs', async () => {
    const { ctx, contentHash } = await setupSearchContext()
    const ids = await seedPublicRows(ctx, contentHash, [
      { collection: 'docs', slug: 'getting-started', title: 'Getting Started Guide' },
      { collection: 'posts', slug: 'launch', title: 'Launch Guide' },
      { collection: 'authors', slug: 'data-only', title: 'Guide Author' },
      {
        collection: 'docs',
        slug: 'hidden',
        title: 'Hidden Guide',
        searchIncluded: false,
      },
    ])
    const owner = ctx.asCmsUser('owner-1')
    const unpublishedId = await owner.createEntry({
      collection: 'docs',
      slug: 'private-guide',
      localized: { title: 'Private Guide' },
    })

    const results = await ctx
      .asCmsUser('viewer-1')
      .query(api.collections.searchStudioEntries, { query: 'Guide', locale: 'en' })

    expect(results).toEqual(
      expect.arrayContaining([
        {
          id: ids[0],
          title: 'Getting Started Guide',
          collection: 'docs',
          route: { slug: 'getting-started', href: '/docs/getting-started' },
        },
        {
          id: ids[1],
          title: 'Launch Guide',
          collection: 'posts',
          route: { slug: 'launch', href: '/posts/launch' },
        },
        {
          id: ids[3],
          title: 'Hidden Guide',
          collection: 'docs',
          route: { slug: 'hidden', href: '/docs/hidden' },
        },
        {
          id: unpublishedId,
          title: 'Private Guide',
          collection: 'docs',
          route: { slug: 'private-guide', href: '/docs/private-guide' },
        },
      ]),
    )
    expect(results).toHaveLength(4)

    await expect(
      ctx.asCmsUser('viewer-1').query(api.collections.searchStudioEntries, {
        query: 'Guide',
        locale: 'en',
        collection: 'posts',
      }),
    ).resolves.toEqual([
      {
        id: ids[1],
        title: 'Launch Guide',
        collection: 'posts',
        route: { slug: 'launch', href: '/posts/launch' },
      },
    ])

    const viewer = ctx.asCmsUser('viewer-1')
    const listByStatus = async (status: 'draft' | 'published') =>
      await viewer.query(api.editor.listEntriesForStudio, {
        collection: 'docs',
        locale: 'en',
        parentEntryId: null,
        status,
        paginationOpts: { cursor: null, numItems: 25 },
      })
    await expect(listByStatus('draft')).resolves.toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ _id: unpublishedId })]),
    })

    await publishEntry(owner, unpublishedId)
    await expect(listByStatus('published')).resolves.toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ _id: unpublishedId })]),
    })
    await expect(listByStatus('draft')).resolves.toMatchObject({
      page: expect.not.arrayContaining([expect.objectContaining({ _id: unpublishedId })]),
    })

    await unpublishEntry(owner, unpublishedId)
    await expect(listByStatus('draft')).resolves.toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ _id: unpublishedId })]),
    })
  })

  it('returns no results for blank input and rejects anonymous callers', async () => {
    const { ctx, contentHash } = await setupSearchContext()
    await seedPublicRows(ctx, contentHash, [
      { slug: 'getting-started', title: 'Getting Started Guide' },
    ])

    await expect(
      ctx
        .asCmsUser('viewer-1')
        .query(api.collections.searchStudioEntries, { query: '   ', locale: 'en' }),
    ).resolves.toEqual([])
    await expect(
      ctx.raw.query(api.collections.searchStudioEntries, { query: 'Guide', locale: 'en' }),
    ).rejects.toThrow(/Forbidden|Unauthenticated/)
  })

  it('[DOC-06][NAV-04] finds an indexed document after both former 500 and 1,000 row cliffs', async () => {
    const { ctx, contentHash } = await setupSearchContext()
    const rowCount = 1_205
    const targetIndex = 0
    const inputs = Array.from(
      { length: rowCount },
      (_, index): PublicRowSeed => ({
        slug: `record-${String(index).padStart(4, '0')}`,
        changed: index === targetIndex,
        title:
          index === targetIndex
            ? `Catalog record ${index} ultraviolet needle`
            : `Catalog record ${index}`,
      }),
    )
    const ids = await seedPublicRows(ctx, contentHash, inputs)

    const projections = await ctx.readAll('draftSearchEntries')
    expect(projections).toHaveLength(rowCount)
    const targetProjection = projections.find(
      (row: { entryId: string }) => String(row.entryId) === ids[targetIndex],
    )!
    expect(projections.filter((row) => row.updatedAt > targetProjection.updatedAt)).toHaveLength(
      rowCount - 1,
    )

    const viewer = ctx.asCmsUser('viewer-1')
    const deepResult = await viewer.query(api.collections.searchStudioEntries, {
      query: 'ultraviolet',
      locale: 'en',
    })
    expect(deepResult).toEqual([
      {
        id: ids[targetIndex],
        title: `Catalog record ${targetIndex} ultraviolet needle`,
        collection: 'docs',
        route: {
          slug: `record-${String(targetIndex).padStart(4, '0')}`,
          href: `/docs/record-${String(targetIndex).padStart(4, '0')}`,
        },
      },
    ])

    const collectionSearchStartedAt = performance.now()
    const collectionSearch = await viewer.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      parentEntryId: null,
      query: 'ultraviolet',
      paginationOpts: { cursor: null, numItems: 25 },
    })
    expect(performance.now() - collectionSearchStartedAt).toBeLessThan(300)
    expect(collectionSearch).toMatchObject({
      page: [expect.objectContaining({ _id: ids[targetIndex] })],
      isDone: true,
      continueCursor: null,
    })

    const page = await viewer.query(api.collections.searchStudioEntries, {
      query: 'Catalog',
      locale: 'en',
      limit: 25,
    })
    expect(page).toHaveLength(25)
    expect(new Set(page.map((row: { id: string }) => row.id)).size).toBe(page.length)

    const searchedIds: string[] = []
    let searchCursor: string | null = null
    let searchDone = false
    while (!searchDone) {
      const result = await viewer.query(api.editor.listEntriesForStudio, {
        collection: 'docs',
        locale: 'en',
        parentEntryId: null,
        query: 'Catalog',
        paginationOpts: { cursor: searchCursor, numItems: 25 },
      })
      searchedIds.push(...result.page.map((row: { _id: string }) => row._id))
      searchCursor = result.continueCursor
      searchDone = result.isDone
    }
    expect(searchedIds).toHaveLength(rowCount)
    expect(new Set(searchedIds).size).toBe(rowCount)
    expect(searchedIds).toEqual(expect.arrayContaining(ids))

    const filteredIds: string[] = []
    let cursor: string | null = null
    let isDone = false
    while (!isDone) {
      const result = await viewer.query(api.editor.listEntriesForStudio, {
        collection: 'docs',
        locale: 'en',
        parentEntryId: null,
        status: 'published',
        paginationOpts: { cursor, numItems: 100 },
      })
      filteredIds.push(...result.page.map((row: { _id: string }) => row._id))
      cursor = result.continueCursor
      isDone = result.isDone
    }
    expect(filteredIds).toHaveLength(rowCount)
    expect(new Set(filteredIds).size).toBe(rowCount)
    expect(filteredIds).toEqual(expect.arrayContaining(ids))

    const changedIds: string[] = []
    cursor = null
    isDone = false
    const filterStartedAt = performance.now()
    while (!isDone) {
      const result = await viewer.query(api.editor.listEntrySummaries, {
        collection: 'docs',
        locale: 'en',
        workState: 'changed',
        paginationOpts: { cursor, numItems: 100 },
      })
      changedIds.push(...result.page.map((row: { entryId: string }) => row.entryId))
      cursor = result.continueCursor
      isDone = result.isDone
    }
    expect(performance.now() - filterStartedAt).toBeLessThan(300)
    expect(changedIds).toEqual([ids[targetIndex]])
  }, 45_000)

  it('pages equal-timestamp work facets without loss or duplication', async () => {
    const { ctx, contentHash } = await setupSearchContext()
    const rowCount = 73
    const ids = await seedPublicRows(
      ctx,
      contentHash,
      Array.from({ length: rowCount }, (_, index) => ({
        slug: `equal-time-${String(index).padStart(3, '0')}`,
        title: `Equal timestamp ${index}`,
        changed: true,
        updatedAt: 1_800_000_000_000,
      })),
    )
    const viewer = ctx.asCmsUser('viewer-1')
    const seen: string[] = []
    let cursor: string | null = null
    let isDone = false

    while (!isDone) {
      const result = await viewer.query(api.editor.listEntrySummaries, {
        collection: 'docs',
        locale: 'en',
        status: 'published',
        workState: 'changed',
        paginationOpts: { cursor, numItems: 11 },
      })
      seen.push(...result.page.map((row: { entryId: string }) => row.entryId))
      cursor = result.continueCursor
      isDone = result.isDone
    }

    expect(seen).toHaveLength(rowCount)
    expect(new Set(seen).size).toBe(rowCount)
    expect(seen).toEqual(expect.arrayContaining(ids))
  })

  it('refills past a stale first projection page so later canonical rows stay reachable', async () => {
    const { ctx, contentHash } = await setupSearchContext()
    const ids = await seedPublicRows(
      ctx,
      contentHash,
      Array.from({ length: 31 }, (_, index) => ({
        slug: `stale-page-${String(index).padStart(2, '0')}`,
        title: `Stale page ${index}`,
      })),
    )
    const projections = (await ctx.readAll('draftSearchEntries')) as Array<{
      _id: string
      entryId: string
      sourceDraftVersion: number
      updatedAt: number
    }>
    const stale = [...projections]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 20)
    await ctx.raw.run(async (innerCtx) => {
      for (const row of stale) {
        await innerCtx.db.patch(row._id as never, {
          sourceDraftVersion: row.sourceDraftVersion + 1,
        })
      }
    })

    const viewer = ctx.asCmsUser('viewer-1')
    const first = await viewer.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      parentEntryId: null,
      status: 'published',
      paginationOpts: { cursor: null, numItems: 5 },
    })
    expect(first.page).toHaveLength(5)
    expect(first.isDone).toBe(false)

    const seen = first.page.map((row: { _id: string }) => row._id)
    let cursor = first.continueCursor
    let isDone = first.isDone
    while (!isDone) {
      const result = await viewer.query(api.editor.listEntriesForStudio, {
        collection: 'docs',
        locale: 'en',
        parentEntryId: null,
        status: 'published',
        paginationOpts: { cursor, numItems: 5 },
      })
      seen.push(...result.page.map((row: { _id: string }) => row._id))
      cursor = result.continueCursor
      isDone = result.isDone
    }

    const staleIds = new Set(stale.map((row) => String(row.entryId)))
    const expected = ids.filter((id) => !staleIds.has(id))
    expect(seen).toHaveLength(expected.length)
    expect(new Set(seen).size).toBe(expected.length)
    expect(seen).toEqual(expect.arrayContaining(expected))
  })

  it('keeps facet and broad-search pages inside a bounded read budget', async () => {
    const { ctx, contentHash } = await setupSearchContext({
      transactionLimits: { documentsRead: 250 },
    })
    await seedPublicRows(
      ctx,
      contentHash,
      Array.from({ length: 305 }, (_, index) => ({
        slug: `budget-${String(index).padStart(3, '0')}`,
        title: `Budget catalog ${index}`,
        changed: true,
      })),
    )
    const viewer = ctx.asCmsUser('viewer-1')

    await expect(
      viewer.query(api.editor.listEntrySummaries, {
        collection: 'docs',
        locale: 'en',
        workState: 'changed',
        paginationOpts: { cursor: null, numItems: 5 },
      }),
    ).resolves.toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ entryId: expect.any(String) })]),
      isDone: false,
      continueCursor: expect.any(String),
    })

    const firstSearchPage = await viewer.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      parentEntryId: null,
      query: 'Budget',
      paginationOpts: { cursor: null, numItems: 5 },
    })
    await expect(
      viewer.query(api.editor.listEntriesForStudio, {
        collection: 'docs',
        locale: 'en',
        parentEntryId: null,
        query: 'Budget',
        paginationOpts: { cursor: firstSearchPage.continueCursor, numItems: 5 },
      }),
    ).resolves.toMatchObject({ page: expect.any(Array) })
    expect(firstSearchPage).toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ _id: expect.any(String) })]),
      isDone: false,
      continueCursor: expect.any(String),
    })
    await expect(
      viewer.query(api.editor.listEntriesForStudio, {
        collection: 'docs',
        locale: 'en',
        parentEntryId: null,
        query: 'Other',
        paginationOpts: { cursor: firstSearchPage.continueCursor, numItems: 5 },
      }),
    ).rejects.toMatchObject({ data: expect.objectContaining({ code: 'INVALID_CURSOR' }) })
  })
})
