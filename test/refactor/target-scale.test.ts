/// <reference types="vite/client" />

import type { ginkoPublishImpactResultValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import type { Id } from '../../packages/convex/src/_generated/dataModel'
import { assetDiscoveryFields } from '../../packages/convex/src/assets/scope'
import {
  buildPublicProjectionPayload,
  buildPublicSearchProjectionPayload,
  type PublicProjectionInput,
} from '../../packages/convex/src/entries/workflow/projection'
import {
  MAX_MDC_BODY_BYTES,
  MAX_SEARCH_TEXT_BYTES,
  utf8ByteLength,
} from '../../packages/convex/src/lib/contentLimits'
import type { MutationCtx } from '../../packages/convex/src/lib/types'
import {
  api,
  createCtx,
  currentDraftVersion,
  previewPublishEntryWithArgs,
  publishEntry,
  seedOwner,
} from '../helpers'

type TestCtx = ReturnType<typeof createCtx>

async function insertPublicProjectionFixture(ctx: MutationCtx, input: PublicProjectionInput) {
  await ctx.db.insert('publicEntries', buildPublicProjectionPayload(input))
  if (input.searchIncluded !== false) {
    await ctx.db.insert('publicSearchEntries', buildPublicSearchProjectionPayload(input))
  }
}

async function seedInstalledContract(
  ctx: TestCtx,
  options: { locales: string[]; collection: string; route: string; tree?: boolean },
) {
  const content = buildResolvedContentContract(
    {
      collections: {
        [options.collection]: {
          type: 'page',
          source: `content/${options.collection}/**/*.md`,
          i18n: true,
          route: Object.fromEntries(options.locales.map((locale) => [locale, options.route])),
          cms: options.tree ? { type: 'tree', settings: { maxDepth: 5 } } : { type: 'flat' },
        },
      },
    },
    {
      defaultLocale: options.locales[0]!,
      locales: options.locales,
      localeFallbacks: Object.fromEntries(
        options.locales.map((locale, index) => [locale, index === 0 ? [] : [options.locales[0]!]]),
      ),
    },
  )
  const contentHash = await hashCanonicalJson(content)
  await ctx.seed('cmsContract', {
    key: 'active',
    content,
    presentation: { collections: {} },
    contentHash,
    presentationHash: await hashCanonicalJson({ collections: {} }),
    writeGeneration: 1,
    transitionState: 'ready',
    transitionRunId: null,
    installedAt: 1,
    installedBy: 'scale-fixture',
  })
  return contentHash
}

describe('greenfield target-scale evidence', () => {
  it('stores the supported 1,500 entries, three locales, 500 assets, depth-five tree, and long MDC', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const locales = ['en', 'de', 'fr']
    await seedInstalledContract(ctx, {
      locales,
      collection: 'docs',
      route: '/docs',
      tree: true,
    })
    const longMdcPrefix = '# Long document\n\n'
    const longMdc = `${longMdcPrefix}${'x'.repeat(
      MAX_MDC_BODY_BYTES - utf8ByteLength(longMdcPrefix) - 128,
    )}`
    const owner = ctx.asCmsUser('owner-1')
    const longEntryId = await owner.createEntry({
      collection: 'docs',
      slug: 'long-document',
      locale: 'en',
      localized: {},
      bodyMdc: '# Draft',
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: longEntryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: longEntryId,
      locale: 'fr',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId: longEntryId,
      expectedDraftVersion: await currentDraftVersion(owner, longEntryId),
      patch: {
        locales: Object.fromEntries(
          locales.map((locale) => [
            locale,
            { values: { title: `${locale} Long document` }, bodyMdc: longMdc },
          ]),
        ),
      },
    })
    const publication = await publishEntry(owner, longEntryId, locales)
    const publishedRevision = (await ctx.readAll('entryRevisions')).find(
      (revision: { _id: string }) => String(revision._id) === publication.versionId,
    )!
    expect(Object.keys(publishedRevision.snapshots).sort()).toEqual([...locales].sort())
    for (const locale of locales) {
      expect(utf8ByteLength(publishedRevision.snapshots[locale]!.bodyMdc)).toBeGreaterThanOrEqual(
        MAX_MDC_BODY_BYTES - 256,
      )
    }
    const longSearchRows = (await ctx.readAll('publicSearchEntries')).filter(
      (row: { entryId: string }) => String(row.entryId) === longEntryId,
    )
    expect(longSearchRows).toHaveLength(3)
    expect(
      longSearchRows.every(
        (row: { searchText: string }) => utf8ByteLength(row.searchText) <= MAX_SEARCH_TEXT_BYTES,
      ),
    ).toBe(true)
    expect(
      (await ctx.readAll('publicEntries')).every(
        (row: Record<string, unknown>) => !('bodyMdc' in row) && !('bodyAst' in row),
      ),
    ).toBe(true)
    await expect(
      ctx.published.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/long-document',
      }),
    ).resolves.toMatchObject({
      status: 'found',
      page: { id: longEntryId, bodyAst: expect.any(Object) },
    })
    const sharedStorageId = await ctx.raw.run(async (inner) =>
      inner.storage.store(new Blob(['scale-asset'], { type: 'image/png' })),
    )

    const entryIds: string[] = []
    const pageSize = 100
    for (let pageStart = 0; pageStart < 1_499; pageStart += pageSize) {
      const inserted = await ctx.raw.run(async (inner) => {
        const pageIds: string[] = []
        const pageEnd = Math.min(1_499, pageStart + pageSize)
        for (let index = pageStart; index < pageEnd; index += 1) {
          const parentEntryId = index > 0 && index < 5 ? (pageIds[index - 1] as never) : null
          const entryId = await inner.db.insert('entries', {
            collection: 'docs',
            stableId: `docs-${String(index).padStart(4, '0')}`,
            lifecycle: 'active',
            slug: `page-${String(index).padStart(4, '0')}`,
            parentEntryId,
            orderRank: String(index).padStart(8, '0'),
            nodeKind: 'page',
            shared: {},
            draftVersion: 1,
            sharedVersion: 1,
            activePublications: [],
            latestEditorialRevisionId: null,
            createdBy: 'scale-fixture',
            updatedBy: 'scale-fixture',
            createdAt: index + 1,
            updatedAt: index + 1,
          })
          for (const locale of locales) {
            await inner.db.insert('entryLocaleDrafts', {
              entryId,
              locale,
              slug: null,
              values: { title: `${locale} page ${index}` },
              bodyMdc: index === 0 && locale === 'en' ? longMdc : '',
              version: 1,
              updatedBy: 'scale-fixture',
              updatedAt: index + 1,
            })
          }
          pageIds.push(String(entryId))
        }
        return pageIds
      })
      entryIds.push(...inserted)
    }

    for (let index = 0; index < 500; index += 100) {
      await ctx.raw.run(async (inner) => {
        for (let offset = 0; offset < 100; offset += 1) {
          const assetIndex = index + offset
          await inner.db.insert('assets', {
            storageId: sharedStorageId,
            filename: `asset-${String(assetIndex).padStart(3, '0')}.png`,
            mimeType: 'image/png',
            size: 11,
            sha256: assetIndex.toString(16).padStart(64, '0'),
            width: 1,
            height: 1,
            frames: 1,
            alt: null,
            caption: null,
            scope: 'global',
            entryId: null,
            collection: null,
            tags: [],
            createdBy: 'scale-fixture',
            updatedBy: null,
            createdAt: assetIndex + 1,
            updatedAt: null,
            deletedAt: null,
            deletedBy: null,
            ...assetDiscoveryFields({
              filename: `asset-${String(assetIndex).padStart(3, '0')}.png`,
              mimeType: 'image/png',
              tags: [],
              createdAt: assetIndex + 1,
              updatedAt: null,
              deletedAt: null,
            }),
          })
        }
      })
    }

    const [entries, drafts, assets] = await Promise.all([
      ctx.readAll('entries'),
      ctx.readAll('entryLocaleDrafts'),
      ctx.readAll('assets'),
    ])
    expect(entries).toHaveLength(1_500)
    expect(drafts).toHaveLength(4_500)
    expect(new Set(drafts.map((draft: { locale: string }) => draft.locale))).toEqual(
      new Set(locales),
    )
    expect(assets).toHaveLength(500)
    const longDraft = drafts.find(
      (draft: { entryId: string; locale: string }) =>
        String(draft.entryId) === longEntryId && draft.locale === 'en',
    ) as { bodyMdc: string }
    expect(utf8ByteLength(longDraft.bodyMdc)).toBeGreaterThanOrEqual(MAX_MDC_BODY_BYTES - 256)

    const byId = new Map(entries.map((entry: { _id: string }) => [String(entry._id), entry]))
    let depth = 0
    let cursor = byId.get(entryIds[4]!) as { parentEntryId: string | null } | undefined
    while (cursor) {
      depth += 1
      cursor = cursor.parentEntryId
        ? (byId.get(String(cursor.parentEntryId)) as { parentEntryId: string | null } | undefined)
        : undefined
    }
    expect(depth).toBe(5)
  }, 60_000)

  it('[QUA-07] keeps navigation, list, sitemap, and search bounded at target scale', async () => {
    const ctx = createCtx({ transactionLimits: true })
    const contentHash = await seedInstalledContract(ctx, {
      locales: ['en'],
      collection: 'navigation',
      route: '/navigation',
      tree: true,
    })
    for (let pageStart = 0; pageStart < 1_500; pageStart += 100) {
      await ctx.raw.run(async (inner) => {
        for (let index = pageStart; index < pageStart + 100; index += 1) {
          const key = String(index).padStart(4, '0')
          const entryId = await inner.db.insert('entries', {
            collection: 'navigation',
            stableId: `navigation-${key}`,
            lifecycle: 'active',
            slug: `page-${key}`,
            parentEntryId: null,
            orderRank: key,
            nodeKind: 'page',
            shared: {},
            draftVersion: 1,
            sharedVersion: 1,
            activePublications: [],
            latestEditorialRevisionId: null,
            createdBy: 'scale-fixture',
            updatedBy: 'scale-fixture',
            createdAt: index + 1,
            updatedAt: index + 1,
          })
          const revisionId = await inner.db.insert('entryRevisions', {
            entryId,
            collection: 'navigation',
            revisionNumber: 1,
            operationId: `navigation-publish-${key}`,
            parentRevisionId: null,
            kind: 'publish',
            snapshots: {
              en: {
                shared: {},
                values: { title: `Navigation ${key}` },
                bodyMdc: '',
                slug: `page-${key}`,
                parentEntryId: null,
                orderRank: key,
                sharedVersion: 1,
                localeVersion: 1,
              },
            },
            affectedLocales: ['en'],
            contentHash,
            message: null,
            createdBy: 'scale-fixture',
            createdAt: index + 1,
          })
          await inner.db.patch(entryId, {
            activePublications: [
              {
                locale: 'en',
                revisionId,
                sharedVersion: 1,
                localeVersion: 1,
                firstPublishedAt: index + 1,
                activatedAt: index + 1,
                activatedBy: 'scale-fixture',
              },
            ],
            latestEditorialRevisionId: revisionId,
          })
          await insertPublicProjectionFixture(inner, {
            entryId,
            collection: 'navigation',
            locale: 'en',
            revisionId,
            stableId: `navigation-${key}`,
            parentEntryId: null,
            orderKey: key,
            slug: `page-${key}`,
            title: `Navigation ${key}`,
            description: null,
            data: { title: `Navigation ${key}` },
            searchText: `navigation ${key}`,
            cacheTags: [],
            assetFacts: [],
            navIncluded: index < 499,
            sitemapIncluded: true,
            searchIncluded: true,
            entryCreatedAt: index + 1,
            firstPublishedAt: index + 1,
            lastPublishedAt: index + 1,
          })
        }
      })
    }

    const result = await ctx.published.query(api.public.nav, {
      collection: 'navigation',
      locale: 'en',
    })
    const countNodes = (nodes: Array<{ children?: unknown[] }>): number =>
      nodes.reduce(
        (count, node) => count + 1 + countNodes((node.children ?? []) as typeof nodes),
        0,
      )
    expect(countNodes(result.tree)).toBe(499)

    const list = await ctx.published.query(api.public.list, {
      collection: 'navigation',
      locale: 'en',
      limit: 100,
      cursor: null,
    })
    expect(list.entries).toHaveLength(100)
    expect(list.pageInfo.hasNextPage).toBe(true)
    expect(list.entries.every((entry) => !('bodyAst' in entry))).toBe(true)

    const sitemap = await ctx.raw.query(api.public.sitemap, {
      collection: 'navigation',
      locale: 'en',
      limit: 1_000,
      cursor: null,
    })
    expect(sitemap.urls).toHaveLength(1_000)
    expect(sitemap.pageInfo.hasNextPage).toBe(true)

    const firstSearchPage = await ctx.published.query(api.public.search, {
      collection: 'navigation',
      locale: 'en',
      query: 'navigation',
      limit: 50,
      cursor: null,
    })
    expect(firstSearchPage.results).toHaveLength(50)
    expect(firstSearchPage.pageInfo.hasNextPage).toBe(true)
    expect(firstSearchPage.results.every((entry) => !('bodyAst' in entry))).toBe(true)
    expect(firstSearchPage.pageInfo.endCursor).not.toBeNull()

    const secondSearchPage = await ctx.published.query(api.public.search, {
      collection: 'navigation',
      locale: 'en',
      query: 'navigation',
      limit: 50,
      cursor: firstSearchPage.pageInfo.endCursor,
    })
    expect(secondSearchPage.results).toHaveLength(50)
    expect(
      new Set([
        ...firstSearchPage.results.map((entry) => entry.id),
        ...secondSearchPage.results.map((entry) => entry.id),
      ]).size,
    ).toBe(100)
  }, 60_000)

  it('enumerates 5,105 structural public rows across the former 5,000-row cliff without loss', async () => {
    const ctx = createCtx()
    const contentHash = await seedInstalledContract(ctx, {
      locales: ['en'],
      collection: 'pages',
      route: '/pages',
    })
    const rowCount = 5_105
    const pageSize = 100
    let sharedRevisionId: Id<'entryRevisions'> | null = null
    for (let pageStart = 0; pageStart < rowCount; pageStart += pageSize) {
      const pageEnd = Math.min(rowCount, pageStart + pageSize)
      await ctx.raw.run(async (inner) => {
        let subtreeRootId: Id<'entries'> | null = null
        let subtreeChildId: Id<'entries'> | null = null
        for (let index = pageStart; index < pageEnd; index += 1) {
          const key = String(index).padStart(5, '0')
          const slug =
            index === rowCount - 3
              ? 'needle'
              : index === rowCount - 2
                ? 'child'
                : index === rowCount - 1
                  ? 'grandchild'
                  : `item-${key}`
          const parentEntryId =
            index === rowCount - 2 ? subtreeRootId : index === rowCount - 1 ? subtreeChildId : null
          const entryId = await inner.db.insert('entries', {
            collection: 'pages',
            stableId: `page-${key}`,
            lifecycle: 'active',
            slug,
            parentEntryId,
            orderRank: key,
            nodeKind: 'page',
            shared: {},
            draftVersion: 1,
            sharedVersion: 1,
            activePublications: [],
            latestEditorialRevisionId: null,
            createdBy: 'scale-fixture',
            updatedBy: 'scale-fixture',
            createdAt: index + 1,
            updatedAt: index + 1,
          })
          if (index === rowCount - 3) subtreeRootId = entryId
          if (index === rowCount - 2) subtreeChildId = entryId
          if (!sharedRevisionId) {
            sharedRevisionId = await inner.db.insert('entryRevisions', {
              entryId,
              collection: 'pages',
              revisionNumber: 1,
              operationId: 'scale-publish-shared',
              parentRevisionId: null,
              kind: 'publish',
              snapshots: {
                en: {
                  shared: {},
                  values: { title: 'Scale page' },
                  bodyMdc: '',
                  slug,
                  parentEntryId,
                  orderRank: key,
                  sharedVersion: 1,
                  localeVersion: 1,
                },
              },
              affectedLocales: ['en'],
              contentHash,
              message: null,
              createdBy: 'scale-fixture',
              createdAt: index + 1,
            })
          }
          await inner.db.insert(
            'publicEntries',
            buildPublicProjectionPayload({
              entryId,
              collection: 'pages',
              locale: 'en',
              revisionId: sharedRevisionId,
              stableId: `page-${key}`,
              parentEntryId,
              orderKey: key,
              slug,
              title: `Page ${key}`,
              description: null,
              data: { title: `Page ${key}` },
              searchText: `page ${key}`,
              cacheTags: [],
              assetFacts: [],
              navIncluded: false,
              sitemapIncluded: true,
              searchIncluded: true,
              entryCreatedAt: index + 1,
              firstPublishedAt: index + 1,
              lastPublishedAt: index + 1,
            }),
          )
        }
      })
    }

    const paths: string[] = []
    let cursor: string | null = null
    do {
      const page = await ctx.published.query(api.public.routes, {
        collection: 'pages',
        locale: 'en',
        limit: 250,
        cursor,
      })
      paths.push(...page.routes.map((route: { path: string }) => route.path))
      cursor = page.pageInfo.endCursor
    } while (cursor)

    expect(paths).toHaveLength(rowCount)
    expect(new Set(paths).size).toBe(rowCount)
    expect(paths[0]).toBe('/pages/item-00000')
    expect(paths.at(-1)).toBe('/pages/needle/child/grandchild')

    const subtreePaths: string[] = []
    let subtreeCursor: string | null = null
    do {
      const page = await ctx.published.query(api.public.list, {
        collection: 'pages',
        locale: 'en',
        pathPrefix: '/pages/needle',
        limit: 2,
        cursor: subtreeCursor,
      })
      subtreePaths.push(
        ...page.entries.map((entry: { route: { path: string } }) => entry.route.path),
      )
      subtreeCursor = page.pageInfo.endCursor
    } while (subtreeCursor)

    expect(subtreePaths).toEqual([
      '/pages/needle',
      '/pages/needle/child',
      '/pages/needle/child/grandchild',
    ])
  }, 60_000)

  it('previews a 1,500-node route move in one bounded page and enumerates the frozen plan', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const contentHash = await seedInstalledContract(ctx, {
      locales: ['en'],
      collection: 'pages',
      route: '/pages',
      tree: true,
    })
    const rootId = await ctx.raw.run(async (inner) => {
      const entryId = await inner.db.insert('entries', {
        collection: 'pages',
        stableId: 'impact-root',
        lifecycle: 'active',
        slug: 'before',
        parentEntryId: null,
        orderRank: '00000000',
        nodeKind: 'page',
        shared: {},
        draftVersion: 2,
        sharedVersion: 1,
        activePublications: [],
        latestEditorialRevisionId: null,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        createdAt: 1,
        updatedAt: 2,
      })
      const revisionId = await inner.db.insert('entryRevisions', {
        entryId,
        collection: 'pages',
        revisionNumber: 1,
        operationId: 'impact-root-publish',
        parentRevisionId: null,
        kind: 'publish',
        snapshots: {
          en: {
            shared: {},
            values: {},
            bodyMdc: '',
            slug: 'before',
            parentEntryId: null,
            orderRank: '00000000',
            sharedVersion: 1,
            localeVersion: 1,
          },
        },
        affectedLocales: ['en'],
        contentHash,
        message: null,
        createdBy: 'owner-1',
        createdAt: 1,
      })
      await inner.db.patch(entryId, {
        activePublications: [
          {
            locale: 'en',
            revisionId,
            sharedVersion: 1,
            localeVersion: 1,
            firstPublishedAt: 1,
            activatedAt: 1,
            activatedBy: 'owner-1',
          },
        ],
        latestEditorialRevisionId: revisionId,
      })
      await inner.db.insert('entryLocaleDrafts', {
        entryId,
        locale: 'en',
        slug: 'after',
        values: {},
        bodyMdc: '',
        version: 2,
        updatedBy: 'owner-1',
        updatedAt: 2,
      })
      await insertPublicProjectionFixture(inner, {
        entryId,
        collection: 'pages',
        locale: 'en',
        revisionId,
        stableId: 'impact-root',
        parentEntryId: null,
        orderKey: '00000000',
        slug: 'before',
        title: 'Impact root',
        description: null,
        data: {},
        searchText: 'impact root',
        cacheTags: [],
        assetFacts: [],
        navIncluded: true,
        sitemapIncluded: true,
        searchIncluded: true,
        entryCreatedAt: 1,
        firstPublishedAt: 1,
        lastPublishedAt: 1,
      })
      return String(entryId)
    })

    for (let pageStart = 0; pageStart < 1_500; pageStart += 100) {
      await ctx.raw.run(async (inner) => {
        const parentEntryId = inner.db.normalizeId('entries', rootId)!
        for (let offset = 0; offset < 100; offset += 1) {
          const index = pageStart + offset
          const key = String(index).padStart(8, '0')
          const entryId = await inner.db.insert('entries', {
            collection: 'pages',
            stableId: `impact-${key}`,
            lifecycle: 'active',
            slug: `child-${key}`,
            parentEntryId,
            orderRank: key,
            nodeKind: 'page',
            shared: {},
            draftVersion: 1,
            sharedVersion: 1,
            activePublications: [],
            latestEditorialRevisionId: null,
            createdBy: 'owner-1',
            updatedBy: 'owner-1',
            createdAt: index + 3,
            updatedAt: index + 3,
          })
          const revisionId = await inner.db.insert('entryRevisions', {
            entryId,
            collection: 'pages',
            revisionNumber: 1,
            operationId: `impact-publish-${key}`,
            parentRevisionId: null,
            kind: 'publish',
            snapshots: {
              en: {
                shared: {},
                values: {},
                bodyMdc: '',
                slug: `child-${key}`,
                parentEntryId,
                orderRank: key,
                sharedVersion: 1,
                localeVersion: 1,
              },
            },
            affectedLocales: ['en'],
            contentHash,
            message: null,
            createdBy: 'owner-1',
            createdAt: index + 3,
          })
          await inner.db.patch(entryId, {
            activePublications: [
              {
                locale: 'en',
                revisionId,
                sharedVersion: 1,
                localeVersion: 1,
                firstPublishedAt: index + 3,
                activatedAt: index + 3,
                activatedBy: 'owner-1',
              },
            ],
            latestEditorialRevisionId: revisionId,
          })
          await insertPublicProjectionFixture(inner, {
            entryId,
            collection: 'pages',
            locale: 'en',
            revisionId,
            stableId: `impact-${key}`,
            parentEntryId,
            orderKey: key,
            slug: `child-${key}`,
            title: `Child ${key}`,
            description: null,
            data: {},
            searchText: `child ${key}`,
            cacheTags: [],
            assetFacts: [],
            navIncluded: true,
            sitemapIncluded: true,
            searchIncluded: true,
            entryCreatedAt: index + 3,
            firstPublishedAt: index + 3,
            lastPublishedAt: index + 3,
          })
        }
      })
    }

    const owner = ctx.asCmsUser('owner-1')
    const startedAt = performance.now()
    const preview = await previewPublishEntryWithArgs(owner, {
      entryId: rootId,
      expectedVersion: 2,
      locales: ['en'],
    })
    expect(performance.now() - startedAt).toBeLessThan(2_000)
    const publishImpact = (
      preview.details as { publishImpact: typeof ginkoPublishImpactResultValidator.type }
    ).publishImpact
    const impact = publishImpact.locales[0]!.routeImpact
    expect(impact).toMatchObject({
      total: null,
      listed: 25,
      hasMore: true,
      continueCursor: expect.any(String),
      impactHash: expect.stringMatching(/^routes:/),
    })

    const entryIds = new Set<string>()
    const firstChanges = publishImpact.locales[0]!.changes
    for (const change of firstChanges.filter((item) => item.scope === 'descendant')) {
      entryIds.add(change.entryId!)
    }
    let cursor = impact.continueCursor as string | null
    while (cursor) {
      const page = await owner.query(api.entries.publish.listPublishRouteImpactPage, {
        entryId: rootId,
        locale: 'en',
        expectedVersion: 2,
        expectedRouteGeneration: impact.routeGeneration,
        cursor,
        limit: 100,
      })
      for (const change of page.changes) entryIds.add(change.entryId!)
      cursor = page.continueCursor
    }
    expect(entryIds.size).toBe(1_500)
  }, 60_000)
})
