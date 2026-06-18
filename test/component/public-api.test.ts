/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  publishEntry,
  seedOwner,
  seedSettings,
  seedTreeFixture,
  seedMultiLocaleSettings,
  seedStorageObject,
} from './entries/helpers'

const api = anyApi

// ---------------------------------------------------------------------------
// Helper: create a flat collection, seed N entries, publish them all
// ---------------------------------------------------------------------------
async function seedPublishedEntries(
  ctx: ReturnType<typeof createCtx>,
  count: number,
  options?: {
    collectionSlug?: string
    pathPrefix?: string
    routingMode?: 'route' | 'none'
    slugMode?: 'shared' | 'stable'
    fields?: Array<Record<string, unknown>>
  },
) {
  const now = Date.now()
  const slug = options?.collectionSlug ?? 'articles'
  const pathPrefix = options?.pathPrefix ?? `/${slug}`
  const slugMode = options?.slugMode ?? 'shared'

  await ctx.seed(
    'collections' as never,
    {
      slug,
      label: { en: slug.charAt(0).toUpperCase() + slug.slice(1) },
      icon: null,
      type: 'flat',
      routing: {
        mode: options?.routingMode ?? 'route',
        pathPrefix,
        slugMode,
        rootSlug: null,
        singleton: false,
      },
      locales: ['en'],
      fields: options?.fields ?? [
        { key: 'title', type: 'text', localized: true, searchable: true },
      ],
      settings: {},
      createdAt: now,
      updatedAt: now,
      updatedBy: 'owner-1',
    } as never,
  )

  const owner = ctx.asCmsUser('owner-1')
  const entryIds: string[] = []

  for (let i = 0; i < count; i++) {
    const entrySlug = `entry-${String(i + 1).padStart(2, '0')}`
    const title = `Entry ${String.fromCharCode(65 + i)}` // Entry A, Entry B, ...
    const entryId = await owner.createEntry({
      collection: slug,
      slug: entrySlug,
      localized: { title },
    })
    entryIds.push(entryId)
  }

  // Publish all
  for (const entryId of entryIds) {
    await publishEntry(owner, entryId)
  }

  return { entryIds }
}

function nestedBodyAst(depth: number): Record<string, unknown> {
  let child: Record<string, unknown> = { type: 'text', value: 'Deep body text' }
  for (let index = 0; index < depth; index += 1) {
    child = {
      type: 'element',
      tag: 'div',
      props: { depth: index },
      children: [child],
    }
  }
  return {
    type: 'root',
    children: [child],
  }
}

describe('public API: asset metadata fallbacks', () => {
  it('uses localized asset alt/caption when image field overrides are empty', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'posts',
        label: { en: 'Posts' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/posts',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', localized: true, searchable: true },
          {
            key: 'image',
            type: 'object',
            localized: false,
            fields: [
              { key: 'src', type: 'image' },
              { key: 'alt', type: 'text' },
              { key: 'caption', type: 'text' },
            ],
          },
        ],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )
    const storageId = await seedStorageObject(ctx, { bytes: 'nuxt', type: 'image/png' })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'nuxt.png',
        mimeType: 'image/png',
        size: 1024,
        width: 800,
        height: 600,
        alt: { en: 'Localized asset alt' },
        caption: { en: 'Localized asset caption' },
        scope: 'collection',
        entryId: null,
        collectionId,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'asset-alt',
      localized: { title: 'Asset alt' },
      shared: { image: { src: assetId, alt: '', caption: '' } },
    })
    await publishEntry(owner, entryId)

    const page = await ctx.raw.query(api.public.page, {
      collection: 'posts',
      locale: 'en',
      path: '/posts/asset-alt',
    })

    expect(page.page?.data.image).toMatchObject({
      src: assetId,
      alt: 'Localized asset alt',
      caption: 'Localized asset caption',
    })
  })

  it('keeps explicit image field alt/caption overrides', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'posts',
        label: { en: 'Posts' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/posts',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', localized: true, searchable: true },
          {
            key: 'image',
            type: 'object',
            localized: false,
            fields: [
              { key: 'src', type: 'image' },
              { key: 'alt', type: 'text' },
              { key: 'caption', type: 'text' },
            ],
          },
        ],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )
    const storageId = await seedStorageObject(ctx, { bytes: 'override', type: 'image/png' })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'override.png',
        mimeType: 'image/png',
        size: 1024,
        width: 800,
        height: 600,
        alt: { en: 'Localized asset alt' },
        caption: { en: 'Localized asset caption' },
        scope: 'collection',
        entryId: null,
        collectionId,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'asset-override',
      localized: { title: 'Asset override' },
      shared: {
        image: {
          src: assetId,
          alt: 'Explicit hero alt',
          caption: 'Explicit hero caption',
        },
      },
    })
    await publishEntry(owner, entryId)

    const page = await ctx.raw.query(api.public.page, {
      collection: 'posts',
      locale: 'en',
      path: '/posts/asset-override',
    })

    expect(page.page?.data.image).toMatchObject({
      src: assetId,
      alt: 'Explicit hero alt',
      caption: 'Explicit hero caption',
    })
  })
})

// ---------------------------------------------------------------------------
// Pagination + filtering
// ---------------------------------------------------------------------------
describe('public API: list pagination', () => {
  it('paginates with the locked public pageInfo shape', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 5)

    // First page: limit=2
    const page1 = await ctx.raw.query(api.public.list, {
      collection: 'articles',
      locale: 'en',
      limit: 2,
      cursor: null,
    })

    expect(page1.entries).toHaveLength(2)
    expect(page1.pageInfo.hasNextPage).toBe(true)
    expect(page1.pageInfo.endCursor).toBeTruthy()
    expect(page1.entries[0].bodyAst).toMatchObject({
      type: 'root',
    })

    // Second page using cursor
    const page2 = await ctx.raw.query(api.public.list, {
      collection: 'articles',
      locale: 'en',
      limit: 2,
      cursor: page1.pageInfo.endCursor,
    })

    expect(page2.entries).toHaveLength(2)
    expect(page2.pageInfo.hasNextPage).toBe(true)
    expect(page2.pageInfo.endCursor).toBeTruthy()

    // Third page — should have 1 remaining
    const page3 = await ctx.raw.query(api.public.list, {
      collection: 'articles',
      locale: 'en',
      limit: 2,
      cursor: page2.pageInfo.endCursor,
    })

    expect(page3.entries).toHaveLength(1)
    expect(page3.pageInfo.hasNextPage).toBe(false)
    expect(page3.pageInfo.endCursor).toBeNull()

    // No duplicate IDs across pages
    const allIds = [
      ...page1.entries.map((i) => i.id),
      ...page2.entries.map((i) => i.id),
      ...page3.entries.map((i) => i.id),
    ]
    expect(new Set(allIds).size).toBe(5)
  })

  it('serves deeply nested public body ASTs without leaking body payloads into navigation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryIds } = await seedPublishedEntries(ctx, 1)
    const deepBodyAst = nestedBodyAst(18)

    await ctx.raw.run(async (innerCtx) => {
      const publicRow = await innerCtx.db
        .query('publicEntries')
        .filter((q) => q.eq(q.field('entryId'), entryIds[0]))
        .unique()
      if (!publicRow) throw new Error('Expected a public entry row.')
      await innerCtx.db.patch(publicRow._id, {
        bodyAst: JSON.stringify(deepBodyAst),
      })
    })

    const page = await ctx.raw.query(api.public.page, {
      collection: 'articles',
      locale: 'en',
      path: '/articles/entry-01',
    })
    const list = await ctx.raw.query(api.public.list, {
      collection: 'articles',
      locale: 'en',
      limit: 10,
      cursor: null,
    })
    const nav = await ctx.raw.query(api.public.nav, {
      collection: 'articles',
      locale: 'en',
    })

    expect(page.page?.bodyAst).toEqual(deepBodyAst)
    expect(list.entries[0]?.bodyAst).toEqual(deepBodyAst)
    expect(nav.tree[0]?.entry).not.toHaveProperty('bodyAst')
  })

  it('returns all items with isDone=true when page size exceeds total', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 3)

    const result = await ctx.raw.query(api.public.list, {
      collection: 'articles',
      locale: 'en',
      limit: 50,
      cursor: null,
    })

    expect(result.entries).toHaveLength(3)
    expect(result.pageInfo.hasNextPage).toBe(false)
    expect(result.pageInfo.endCursor).toBeNull()
  })

  it('does not skip entries when sorted rows share the same timestamp', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 5)

    await ctx.raw.run(async (innerCtx) => {
      const rows = await innerCtx.db.query('publicEntries').collect()
      await Promise.all(rows.map((row) => innerCtx.db.patch(row._id, { lastPublishedAt: 123 })))
    })

    const seen = new Set<string>()
    let cursor: string | null = null
    do {
      const page = await ctx.raw.query(api.public.list, {
        collection: 'articles',
        locale: 'en',
        sort: 'lastPublishedAt:desc',
        limit: 2,
        cursor,
      })
      for (const entry of page.entries) {
        seen.add(entry.id)
      }
      cursor = page.pageInfo.endCursor
    } while (cursor)

    expect(seen.size).toBe(5)
  })

  it('filters public list rows by indexed path prefix', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 3)

    const result = await ctx.raw.query(api.public.list, {
      collection: 'articles',
      locale: 'en',
      limit: 10,
      cursor: null,
      pathPrefix: '/articles/entry-0',
    })

    expect(result.entries.map((entry) => entry.route.path)).toEqual([
      '/articles/entry-01',
      '/articles/entry-02',
      '/articles/entry-03',
    ])
    expect(result.pageInfo.hasNextPage).toBe(false)
  })

  it('rejects path as an explicit public list sort field', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 1)

    await expect(() =>
      ctx.raw.query(api.public.list, {
        collection: 'articles',
        locale: 'en',
        limit: 10,
        cursor: null,
        sort: 'path:asc',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'INVALID_SORT'
    })
  })

  it('serves route-backed published entries through route public surfaces', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 1, { collectionSlug: 'articles' })

    const page = await ctx.raw.query(api.public.page, {
      collection: 'articles',
      locale: 'en',
      path: '/articles/entry-01',
    })
    const routeMeta = await ctx.raw.query(api.public.routeMeta, {
      collection: 'articles',
      locale: 'en',
      path: '/articles/entry-01',
    })
    const list = await ctx.raw.query(api.public.list, {
      collection: 'articles',
      locale: 'en',
      limit: 10,
      cursor: null,
    })
    const search = await ctx.raw.query(api.public.search, {
      collection: 'articles',
      locale: 'en',
      query: 'Entry',
    })
    const nav = await ctx.raw.query(api.public.nav, {
      collection: 'articles',
      locale: 'en',
    })
    const sitemap = await ctx.raw.query(api.public.sitemap, {
      collection: 'articles',
      locale: 'en',
    })

    expect(page.status).toBe('found')
    expect(routeMeta.status).toBe('found')
    expect(routeMeta.page?.data).toEqual({})
    expect(list.entries).toHaveLength(1)
    expect(search.results).toHaveLength(1)
    expect(nav.tree).toHaveLength(1)
    expect(nav.tree[0]?.entry).not.toHaveProperty('bodyAst')
    expect(nav.tree[0]?.entry).not.toHaveProperty('toc')
    expect(sitemap.urls).toHaveLength(1)
  })

  it('projects non-index root slugs to localized collection mounts across public surfaces', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'docs',
        label: { en: 'Docs', de: 'Dokumentation' },
        icon: null,
        type: 'tree',
        routing: {
          mode: 'route',
          pathPrefix: '/docs',
          slugMode: 'localized',
          rootSlug: 'workflows',
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {
          localizedPathPrefixes: {
            de: '/dokumentation',
          },
          localizedRootSlugs: {
            de: 'arbeitsablaeufe',
          },
        },
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'docs',
      slug: 'workflows',
      localized: { title: 'Workflows' },
      locale: 'en',
    })
    await owner.mutation(api.editor.createLocaleVariant, { entryId, locale: 'de' })
    const deEntry = await owner.query(api.editor.getEntry, { id: entryId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: deEntry.draftVersion,
      patch: {
        locales: {
          de: {
            slug: 'arbeitsablaeufe',
            values: { title: 'Arbeitsablaeufe' },
          },
        },
      },
    })
    await publishEntry(owner, entryId, ['en', 'de'])

    const publicEntries = await ctx.readAll('publicEntries')
    const publicRoutes = await ctx.readAll('publicRoutes')
    for (const table of [publicEntries, publicRoutes]) {
      expect(table).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ locale: 'en', path: '/docs', href: '/docs' }),
          expect.objectContaining({
            locale: 'de',
            path: '/dokumentation',
            href: '/de/dokumentation',
          }),
        ]),
      )
      expect(table).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/docs/workflows' }),
          expect.objectContaining({ path: '/dokumentation/arbeitsablaeufe' }),
        ]),
      )
    }

    const page = await ctx.raw.query(api.public.page, {
      collection: 'docs',
      locale: 'de',
      path: '/dokumentation',
    })
    const list = await ctx.raw.query(api.public.list, {
      collection: 'docs',
      locale: 'de',
      limit: 10,
      cursor: null,
    })
    const search = await ctx.raw.query(api.public.search, {
      collection: 'docs',
      locale: 'de',
      query: 'Arbeitsablaeufe',
    })
    const nav = await ctx.raw.query(api.public.nav, {
      collection: 'docs',
      locale: 'de',
    })
    const sitemap = await ctx.raw.query(api.public.sitemap, {
      collection: 'docs',
      locale: 'de',
    })

    expect(page.status).toBe('found')
    expect(page.page?.route).toMatchObject({
      path: '/dokumentation',
      href: '/de/dokumentation',
    })
    expect(list.entries.map((entry) => entry.route.path)).toEqual(['/dokumentation'])
    expect(search.results.map((entry) => entry.route.path)).toEqual(['/dokumentation'])
    expect(nav.tree.map((node) => node.entry.route.path)).toEqual(['/dokumentation'])
    expect(sitemap.urls.map((url) => url.route.path)).toEqual(['/dokumentation'])
  })

  it('lists data-only published entries without creating public route rows', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 2, {
      collectionSlug: 'settings',
      pathPrefix: '',
      routingMode: 'none',
    })

    const result = await ctx.raw.query(api.public.list, {
      collection: 'settings',
      locale: 'en',
      limit: 10,
      cursor: null,
    })

    expect(result.entries.map((entry) => entry.title)).toEqual(['Entry A', 'Entry B'])
    expect(await ctx.readAll('publicRoutes')).toEqual([])
  })

  it('rejects route-only public reads for data-only collections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 1, {
      collectionSlug: 'settings',
      pathPrefix: '',
      routingMode: 'none',
    })

    const expectDataOnlyRejection = async (read: Promise<unknown>) => {
      await expect(read).rejects.toSatisfy((error: unknown) => {
        return getCmsErrorData(error)?.code === 'DATA_ONLY_COLLECTION'
      })
    }

    await expectDataOnlyRejection(
      ctx.raw.query(api.public.page, {
        collection: 'settings',
        locale: 'en',
        path: '/entry-01',
      }),
    )
    await expectDataOnlyRejection(
      ctx.raw.query(api.public.routeMeta, {
        collection: 'settings',
        locale: 'en',
        path: '/entry-01',
      }),
    )
    await expectDataOnlyRejection(
      ctx.raw.query(api.public.nav, {
        collection: 'settings',
        locale: 'en',
      }),
    )
    await expectDataOnlyRejection(
      ctx.raw.query(api.public.surround, {
        collection: 'settings',
        locale: 'en',
        path: '/entry-01',
      }),
    )
    await expectDataOnlyRejection(
      ctx.raw.query(api.public.search, {
        collection: 'settings',
        locale: 'en',
        query: 'Entry',
      }),
    )
    await expectDataOnlyRejection(
      ctx.raw.query(api.public.sitemap, {
        collection: 'settings',
        locale: 'en',
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Search pagination
// ---------------------------------------------------------------------------
describe('public API: search pagination', () => {
  it('excludes entries opted out of public search from search surfaces', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 0)
    const owner = ctx.asCmsUser('owner-1')

    const entryId = await owner.createEntry({
      collection: 'articles',
      slug: 'private-search',
      localized: {
        title: 'Private Search',
      },
    })
    await publishEntry(owner, entryId)
    await ctx.raw.run(async (innerCtx) => {
      const row = await innerCtx.db
        .query('publicEntries')
        .filter((q) => q.eq(q.field('entryId'), entryId as never))
        .first()
      if (!row) throw new Error('Expected published row')
      await innerCtx.db.patch(row._id, { searchIncluded: false })
    })
    expect(await ctx.readAll('publicEntries')).toEqual([
      expect.objectContaining({ searchIncluded: false }),
    ])

    const search = await ctx.raw.query(api.public.search, {
      query: 'Private',
      collection: 'articles',
      locale: 'en',
      limit: 10,
      cursor: null,
    })

    expect(search.results).toHaveLength(0)
  })

  it('paginates search results with the locked pageInfo shape', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 5)

    const page1 = await ctx.raw.query(api.public.search, {
      query: 'Entry',
      locale: 'en',
      collection: 'articles',
      limit: 2,
      cursor: null,
    })

    expect(page1.results).toHaveLength(2)
    expect(page1.pageInfo.hasNextPage).toBe(true)
    expect(page1.pageInfo.endCursor).toBeTruthy()

    const page2 = await ctx.raw.query(api.public.search, {
      query: 'Entry',
      locale: 'en',
      collection: 'articles',
      limit: 2,
      cursor: page1.pageInfo.endCursor,
    })

    expect(page2.results).toHaveLength(2)
    expect(page2.pageInfo.hasNextPage).toBe(true)
    expect(page2.pageInfo.endCursor).toBeTruthy()

    const page3 = await ctx.raw.query(api.public.search, {
      query: 'Entry',
      locale: 'en',
      collection: 'articles',
      limit: 2,
      cursor: page2.pageInfo.endCursor,
    })

    expect(page3.results).toHaveLength(1)
    expect(page3.pageInfo.hasNextPage).toBe(false)
    expect(page3.pageInfo.endCursor).toBeNull()

    const ids = [
      ...page1.results.map((entry) => entry.id),
      ...page2.results.map((entry) => entry.id),
      ...page3.results.map((entry) => entry.id),
    ]
    expect(new Set(ids).size).toBe(5)
  })

  it('rejects invalid search cursors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 1)

    await expect(() =>
      ctx.raw.query(api.public.search, {
        query: 'Entry',
        locale: 'en',
        collection: 'articles',
        limit: 2,
        cursor: 'bad-cursor',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'INVALID_CURSOR'
    })
  })

  it('rejects oversized public search inputs before querying', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    await expect(() =>
      ctx.raw.query(api.public.search, {
        query: 'x'.repeat(257),
        locale: 'en',
        collection: 'articles',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'INVALID_QUERY'
    })

    await expect(() =>
      ctx.raw.query(api.public.search, {
        query: 'Entry',
        locale: 'en',
        collection: 'x'.repeat(81),
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'INVALID_QUERY'
    })
  })
})

describe('public API: list projection', () => {
  it('keeps relation fields as stable ids in page and list responses', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'authors',
        label: { en: 'Authors' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/authors',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [
          { key: 'name', type: 'text', searchable: true, fields: [] },
          { key: 'bio', type: 'textarea', searchable: true, fields: [] },
          {
            key: 'manager',
            type: 'relation',
            relation: { collectionId: 'authors' },
            fields: [],
          },
        ],
        settings: { titleField: 'name' },
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )
    await ctx.seed(
      'collections' as never,
      {
        slug: 'blog',
        label: { en: 'Blog' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/blog',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [
          {
            key: 'title',
            type: 'text',
            localized: true,
            searchable: true,
            fields: [],
          },
          {
            key: 'author',
            type: 'relation',
            relation: { collectionId: 'authors' },
            fields: [],
          },
          {
            key: 'coauthors',
            type: 'relations',
            relation: { collectionId: 'authors' },
            fields: [],
          },
          {
            key: 'seo',
            type: 'object',
            fields: [
              {
                key: 'reviewer',
                type: 'relation',
                relation: { collectionId: 'authors' },
                fields: [],
              },
            ],
          },
          {
            key: 'contributors',
            type: 'array',
            fields: [
              {
                key: 'person',
                type: 'relation',
                relation: { collectionId: 'authors' },
                fields: [],
              },
            ],
          },
          {
            key: 'content',
            type: 'blocks',
            fields: [
              {
                key: 'quote',
                type: 'object',
                fields: [
                  {
                    key: 'speaker',
                    type: 'relation',
                    relation: { collectionId: 'authors' },
                    fields: [],
                  },
                ],
              },
            ],
          },
        ],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const managerId = await owner.createEntry({
      collection: 'authors',
      slug: 'grace-hopper',
      shared: {
        name: 'Grace Hopper',
        bio: 'Pioneer',
      },
    })
    const manager = await owner.query(api.editor.getEntry, {
      id: managerId,
      locale: 'en',
    })

    const authorId = await owner.createEntry({
      collection: 'authors',
      slug: 'ada-lovelace',
      shared: {
        name: 'Ada Lovelace',
        bio: 'First programmer',
        manager: manager?.stableId,
      },
    })
    const author = await owner.query(api.editor.getEntry, {
      id: authorId,
      locale: 'en',
    })

    const postId = await owner.createEntry({
      collection: 'blog',
      slug: 'intro',
      localized: { title: 'Intro' },
      shared: {
        author: author?.stableId,
        coauthors: [author?.stableId, manager?.stableId],
        seo: { reviewer: manager?.stableId },
        contributors: [{ person: author?.stableId }, { person: manager?.stableId }],
        content: [
          { type: 'quote', data: { speaker: manager?.stableId } },
          { type: 'quote', data: { speaker: author?.stableId } },
        ],
      },
    })

    await publishEntry(owner, managerId)
    await publishEntry(owner, authorId)
    await publishEntry(owner, postId)

    const page = await ctx.raw.query(api.public.page, {
      collection: 'blog',
      locale: 'en',
      path: '/blog/intro',
    })
    const list = await ctx.raw.query(api.public.list, {
      collection: 'blog',
      locale: 'en',
      limit: 10,
      cursor: null,
    })

    expect(page.status).toBe('found')
    expect(page.page?.data.author).toBe(author?.stableId)
    expect(list.entries[0]?.data.author).toBe(author?.stableId)

    const publicEntries = await ctx.readAll('publicEntries')
    const publicPost = publicEntries.find((entry) => String(entry.entryId) === postId)
    expect(publicPost?.cacheTags).toEqual(
      expect.arrayContaining([
        `entry:authors:${author?.stableId}`,
        `entry:authors:${author?.stableId}:en`,
        `entry:authors:${manager?.stableId}`,
        `entry:authors:${manager?.stableId}:en`,
      ]),
    )
  })

  it('stores asset cache tags on public projections that render asset fields', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'gallery',
        label: { en: 'Gallery' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/gallery',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', localized: true, searchable: true, fields: [] },
          { key: 'hero', type: 'image', fields: [] },
          { key: 'attachments', type: 'images', fields: [] },
        ],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )
    const heroStorageId = await seedStorageObject(ctx, { bytes: 'hero', type: 'image/png' })
    const heroAssetId = await ctx.seed(
      'assets' as never,
      {
        storageId: heroStorageId,
        filename: 'hero.png',
        mimeType: 'image/png',
        size: 9000,
        width: 1200,
        height: 630,
        alt: null,
        caption: null,
        scope: 'collection',
        entryId: null,
        collectionId,
        tags: ['hero'],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )
    const galleryStorageId = await seedStorageObject(ctx, { bytes: 'detail', type: 'image/png' })
    const galleryAssetId = await ctx.seed(
      'assets' as never,
      {
        storageId: galleryStorageId,
        filename: 'detail.png',
        mimeType: 'image/png',
        size: 4000,
        width: 800,
        height: 600,
        alt: null,
        caption: null,
        scope: 'collection',
        entryId: null,
        collectionId,
        tags: ['detail'],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'gallery',
      slug: 'launch',
      localized: { title: 'Launch' },
      shared: {
        hero: heroAssetId,
        attachments: [galleryAssetId],
      },
    })

    await publishEntry(owner, entryId)

    const publicEntries = await ctx.readAll('publicEntries')
    const publicEntry = publicEntries.find((entry) => String(entry.entryId) === entryId)
    expect(publicEntry?.cacheTags).toEqual(
      expect.arrayContaining([`asset:${heroAssetId}`, `asset:${galleryAssetId}`]),
    )

    await owner.mutation(api.assets.updateAsset, {
      assetId: heroAssetId,
      alt: { en: 'Updated after publish' },
      caption: { en: 'Republish required' },
    })

    const unchangedPublicEntry = (await ctx.readAll('publicEntries')).find(
      (entry) => String(entry.entryId) === entryId,
    )
    expect(unchangedPublicEntry?.data).toEqual(publicEntry?.data)
    expect(unchangedPublicEntry?.cacheTags).toEqual(publicEntry?.cacheTags)
  })

  it('excludes hidden fields from public page, list, and search projections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await ctx.raw.mutation(api.collections.sync.installCollectionContractsInternal, {
      collections: [
        {
          slug: 'secure-posts',
          label: { en: 'Secure posts' },
          type: 'flat',
          routing: { pathPrefix: '/secure-posts' },
          locales: ['en'],
          fields: [
            { key: 'title', type: 'text', localized: true, searchable: true },
            {
              key: 'internalNote',
              type: 'text',
              localized: true,
              searchable: true,
              hidden: true,
            },
            {
              key: 'meta',
              type: 'object',
              fields: [
                { key: 'summary', type: 'text', searchable: true },
                { key: 'secret', type: 'text', searchable: true, hidden: true },
              ],
            },
          ],
        },
      ],
    })

    const entryId = await owner.createEntry({
      collection: 'secure-posts',
      slug: 'hidden-fields',
      localized: {
        title: 'Visible title',
        internalNote: 'classified needle',
      },
      shared: {
        meta: {
          summary: 'Visible summary',
          secret: 'nested classified needle',
        },
      },
    })

    await publishEntry(owner, entryId)

    const page = await ctx.raw.query(api.public.page, {
      collection: 'secure-posts',
      locale: 'en',
      path: '/secure-posts/hidden-fields',
    })
    const list = await ctx.raw.query(api.public.list, {
      collection: 'secure-posts',
      locale: 'en',
      limit: 10,
      cursor: null,
    })
    const search = await ctx.raw.query(api.public.search, {
      collection: 'secure-posts',
      locale: 'en',
      query: 'classified needle',
    })
    const navTree = await ctx.raw.query(api.public.nav, {
      collection: 'secure-posts',
      locale: 'en',
    })

    expect(page.status).toBe('found')
    expect(page.page?.data).toEqual({
      title: 'Visible title',
      meta: { summary: 'Visible summary' },
    })
    expect(list.entries[0]?.data).toEqual({
      title: 'Visible title',
      meta: { summary: 'Visible summary' },
    })
    expect(navTree.tree[0]?.entry.data).toEqual({
      title: 'Visible title',
      meta: { summary: 'Visible summary' },
    })
    expect(search.results).toEqual([])
  })

  it('rejects invalid pagination cursors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 3)

    await expect(
      ctx.raw.query(api.public.list, {
        collection: 'articles',
        locale: 'en',
        limit: 10,
        cursor: 'not-a-real-cursor',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'INVALID_CURSOR'
    })
  })

  it('supports bounded top-level and child navigation queries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const fixture = await seedTreeFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    for (const id of [
      fixture.rootAId,
      fixture.rootBId,
      fixture.childId,
      fixture.siblingId,
      fixture.grandchildId,
    ]) {
      await publishEntry(owner, id)
    }

    const topLevel = await ctx.raw.query(api.public.nav, {
      collection: 'docs',
      locale: 'en',
    })

    expect(topLevel.tree.map((node) => node.entry.route.slug).sort()).toEqual(['root-a', 'root-b'])
    const rootA = topLevel.tree.find((node) => node.entry.route.slug === 'root-a')
    expect(rootA?.children.map((node) => node.entry.route.slug).sort()).toEqual([
      'child',
      'sibling',
    ])
  })

  it('only exposes site data blocks explicitly marked public', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'internalConfig',
      data: { token: 'secret' },
    })
    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'announcement',
      visibility: 'public',
      data: { message: 'Hello public' },
    })

    const privateData = await ctx.raw.query(api.public.siteData, {
      key: 'internalConfig',
    })
    const publicData = await ctx.raw.query(api.public.siteData, {
      key: 'announcement',
    })
    const blocks = await owner.query(api.siteData.listSiteData, {})

    expect(privateData.data).toBeNull()
    expect(publicData.data).toEqual({ message: 'Hello public' })
    expect(blocks.find((block) => block.key === 'internalConfig')?.visibility).toBe('private')
    expect(blocks.find((block) => block.key === 'announcement')?.visibility).toBe('public')
  })

  it('excludes fallback-only localized routes from page, list, nav, search, and sitemap projections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'articles',
        label: { en: 'Articles' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/articles',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'articles',
      slug: 'hello-world',
      localized: { title: 'Hello world' },
    })
    await publishEntry(owner, entryId)

    const page = await ctx.raw.query(api.public.page, {
      collection: 'articles',
      locale: 'de',
      path: '/articles/hello-world',
    })
    const result = await ctx.raw.query(api.public.list, {
      collection: 'articles',
      locale: 'de',
      limit: 10,
      cursor: null,
    })
    const nav = await ctx.raw.query(api.public.nav, {
      collection: 'articles',
      locale: 'de',
    })
    const search = await ctx.raw.query(api.public.search, {
      query: 'Hello',
      collection: 'articles',
      locale: 'de',
      limit: 10,
      cursor: null,
    })
    const sitemap = await ctx.raw.query(api.public.sitemap, {
      collection: 'articles',
      locale: 'de',
    })

    expect(page.status).toBe('not-found')
    expect(page.page).toBeNull()
    expect(result.entries).toHaveLength(0)
    expect(nav.tree).toHaveLength(0)
    expect(search.results).toHaveLength(0)
    expect(sitemap.urls).toHaveLength(0)
  })

  it('keeps localized site data fallback explicit and separate from route fallback', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'announcement',
      visibility: 'public',
      localized: true,
      locale: 'en',
      data: { message: 'Hello' },
    })
    await owner.mutation(api.siteData.saveSiteData, {
      key: 'announcement',
      locale: 'de',
      data: {
        message: 'Hallo',
      },
    })

    const result = await ctx.raw.query(api.public.siteData, {
      key: 'announcement',
      locale: 'de-CH',
    })

    expect(result.data).toEqual({ message: 'Hallo' })
    expect(result.locale).toMatchObject({
      requested: 'de-CH',
      resolved: 'de',
      fallbacks: { fields: [{ path: 'announcement', from: 'de' }] },
    })
  })
})

// ---------------------------------------------------------------------------
// Stable ID redirect
// ---------------------------------------------------------------------------
describe('public API: stableId redirect', () => {
  it('returns redirectTo when slug changed but stableId matches', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'wiki',
        label: { en: 'Wiki' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/wiki',
          slugMode: 'stable',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')

    // Create and publish
    const entryId = await owner.createEntry({
      collection: 'wiki',
      slug: 'original-title',
      localized: { title: 'Original Title' },
    })

    await publishEntry(owner, entryId)

    // Get the published path (includes stableId)
    // Get entry to find its stableId and published path
    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    const originalPath = entry.localeData?.published?.path ?? entry.path
    const stableId = entry.stableId

    expect(stableId).toBeTruthy()
    expect(originalPath).toContain(stableId)

    // Verify the page is accessible at its published path
    const page = await ctx.raw.query(api.public.page, {
      collection: 'wiki',
      path: originalPath,
      locale: 'en',
    })
    expect(page.status).toBe('found')
    expect(page.page?.title).toBe('Original Title')

    // Change slug and republish
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: {
        shared: {
          slug: 'renamed-title',
        },
      },
    })
    await publishEntry(owner, entryId)

    // Get new path
    const updatedEntry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    const newPath = updatedEntry.localeData?.published?.path ?? updatedEntry.path
    expect(newPath).not.toBe(originalPath)
    expect(newPath).toContain('renamed-title')
    expect(newPath).toContain(stableId)

    // The OLD path should now return a redirect to the new path
    const redirectResult = await ctx.raw.query(api.public.page, {
      collection: 'wiki',
      path: originalPath,
      locale: 'en',
    })
    expect(redirectResult.status).toBe('redirect')
    expect(redirectResult.redirectTo?.path).toBe(newPath)
    expect(redirectResult.page).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// SEO + sitemap locale defaults
// ---------------------------------------------------------------------------
describe('public API: SEO and sitemap locale defaults', () => {
  it('uses CMS settings default locale for x-default instead of collection order', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await ctx.seed(
      'cmsSettings' as never,
      {
        key: 'site',
        locales: [
          { code: 'en', label: 'English' },
          { code: 'de', label: 'German', isDefault: true },
        ],
        webhooks: [],
        updatedBy: 'owner-1',
        updatedAt: Date.now(),
      } as never,
    )

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'blog',
        label: { en: 'Blog', de: 'Blog' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/blog',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'blog',
      slug: 'default-locale-proof',
      localized: { title: 'Default Locale Proof' },
      locale: 'en',
    })
    await owner.mutation(api.editor.createLocaleVariant, {
      entryId,
      locale: 'de',
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 2,
      patch: {
        locales: {
          de: {
            values: { title: 'Default-Locale-Beweis' },
          },
        },
      },
    })
    await publishEntry(owner, entryId, ['en', 'de'])

    const page = await ctx.raw.query(api.public.page, {
      collection: 'blog',
      path: '/blog/default-locale-proof',
      locale: 'en',
    })
    expect(page.status).toBe('found')
    expect(page.seo?.xDefault).toMatchObject({
      locale: 'de',
      path: '/blog/default-locale-proof',
    })

    const sitemap = await ctx.raw.query(api.public.sitemap, { collection: 'blog', locale: 'en' })
    expect(sitemap.urls[0]?.xDefault).toMatchObject({
      locale: 'de',
      path: '/blog/default-locale-proof',
    })
  })

  it('rejects unsupported locales for collection-scoped public reads', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPublishedEntries(ctx, 1, { collectionSlug: 'articles' })

    const expectUnsupportedLocale = async (read: Promise<unknown>) => {
      await expect(read).rejects.toSatisfy((error: unknown) => {
        const data = getCmsErrorData(error)
        return (
          data?.code === 'UNSUPPORTED_LOCALE' &&
          (data.details as { supportedLocales?: string[] } | null)?.supportedLocales?.includes('en')
        )
      })
    }

    await expectUnsupportedLocale(
      ctx.raw.query(api.public.page, {
        collection: 'articles',
        path: '/articles/entry-01',
        locale: 'fr',
      }),
    )
    await expectUnsupportedLocale(
      ctx.raw.query(api.public.list, { collection: 'articles', locale: 'fr' }),
    )
    await expectUnsupportedLocale(
      ctx.raw.query(api.public.search, {
        collection: 'articles',
        locale: 'fr',
        query: 'Entry',
      }),
    )
    await expectUnsupportedLocale(
      ctx.raw.query(api.public.nav, { collection: 'articles', locale: 'fr' }),
    )
    await expectUnsupportedLocale(
      ctx.raw.query(api.public.sitemap, { collection: 'articles', locale: 'fr' }),
    )
  })
})

// ---------------------------------------------------------------------------
// surround
// ---------------------------------------------------------------------------
describe('public API: surround', () => {
  it('returns previous/next sibling windows for tree entries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const fixture = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    // Publish all entries
    for (const id of [
      fixture.rootAId,
      fixture.rootBId,
      fixture.childId,
      fixture.siblingId,
      fixture.grandchildId,
    ]) {
      await publishEntry(owner, id)
    }

    // Child and Sibling share a parent (rootA)
    // child has orderRank "a0", sibling has "b0" → child is first
    const childSurround = await ctx.raw.query(api.public.surround, {
      collection: 'docs',
      path: '/docs/root-a/child',
      locale: 'en',
    })
    expect(childSurround.previous).toEqual([]) // first sibling
    expect(childSurround.next[0]).toMatchObject({
      title: 'Sibling',
      route: { path: '/docs/root-a/sibling' },
    })

    const siblingSurround = await ctx.raw.query(api.public.surround, {
      collection: 'docs',
      path: '/docs/root-a/sibling',
      locale: 'en',
    })
    expect(siblingSurround.previous[0]).toMatchObject({
      title: 'Child',
      route: { path: '/docs/root-a/child' },
    })
    expect(siblingSurround.next).toEqual([]) // last sibling
  })

  it('returns empty windows when path does not exist', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedTreeFixture(ctx)

    const result = await ctx.raw.query(api.public.surround, {
      collection: 'docs',
      path: '/docs/nonexistent',
      locale: 'en',
    })
    expect(result.previous).toEqual([])
    expect(result.next).toEqual([])
  })
})
