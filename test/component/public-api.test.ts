/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  previewPublishEntryWithArgs,
  publishEntry,
  seedMultiLocaleSettings,
  seedOwner,
  seedSettings,
} from './entries/helpers'

const api = anyApi

type TestCtx = ReturnType<typeof createCtx>

async function createPost(
  ctx: TestCtx,
  input: {
    slug: string
    title: string
    internalNote?: string
    author?: string
    publish?: boolean
  },
) {
  const owner = ctx.asCmsUser('owner-1')
  const entryId = await owner.createEntry({
    collection: 'posts',
    slug: input.slug,
    localized: {
      title: input.title,
      ...(input.internalNote ? { internalNote: input.internalNote } : {}),
    },
    shared: input.author ? { author: input.author } : {},
  })
  if (input.publish !== false) await publishEntry(owner, entryId)
  return entryId
}

async function seedPosts(ctx: TestCtx, titles: string[]) {
  const ids: string[] = []
  for (const [index, title] of titles.entries()) {
    ids.push(
      await createPost(ctx, {
        slug: `post-${String(index + 1).padStart(2, '0')}`,
        title,
      }),
    )
  }
  return ids
}

describe('canonical public content API', () => {
  it('resolves structural pages and keyset-pages stable sort ties without loss', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const ids = await seedPosts(ctx, ['First', 'Second', 'Third', 'Fourth', 'Fifth'])

    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'posts',
        locale: 'en',
        path: '/posts/post-03',
      }),
    ).resolves.toMatchObject({
      status: 'found',
      page: {
        id: ids[2],
        title: 'Third',
        route: { path: '/posts/post-03', href: '/posts/post-03' },
      },
    })

    await ctx.raw.run(async (innerCtx) => {
      const rows = await innerCtx.db.query('publicEntries').collect()
      await Promise.all(
        rows.map(async (row) => await innerCtx.db.patch(row._id, { lastPublishedAt: 7 })),
      )
    })

    const seen: string[] = []
    let cursor: string | null = null
    do {
      const result = await ctx.raw.query(api.public.list, {
        collection: 'posts',
        locale: 'en',
        sort: 'lastPublishedAt:asc',
        limit: 2,
        cursor,
      })
      seen.push(...result.entries.map((entry) => entry.id))
      cursor = result.pageInfo.endCursor
    } while (cursor)

    expect(seen).toHaveLength(5)
    expect(new Set(seen)).toEqual(new Set(ids))

    const cursorPage = await ctx.raw.query(api.public.list, {
      collection: 'posts',
      locale: 'en',
      sort: 'lastPublishedAt:asc',
      limit: 2,
      cursor: null,
    })
    if (!cursorPage.pageInfo.endCursor) throw new Error('Expected a second public list page.')
    const cursorPayload = JSON.parse(cursorPage.pageInfo.endCursor) as Record<string, unknown>
    await expect(
      ctx.raw.query(api.public.list, {
        collection: 'posts',
        locale: 'en',
        sort: 'lastPublishedAt:asc',
        limit: 2,
        cursor: JSON.stringify({ ...cursorPayload, entryId: 'not-a-convex-entry-id' }),
      }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'INVALID_CURSOR')

    await expect(
      ctx.raw.query(api.public.surround, {
        collection: 'posts',
        locale: 'en',
        path: '/posts/post-03',
      }),
    ).resolves.toMatchObject({
      previous: [expect.objectContaining({ title: 'Second' })],
      next: [expect.objectContaining({ title: 'Fourth' })],
    })
  })

  it('uses the same total sibling order for navigation and surround when ranks tie', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const ids = await seedPosts(ctx, ['One', 'Two', 'Three', 'Four', 'Five'])

    await ctx.raw.run(async (innerCtx) => {
      const rows = await innerCtx.db.query('publicEntries').collect()
      await Promise.all(rows.map((row) => innerCtx.db.patch(row._id, { orderKey: 'same-rank' })))
    })

    const orderedIds = [...ids].sort((left, right) => left.localeCompare(right))
    const currentId = orderedIds[2]!
    const currentIndex = ids.indexOf(currentId)
    const path = `/posts/post-${String(currentIndex + 1).padStart(2, '0')}`
    const surround = await ctx.raw.query(api.public.surround, {
      collection: 'posts',
      locale: 'en',
      path,
      previous: 2,
      next: 2,
    })
    expect(surround.previous.map((entry) => entry.id)).toEqual(orderedIds.slice(0, 2).reverse())
    expect(surround.next.map((entry) => entry.id)).toEqual(orderedIds.slice(3))

    const navigation = await ctx.raw.query(api.public.nav, {
      collection: 'posts',
      locale: 'en',
    })
    expect(navigation.tree.map((node) => node.entry.id)).toEqual(orderedIds)
  })

  it('generation-fences structural route cursors after publication changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedPosts(ctx, ['One', 'Two', 'Three'])

    const first = await ctx.raw.query(api.public.routes, {
      collection: 'posts',
      locale: 'en',
      limit: 1,
      cursor: null,
    })
    const second = await ctx.raw.query(api.public.routes, {
      collection: 'posts',
      locale: 'en',
      limit: 1,
      cursor: first.pageInfo.endCursor,
    })
    expect(first.snapshot).toBe(second.snapshot)
    expect(first.routes[0]?.stableId).not.toBe(second.routes[0]?.stableId)

    await createPost(ctx, { slug: 'post-04', title: 'Four' })

    await expect(
      ctx.raw.query(api.public.routes, {
        collection: 'posts',
        locale: 'en',
        limit: 1,
        cursor: first.pageInfo.endCursor,
      }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'INVALID_CURSOR')
  })

  it('[WEB-01] uses indexed full-text pagination, excludes drafts, and fences search cursors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    for (let index = 1; index <= 7; index += 1) {
      await createPost(ctx, {
        slug: `indexed-${index}`,
        title: `Indexed result ${index}`,
      })
    }
    await createPost(ctx, {
      slug: 'indexed-draft',
      title: 'Indexed draft secret',
      publish: false,
    })
    for (let index = 1; index <= 12; index += 1) {
      await createPost(ctx, {
        slug: `unrelated-${index}`,
        title: `Unrelated document ${index}`,
      })
    }
    const deepMatchId = await createPost(ctx, {
      slug: 'deep-match',
      title: 'Needleword target',
    })

    await expect(
      ctx.raw.query(api.public.search, {
        collection: 'posts',
        locale: 'en',
        query: 'Needleword',
        limit: 2,
        cursor: null,
      }),
    ).resolves.toMatchObject({
      results: [expect.objectContaining({ id: deepMatchId })],
      pageInfo: { hasNextPage: false, endCursor: null },
    })

    const seen = new Set<string>()
    let cursor: string | null = null
    do {
      const result = await ctx.raw.query(api.public.search, {
        collection: 'posts',
        locale: 'en',
        query: 'Indexed',
        limit: 3,
        cursor,
      })
      result.results.forEach((entry) => seen.add(entry.id))
      cursor = result.pageInfo.endCursor
    } while (cursor)
    expect(seen.size).toBe(7)

    const stale = await ctx.raw.query(api.public.search, {
      collection: 'posts',
      locale: 'en',
      query: 'Indexed',
      limit: 2,
      cursor: null,
    })
    await createPost(ctx, { slug: 'indexed-late', title: 'Indexed late result' })
    await expect(
      ctx.raw.query(api.public.search, {
        collection: 'posts',
        locale: 'en',
        query: 'Indexed',
        limit: 2,
        cursor: stale.pageInfo.endCursor,
      }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'INVALID_CURSOR')
  })

  it('keeps relation IDs stable, strips hidden fields, and denies data-only route reads', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const authorId = await owner.createEntry({
      collection: 'authors',
      slug: 'ada',
      localized: { name: 'Ada Lovelace' },
    })
    await publishEntry(owner, authorId)
    const author = await owner.query(api.editor.getEntry, { id: authorId, locale: 'en' })
    const postId = await createPost(ctx, {
      slug: 'relation-post',
      title: 'Public relation',
      internalNote: 'classifiedneedle',
      author: author?.stableId,
    })

    const page = await ctx.raw.query(api.public.page, {
      collection: 'posts',
      locale: 'en',
      path: '/posts/relation-post',
    })
    const list = await ctx.raw.query(api.public.list, {
      collection: 'posts',
      locale: 'en',
      limit: 10,
      cursor: null,
    })
    expect(page).toMatchObject({
      status: 'found',
      page: { id: postId, data: { author: author?.stableId } },
    })
    expect(page.page?.data).not.toHaveProperty('internalNote')
    expect(list.entries[0]?.data).not.toHaveProperty('internalNote')
    await expect(
      ctx.raw.query(api.public.search, {
        collection: 'posts',
        locale: 'en',
        query: 'classifiedneedle',
      }),
    ).resolves.toMatchObject({ results: [] })

    await expect(
      ctx.raw.query(api.public.list, {
        collection: 'authors',
        locale: 'en',
        limit: 10,
        cursor: null,
      }),
    ).resolves.toMatchObject({ entries: [expect.objectContaining({ id: authorId })] })

    const routeOnlyReads = [
      () =>
        ctx.raw.query(api.public.page, {
          collection: 'authors',
          locale: 'en',
          path: '/authors/ada',
        }),
      () => ctx.raw.query(api.public.nav, { collection: 'authors', locale: 'en' }),
      () =>
        ctx.raw.query(api.public.search, {
          collection: 'authors',
          locale: 'en',
          query: 'Ada',
        }),
      () => ctx.raw.query(api.public.sitemap, { collection: 'authors', locale: 'en' }),
      () =>
        ctx.raw.query(api.public.surround, {
          collection: 'authors',
          locale: 'en',
          path: '/authors/ada',
        }),
    ]
    for (const read of routeOnlyReads) {
      await expect(read()).rejects.toSatisfy(
        (error: unknown) => getCmsErrorData(error)?.code === 'DATA_ONLY_COLLECTION',
      )
    }
  })

  it('[DOC-04][WEB-03][WEB-04][WEB-05] atomically renames a live parent and derives nav, sitemap, alternates, redirects, and descendant paths from the tree', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const rootId = await owner.createEntry({
      collection: 'docs',
      slug: 'guide',
      localized: { title: 'Guide' },
    })
    const childId = await owner.createEntry({
      collection: 'docs',
      slug: 'install',
      parentEntryId: rootId,
      localized: { title: 'Install' },
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: rootId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: childId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId: rootId,
      expectedDraftVersion: 2,
      patch: { locales: { de: { values: { title: 'Leitfaden' } } } },
    })
    await owner.saveEntryDraft({
      entryId: childId,
      expectedDraftVersion: 2,
      patch: { locales: { de: { values: { title: 'Installation' } } } },
    })
    await publishEntry(owner, rootId, ['en', 'de'])
    await publishEntry(owner, childId, ['en', 'de'])
    const childRevision = (await ctx.readAll('publicEntries')).find(
      (row) => row.entryId === childId && row.locale === 'en',
    )?.revisionId

    await owner.saveEntryDraft({
      entryId: rootId,
      expectedDraftVersion: 3,
      patch: { locales: { en: { slug: 'handbook' } } },
    })
    const preview = await previewPublishEntryWithArgs(owner, {
      entryId: rootId,
      expectedVersion: 4,
      locales: ['en'],
    })
    expect(preview).toMatchObject({ allowed: true })
    await publishEntry(owner, rootId, ['en'])

    const page = await ctx.raw.query(api.public.page, {
      collection: 'docs',
      locale: 'en',
      path: '/docs/handbook/install',
    })
    expect(page).toMatchObject({
      status: 'found',
      page: { id: childId, route: { path: '/docs/handbook/install' } },
      seo: {
        alternates: expect.arrayContaining([
          expect.objectContaining({
            locale: 'en',
            route: expect.objectContaining({ path: '/docs/handbook/install' }),
          }),
          expect.objectContaining({
            locale: 'de',
            route: expect.objectContaining({ path: '/dokumentation/guide/install' }),
          }),
        ]),
      },
    })
    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/guide/install',
      }),
    ).resolves.toMatchObject({
      status: 'redirect',
      redirectTo: { path: '/docs/handbook/install' },
    })

    const nav = await ctx.raw.query(api.public.nav, { collection: 'docs', locale: 'en' })
    expect(nav.tree).toEqual([
      expect.objectContaining({
        entry: expect.objectContaining({
          route: expect.objectContaining({ path: '/docs/handbook' }),
        }),
        children: [
          expect.objectContaining({
            entry: expect.objectContaining({
              route: expect.objectContaining({ path: '/docs/handbook/install' }),
            }),
          }),
        ],
      }),
    ])
    await expect(
      ctx.raw.query(api.public.sitemap, { collection: 'docs', locale: 'en' }),
    ).resolves.toMatchObject({
      urls: expect.arrayContaining([
        expect.objectContaining({
          route: expect.objectContaining({ path: '/docs/handbook/install' }),
        }),
      ]),
    })
    expect(
      (await ctx.readAll('publicEntries')).find(
        (row) => row.entryId === childId && row.locale === 'en',
      )?.revisionId,
    ).toBe(childRevision)
  })

  it('[DAT-03] exposes only public site data, reports configured locale fallback honestly, and applies visibility immediately', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'announcement',
      data: { message: 'Draft notice' },
    })
    await expect(
      ctx.raw.query(api.public.siteData, { key: 'announcement' }),
    ).resolves.toMatchObject({ data: null })

    await expect(ctx.raw.query(api.public.siteData, { key: 'missing' })).resolves.toMatchObject({
      key: 'missing',
      data: null,
    })

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'localizedFooter',
      localized: true,
      locale: 'en',
      visibility: 'public',
      data: { message: 'English fallback' },
    })
    await expect(
      ctx.raw.query(api.public.siteData, { key: 'localizedFooter', locale: 'de' }),
    ).resolves.toMatchObject({
      key: 'localizedFooter',
      data: { message: 'English fallback' },
      locale: {
        requested: 'de',
        resolved: 'en',
        policy: 'transparent',
        fallbacks: { fields: [{ path: 'localizedFooter', from: 'en' }] },
      },
    })

    await owner.mutation(api.siteData.updateSiteDataBlock, {
      key: 'announcement',
      visibility: 'public',
    })
    await expect(
      ctx.raw.query(api.public.siteData, { key: 'announcement' }),
    ).resolves.toMatchObject({ data: { message: 'Draft notice' } })

    await owner.mutation(api.siteData.saveSiteData, {
      key: 'announcement',
      data: { message: 'Live notice' },
    })
    await expect(
      ctx.raw.query(api.public.siteData, { key: 'announcement' }),
    ).resolves.toMatchObject({ data: { message: 'Live notice' } })

    await owner.mutation(api.siteData.updateSiteDataBlock, {
      key: 'announcement',
      visibility: 'private',
    })
    await expect(
      ctx.raw.query(api.public.siteData, { key: 'announcement' }),
    ).resolves.toMatchObject({ data: null })
  })
})
