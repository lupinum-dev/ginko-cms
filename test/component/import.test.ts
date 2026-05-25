/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedOwner, seedSettings } from './entries/helpers'

const api = anyApi

const docsCollection = {
  slug: 'docs',
  label: { en: 'Docs' },
  type: 'tree',
  routing: { pathPrefix: '/docs', slugMode: 'localized', rootSlug: null },
  locales: ['en'],
  fields: [
    { key: 'title', type: 'text', localized: true, required: true, searchable: true },
    { key: 'bodyMdc', type: 'richtext', localized: true },
  ],
}

const localizedDocsCollection = {
  ...docsCollection,
  locales: ['en', 'de'],
  settings: {
    localizedPathPrefixes: {
      en: '/docs',
      de: '/dokumentation',
    },
    localizedRootSlugs: {
      en: 'workflows',
      de: 'arbeitsablaeufe',
    },
  },
}

const localizedSingletonCollection = {
  slug: 'landing',
  label: { en: 'Landing', de: 'Startseite' },
  type: 'flat',
  routing: { pathPrefix: '', slugMode: 'localized', rootSlug: null, singleton: true },
  locales: ['en', 'de'],
  settings: {
    localizedSingletonPaths: {
      en: '/',
      de: '/',
    },
  },
  fields: [
    { key: 'title', type: 'text', localized: true, required: true, searchable: true },
    { key: 'description', type: 'textarea', localized: true },
  ],
}

const authorsCollection = {
  slug: 'authors',
  label: { en: 'Authors' },
  type: 'flat',
  routing: { mode: 'none', pathPrefix: '', slugMode: 'shared', rootSlug: null },
  locales: ['en'],
  fields: [{ key: 'name', type: 'text', localized: true, required: true }],
}

const postsCollection = {
  slug: 'posts',
  label: { en: 'Posts' },
  type: 'flat',
  routing: { pathPrefix: '/blog', slugMode: 'shared', rootSlug: null },
  locales: ['en'],
  fields: [
    { key: 'title', type: 'text', localized: true, required: true, searchable: true },
    {
      key: 'author',
      type: 'relation',
      localized: true,
      relation: { collectionId: 'authors' },
    },
  ],
}

const docsEntry = {
  collection: 'docs',
  stableId: 'docs-intro',
  locale: 'en',
  routePath: '/docs/intro',
  slug: 'intro',
  shared: {},
  localized: { title: 'Intro' },
  bodyMdc: '# Intro',
  public: { sitemap: true, search: true, navigation: true },
}

async function seedCodeDefinedCollections(
  ctx: ReturnType<typeof createCtx>,
  collections: Array<Record<string, unknown>>,
) {
  return await ctx.raw.mutation(api.collections.sync.installCollectionContractsInternal, {
    collections,
  })
}

describe('filesystem content import', () => {
  it('syncs code-defined collection contracts through the host/import operation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const sync = await seedCodeDefinedCollections(ctx, [docsCollection])

    expect(sync).toEqual({ created: 1, updated: 0, skipped: 0, missingFromConfig: [] })
    const owner = ctx.asCmsUser('owner-1')
    await expect(owner.query(api.collections.getCollection, { slug: 'docs' })).resolves.toEqual(
      expect.objectContaining({
        slug: 'docs',
        mode: 'route',
        fields: expect.arrayContaining([
          expect.objectContaining({ key: 'title' }),
          expect.objectContaining({ key: 'bodyMdc' }),
        ]),
      }),
    )
  })

  it('rejects invalid imported collection field definitions before preview or apply', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const invalidCollection = {
      ...docsCollection,
      fields: [{ key: 'related', type: 'relations' }],
    }

    await expect(
      owner.mutation(api.imports.previewImport, {
        collections: [invalidCollection],
        entries: [docsEntry],
      }),
    ).rejects.toThrow('must define a valid relation.collectionId')

    await expect(
      owner.mutation(api.imports.applyImport, {
        collections: [invalidCollection],
        entries: [docsEntry],
      }),
    ).rejects.toThrow('must define a valid relation.collectionId')
  })

  it('applies imported content under code-defined collections and publishes active projections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [docsCollection])

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.mutation(api.imports.applyImport, {
      collections: [docsCollection],
      entries: [docsEntry],
      publish: true,
    })

    expect(result.entries.created).toHaveLength(1)
    expect(result.entries.published).toHaveLength(1)
    expect(result).not.toHaveProperty('projectionBatches')

    const page = await ctx.raw.query(api.public.page, {
      collection: 'docs',
      locale: 'en',
      path: '/docs/intro',
    })
    expect(page).toMatchObject({
      status: 'found',
      page: {
        collection: 'docs',
        title: 'Intro',
      },
    })
    expect(page.page?.data.bodyMdc).toBe('# Intro')
  })

  it('persists import run status, source metadata, and per-entry diffs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [docsCollection])

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.imports.applyImport, {
      source: { provider: 'filesystem', root: '/repo' },
      collections: [docsCollection],
      entries: [docsEntry],
      publish: false,
    })

    const changedEntry = {
      ...docsEntry,
      routePath: '/docs/start',
      localized: { title: 'Start' },
    }

    const preview = await owner.mutation(api.imports.previewImport, {
      source: { provider: 'filesystem', root: '/repo', ref: 'abc123' },
      collections: [docsCollection],
      entries: [changedEntry],
      publish: true,
    })

    expect(preview.status).toBe('previewed')
    expect(preview.summary).toEqual(
      expect.objectContaining({
        status: 'previewed',
        entryCount: 1,
        blockerCount: 0,
      }),
    )
    expect(preview.entries).toEqual([
      expect.objectContaining({
        status: 'update',
        changes: expect.arrayContaining([
          expect.objectContaining({ kind: 'localized_fields_update' }),
          expect.objectContaining({
            kind: 'route_update',
            current: '/docs/intro',
            next: '/docs/start',
          }),
        ]),
      }),
    ])

    const noopApply = await owner.mutation(api.imports.applyImport, {
      source: { provider: 'filesystem', root: '/repo' },
      collections: [docsCollection],
      entries: [docsEntry],
      publish: false,
    })
    expect(noopApply.status).toBe('applied')
    expect(noopApply.noops).toContain('docs:docs-intro:en')

    const updateApply = await owner.mutation(api.imports.applyImport, {
      source: { provider: 'filesystem', root: '/repo' },
      collections: [docsCollection],
      entries: [changedEntry],
      publish: false,
    })
    expect(updateApply.status).toBe('applied')
    expect(updateApply.entries.updated).toHaveLength(1)
    expect(updateApply.entries.created).toEqual([])

    const runs = await owner.query(api.imports.listImportRuns, { limit: 4 })
    expect(runs[0]).toEqual(
      expect.objectContaining({
        status: 'applied',
        source: { provider: 'filesystem', root: '/repo' },
        summary: expect.objectContaining({ status: 'applied' }),
      }),
    )
    expect(runs[1]).toEqual(
      expect.objectContaining({
        status: 'applied',
        source: { provider: 'filesystem', root: '/repo' },
        summary: expect.objectContaining({ status: 'applied' }),
      }),
    )
    expect(runs[2]).toEqual(
      expect.objectContaining({
        status: 'previewed',
        source: { provider: 'filesystem', root: '/repo', ref: 'abc123' },
        summary: expect.objectContaining({ status: 'previewed' }),
      }),
    )
  })

  it('does not write or publish partial results when one imported entry is blocked', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [authorsCollection, postsCollection])

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.mutation(api.imports.applyImport, {
      collections: [authorsCollection, postsCollection],
      entries: [
        {
          collection: 'authors',
          stableId: 'author-ada',
          locale: 'en',
          routePath: 'author-ada',
          slug: 'author-ada',
          shared: {},
          localized: { name: 'Ada' },
        },
        {
          collection: 'posts',
          stableId: 'post-intro',
          locale: 'en',
          routePath: '/blog/intro',
          slug: 'intro',
          shared: {},
          localized: { title: 'Intro', author: 'author-missing' },
        },
      ],
      publish: true,
    })

    expect(result.status).toBe('blocked')
    expect(result.entries?.created).toEqual([])
    expect(result.entries?.published).toEqual([])
    expect(result.entries?.skipped).toEqual(['posts:post-intro:en'])

    const posts = await ctx.raw.query(api.public.list, {
      collection: 'posts',
      locale: 'en',
    })
    expect(posts.entries).toEqual([])
    const post = await ctx.raw.query(api.public.page, {
      collection: 'posts',
      locale: 'en',
      path: '/blog/intro',
    })
    expect(post.status).toBe('not-found')
  })

  it('publishes unchanged imported drafts when publish is requested later', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [docsCollection])

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.imports.applyImport, {
      collections: [docsCollection],
      entries: [docsEntry],
      publish: false,
    })

    const draftOnlyPage = await ctx.raw.query(api.public.page, {
      collection: 'docs',
      locale: 'en',
      path: '/docs/intro',
    })
    expect(draftOnlyPage.status).toBe('not-found')

    const published = await owner.mutation(api.imports.applyImport, {
      collections: [docsCollection],
      entries: [docsEntry],
      publish: true,
    })
    expect(published.status).toBe('published')
    expect(published.noops).toContain('docs:docs-intro:en')
    expect(published.entries?.published).toHaveLength(1)

    const page = await ctx.raw.query(api.public.page, {
      collection: 'docs',
      locale: 'en',
      path: '/docs/intro',
    })
    expect(page.status).toBe('found')
  })

  it('publishes imported localized route prefixes from the code-defined contract', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [localizedDocsCollection])

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.imports.applyImport, {
      collections: [localizedDocsCollection],
      entries: [
        {
          ...docsEntry,
          locale: 'en',
          routePath: '/docs/workflows',
          slug: 'workflows',
          stableId: 'docs-workflows',
          localized: { title: 'Workflows' },
        },
        {
          ...docsEntry,
          locale: 'en',
          routePath: '/docs/workflows/content-routing',
          slug: 'content-routing',
          stableId: 'docs-workflows-content-routing',
          parentStableId: 'docs-workflows',
          localized: { title: 'Content Routing' },
        },
        {
          ...docsEntry,
          locale: 'de',
          routePath: '/dokumentation/arbeitsablaeufe',
          slug: 'arbeitsablaeufe',
          stableId: 'docs-workflows',
          localized: { title: 'Arbeitsablaeufe' },
        },
        {
          ...docsEntry,
          locale: 'de',
          routePath: '/dokumentation/arbeitsablaeufe/content-routing',
          slug: 'content-routing',
          stableId: 'docs-workflows-content-routing',
          parentStableId: 'docs-workflows',
          localized: { title: 'Content Routing' },
        },
      ],
      publish: true,
    })

    const page = await ctx.raw.query(api.public.page, {
      collection: 'docs',
      locale: 'de',
      path: '/dokumentation/arbeitsablaeufe/content-routing',
    })
    expect(page).toMatchObject({
      status: 'found',
      page: {
        route: {
          path: '/dokumentation/arbeitsablaeufe/content-routing',
        },
      },
    })

    const indexPage = await ctx.raw.query(api.public.page, {
      collection: 'docs',
      locale: 'de',
      path: '/dokumentation',
    })
    expect(indexPage).toMatchObject({
      status: 'found',
      page: {
        route: {
          path: '/dokumentation',
          href: '/dokumentation',
        },
      },
    })
    expect(await ctx.readAll('publicEntries')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locale: 'de',
          path: '/dokumentation',
          href: '/dokumentation',
        }),
      ]),
    )
    expect(await ctx.readAll('publicRoutes')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locale: 'de',
          path: '/dokumentation',
          href: '/dokumentation',
        }),
      ]),
    )
  })

  it('publishes imported localized singleton paths from the code-defined contract', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [localizedSingletonCollection])

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.imports.applyImport, {
      collections: [localizedSingletonCollection],
      entries: [
        {
          collection: 'landing',
          stableId: 'landing-home',
          locale: 'en',
          routePath: '/',
          slug: 'home',
          shared: {},
          localized: { title: 'Home', description: 'English home' },
          public: { sitemap: true, search: true, navigation: false },
        },
        {
          collection: 'landing',
          stableId: 'landing-home',
          locale: 'de',
          routePath: '/',
          slug: 'startseite',
          shared: {},
          localized: { title: 'Startseite', description: 'Deutsche Startseite' },
          public: { sitemap: true, search: true, navigation: false },
        },
      ],
      publish: true,
    })

    const page = await ctx.raw.query(api.public.page, {
      collection: 'landing',
      locale: 'de',
      path: '/',
    })
    expect(page).toMatchObject({
      status: 'found',
      page: {
        collection: 'landing',
        route: {
          path: '/',
        },
        title: 'Startseite',
      },
    })
  })

  it('blocks unknown collections instead of creating schema from import payloads', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.mutation(api.imports.applyImport, {
      collections: [docsCollection],
      entries: [docsEntry],
      publish: true,
    })

    expect(result.blockedChanges).toEqual([
      expect.objectContaining({
        collection: 'docs',
        kind: 'collection_missing',
      }),
    ])
    expect(result.entries).toMatchObject({
      created: [],
      updated: [],
      published: [],
      skipped: ['docs:docs-intro:en'],
    })
    await expect(owner.query(api.collections.getCollection, { slug: 'docs' })).resolves.toBeNull()
  })

  it('blocks unmapped source fields against the active code-defined contract', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [docsCollection])

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.mutation(api.imports.applyImport, {
      collections: [
        {
          ...docsCollection,
          fields: [...docsCollection.fields, { key: 'legacyBadge', type: 'text' }],
        },
      ],
      entries: [
        {
          ...docsEntry,
          localized: { ...docsEntry.localized, legacyBadge: 'old' },
        },
      ],
    })

    expect(result.blockedChanges).toEqual([
      expect.objectContaining({
        collection: 'docs',
        field: 'legacyBadge',
        kind: 'field_unmapped',
      }),
    ])
    expect(result.entries.skipped).toEqual(['docs:docs-intro:en'])
  })

  it('blocks unresolved asset references during preview and apply by default', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [docsCollection])

    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.mutation(api.imports.previewImport, {
      collections: [docsCollection],
      entries: [docsEntry],
      assets: [{ sourcePath: '/assets/intro.png', referencedBy: ['docs/intro.md'] }],
    })

    expect(preview.assets).toEqual([
      {
        sourcePath: '/assets/intro.png',
        referencedBy: ['docs/intro.md'],
        status: 'blocked',
        reason:
          'Filesystem import detected an unresolved asset reference. Upload/map the asset before applying, or explicitly allow unresolved assets for a non-publishing import.',
      },
    ])
    expect(preview.importRunId).toEqual(expect.stringContaining('collection-import:preview:'))

    const result = await owner.mutation(api.imports.applyImport, {
      collections: [docsCollection],
      entries: [docsEntry],
      assets: [{ sourcePath: '/assets/intro.png', referencedBy: ['docs/intro.md'] }],
      publish: true,
    })

    expect(result.blockedChanges).toEqual([
      expect.objectContaining({
        kind: 'asset_unresolved',
        sourcePath: '/assets/intro.png',
      }),
    ])
    expect(result.entries?.created).toEqual([])
    expect(result.entries?.published).toEqual([])
    expect(result.entries?.skipped).toEqual(['docs:docs-intro:en'])
  })

  it('allows unresolved assets only through an explicit import escape hatch', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [docsCollection])

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.mutation(api.imports.applyImport, {
      collections: [docsCollection],
      entries: [docsEntry],
      assets: [{ sourcePath: '/assets/intro.png', referencedBy: ['docs/intro.md'] }],
      allowUnresolvedAssets: true,
      publish: false,
    })

    expect(result.blockedChanges).toEqual([])
    expect(result.entries?.created).toHaveLength(1)
    expect(result.assets).toEqual({
      referenced: 1,
      uploaded: 0,
      skipped: 1,
      unresolvedAllowed: true,
    })
  })

  it('blocks imported relation fields that point at missing stable IDs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [authorsCollection, postsCollection])

    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.mutation(api.imports.previewImport, {
      collections: [authorsCollection, postsCollection],
      entries: [
        {
          collection: 'posts',
          stableId: 'post-intro',
          locale: 'en',
          routePath: '/blog/intro',
          slug: 'intro',
          shared: {},
          localized: { title: 'Intro', author: 'author-missing' },
        },
      ],
    })

    expect(preview.entries).toEqual([
      expect.objectContaining({
        collection: 'posts',
        stableId: 'post-intro',
        locale: 'en',
        status: 'blocked',
        blockers: [
          expect.objectContaining({
            kind: 'relation_target_missing',
            field: 'author',
            targetCollection: 'authors',
            targetId: 'author-missing',
          }),
        ],
      }),
    ])

    const result = await owner.mutation(api.imports.applyImport, {
      collections: [authorsCollection, postsCollection],
      entries: [
        {
          collection: 'posts',
          stableId: 'post-intro',
          locale: 'en',
          routePath: '/blog/intro',
          slug: 'intro',
          shared: {},
          localized: { title: 'Intro', author: 'author-missing' },
        },
      ],
      publish: true,
    })

    expect(result.blockedChanges).toEqual([
      expect.objectContaining({
        kind: 'relation_target_missing',
        field: 'author',
        targetCollection: 'authors',
        targetId: 'author-missing',
      }),
    ])
    expect(result.entries?.created).toEqual([])
    expect(result.entries?.published).toEqual([])
    expect(result.entries?.skipped).toEqual(['posts:post-intro:en'])
  })

  it('allows imported relation fields that target entries in the same import payload', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [authorsCollection, postsCollection])

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.mutation(api.imports.applyImport, {
      collections: [authorsCollection, postsCollection],
      entries: [
        {
          collection: 'authors',
          stableId: 'author-ada',
          locale: 'en',
          routePath: 'author-ada',
          slug: 'author-ada',
          shared: {},
          localized: { name: 'Ada' },
        },
        {
          collection: 'posts',
          stableId: 'post-intro',
          locale: 'en',
          routePath: '/blog/intro',
          slug: 'intro',
          shared: {},
          localized: { title: 'Intro', author: 'author-ada' },
        },
      ],
      publish: true,
    })

    expect(result.blockedChanges).toEqual([])
    expect(result.entries?.created).toHaveLength(2)
    expect(result.entries?.published).toHaveLength(2)

    const page = await ctx.raw.query(api.public.page, {
      collection: 'posts',
      locale: 'en',
      path: '/blog/intro',
    })
    expect(page.page?.data.author).toBe('author-ada')
  })

  it('excludes imported entries from sitemap, search, and navigation when public flags disable them', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedCodeDefinedCollections(ctx, [docsCollection])

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.imports.applyImport, {
      collections: [docsCollection],
      entries: [
        {
          ...docsEntry,
          public: { sitemap: false, search: false, navigation: false },
        },
      ],
      publish: true,
    })

    const page = await ctx.raw.query(api.public.page, {
      collection: 'docs',
      locale: 'en',
      path: '/docs/intro',
    })
    expect(page.status).toBe('found')

    const sitemap = await ctx.raw.query(api.public.sitemap, {
      locale: 'en',
      collection: 'docs',
    })
    expect(sitemap.urls).toEqual([])

    const search = await ctx.raw.query(api.public.search, {
      locale: 'en',
      collection: 'docs',
      query: 'Intro',
    })
    expect(search.results).toEqual([])

    const nav = await ctx.raw.query(api.public.nav, {
      collection: 'docs',
      locale: 'en',
    })
    expect(nav.tree).toEqual([])
  })
})
