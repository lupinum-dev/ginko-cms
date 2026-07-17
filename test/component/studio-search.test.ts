/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, installTestContract, seedMember, seedOwner } from './entries/helpers'

const api = anyApi

type TestCtx = ReturnType<typeof createCtx>

type PublicRowSeed = {
  collection?: 'posts' | 'docs' | 'authors'
  locale?: string
  slug: string
  title: string
  searchText?: string
  searchIncluded?: boolean
}

const SEED_PAGE_SIZE = 200

async function setupSearchContext() {
  const ctx = createCtx()
  await seedOwner(ctx)
  await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
  const { contentHash } = await installTestContract(ctx, ['en'])
  return { ctx, contentHash }
}

/**
 * Seed canonical identities and their rebuildable public projections in
 * bounded pages. Search itself reads only cmsContract and publicEntries.
 */
async function seedPublicRows(ctx: TestCtx, contentHash: string, inputs: PublicRowSeed[]) {
  const ids: string[] = []

  for (let pageStart = 0; pageStart < inputs.length; pageStart += SEED_PAGE_SIZE) {
    const page = inputs.slice(pageStart, pageStart + SEED_PAGE_SIZE)
    const pageIds = await ctx.raw.run(async (innerCtx) => {
      const inserted: string[] = []

      for (const [pageIndex, input] of page.entries()) {
        const index = pageStart + pageIndex
        const now = 1_700_000_000_000 + index
        const collection = input.collection ?? 'docs'
        const locale = input.locale ?? 'en'
        const stableId = `search-${String(index).padStart(4, '0')}`
        const orderKey = String(index).padStart(8, '0')
        const entryId = await innerCtx.db.insert('entries', {
          collection,
          stableId,
          lifecycle: 'active',
          slug: input.slug,
          parentEntryId: null,
          orderRank: orderKey,
          nodeKind: 'page',
          shared: {},
          draftVersion: 1,
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
              activatedAt: now,
              activatedBy: 'owner-1',
            },
          ],
          latestEditorialRevisionId: revisionId,
        })
        await innerCtx.db.insert('publicEntries', {
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
          bodyMdc: '',
          searchText: input.searchText ?? input.title,
          cacheTags: [],
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
  it('searches installed route-backed collections and honors projection visibility', async () => {
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
      ]),
    )
    expect(results).toHaveLength(2)
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

  it('finds an indexed result inserted after both former 500 and 1,000 row cliffs', async () => {
    const { ctx, contentHash } = await setupSearchContext()
    const rowCount = 1_205
    const targetIndex = rowCount - 1
    const inputs = Array.from(
      { length: rowCount },
      (_, index): PublicRowSeed => ({
        slug: `record-${String(index).padStart(4, '0')}`,
        title:
          index === targetIndex
            ? `Catalog record ${index} ultraviolet needle`
            : `Catalog record ${index}`,
      }),
    )
    const ids = await seedPublicRows(ctx, contentHash, inputs)

    const projections = await ctx.readAll('publicEntries')
    expect(projections).toHaveLength(rowCount)
    expect(
      projections.findIndex((row: { entryId: string }) => String(row.entryId) === ids[targetIndex]),
    ).toBeGreaterThan(1_000)

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

    const page = await viewer.query(api.collections.searchStudioEntries, {
      query: 'Catalog',
      locale: 'en',
      limit: 25,
    })
    expect(page).toHaveLength(25)
    expect(new Set(page.map((row: { id: string }) => row.id)).size).toBe(page.length)
  })
})
