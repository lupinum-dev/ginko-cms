/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import { api, createCtx } from '../helpers'

function contractFixture(componentName?: string) {
  return buildResolvedContentContract(
    {
      collections: {
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          i18n: true,
          route: { en: '/posts', de: '/beitraege' },
          cms: { type: 'tree' },
        },
      },
    },
    {
      defaultLocale: 'en',
      locales: ['en', 'de'],
      localeFallbacks: { de: ['en'] },
      ...(componentName
        ? {
            componentPolicy: {
              components: {
                [componentName]: {
                  kind: 'block' as const,
                  props: {},
                  slots: ['default'],
                  media: null,
                },
              },
            },
          }
        : {}),
    },
  )
}

describe('atomic CMS policy installation', () => {
  it('rejects a mismatched hash without writing policy, locales, or collections', async () => {
    const ctx = createCtx()
    await expect(
      ctx.raw.mutation(api.policy.installCmsPolicy, {
        contract: contractFixture(),
        contractSha256: '0'.repeat(64),
      }),
    ).rejects.toThrow(/hash/i)

    expect(await ctx.readAll('cmsPolicies')).toEqual([])
    expect(await ctx.readAll('cmsSettings')).toEqual([])
    expect(await ctx.readAll('collections')).toEqual([])
  })

  it('rejects malformed and cyclic policy before writing derived state', async () => {
    const ctx = createCtx()
    const contract = {
      ...contractFixture(),
      localeFallbacks: { en: ['de'], de: ['en'] },
    }

    await expect(
      ctx.raw.mutation(api.policy.installCmsPolicy, {
        contract,
        contractSha256: await hashCanonicalJson(contract),
      }),
    ).rejects.toThrow(/cycle/i)

    expect(await ctx.readAll('cmsPolicies')).toEqual([])
    expect(await ctx.readAll('cmsSettings')).toEqual([])
    expect(await ctx.readAll('collections')).toEqual([])
  })

  it('installs the exact contract and all derived projections in one mutation', async () => {
    const ctx = createCtx()
    const contract = contractFixture()
    const contractSha256 = await hashCanonicalJson(contract)

    const summary = await ctx.raw.mutation(api.policy.installCmsPolicy, {
      contract,
      contractSha256,
    })

    expect(summary).toMatchObject({ contractSha256, collectionCount: 1, localeCount: 2 })
    expect(await ctx.readAll('cmsPolicies')).toEqual([
      expect.objectContaining({ key: 'active', contract, contractSha256 }),
    ])
    expect(await ctx.readAll('cmsSettings')).toEqual([
      expect.objectContaining({
        locales: [
          expect.objectContaining({ code: 'en', isDefault: true }),
          expect.objectContaining({ code: 'de', fallback: 'en' }),
        ],
      }),
    ])
    expect(await ctx.readAll('collections')).toEqual([
      expect.objectContaining({
        slug: 'posts',
        type: 'tree',
        locales: ['en', 'de'],
        contract: { source: 'code', version: contractSha256 },
        settings: expect.objectContaining({ defaultLocale: 'en' }),
      }),
    ])
  })

  it('reports concrete drift paths from the exact installed artifact', async () => {
    const ctx = createCtx()
    const installed = contractFixture()
    await ctx.raw.mutation(api.policy.installCmsPolicy, {
      contract: installed,
      contractSha256: await hashCanonicalJson(installed),
    })
    const expected = structuredClone(installed)
    expected.collections.posts!.routing.pathPrefix = '/articles'
    expected.collections.posts!.fields[0]!.searchable = true
    const expectedHash = await hashCanonicalJson(expected)

    await expect(
      ctx.raw.query(api.policy.checkCmsPolicy, {
        contract: expected,
        contractSha256: expectedHash,
      }),
    ).resolves.toMatchObject({
      matches: false,
      expectedContractSha256: expectedHash,
      drift: expect.arrayContaining([
        {
          path: '$.collections.posts.routing.pathPrefix',
          installed: '/posts',
          expected: '/articles',
        },
        {
          path: '$.collections.posts.fields[0].searchable',
          installed: false,
          expected: true,
        },
      ]),
    })
  })

  it('rolls back policy and derived projections when collection drift is incompatible', async () => {
    const ctx = createCtx()
    const initial = contractFixture()
    const initialHash = await hashCanonicalJson(initial)
    await ctx.raw.mutation(api.policy.installCmsPolicy, {
      contract: initial,
      contractSha256: initialHash,
    })
    const collection = (await ctx.readAll('collections'))[0] as { _id: string }
    const now = Date.now()
    await ctx.seed(
      'entries' as never,
      {
        collectionId: collection._id,
        baseSlug: 'post-1',
        stableId: 'post-1',
        status: 'draft',
        dirtyLocales: ['en'],
        draftVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: 'test',
        updatedBy: 'test',
      } as never,
    )

    const changed = structuredClone(initial)
    changed.collections.posts!.fields = changed.collections.posts!.fields.filter(
      (field) => field.key !== 'title',
    )
    const changedHash = await hashCanonicalJson(changed)

    await expect(
      ctx.raw.mutation(api.policy.installCmsPolicy, {
        contract: changed,
        contractSha256: changedHash,
      }),
    ).rejects.toThrow(/REQUIRES_MIGRATION/)
    expect(await ctx.readAll('cmsPolicies')).toEqual([
      expect.objectContaining({ contract: initial, contractSha256: initialHash }),
    ])
    expect(await ctx.readAll('collections')).toEqual([
      expect.objectContaining({
        contract: { source: 'code', version: initialHash },
        fields: expect.arrayContaining([expect.objectContaining({ key: 'title' })]),
      }),
    ])
  })

  it('resets a running reindex when a newer contract generation is installed', async () => {
    const ctx = createCtx()
    const first = contractFixture()
    await ctx.raw.mutation(api.policy.installCmsPolicy, {
      contract: first,
      contractSha256: await hashCanonicalJson(first),
    })

    const second = contractFixture('Callout')
    const secondHash = await hashCanonicalJson(second)
    await ctx.raw.mutation(api.policy.installCmsPolicy, {
      contract: second,
      contractSha256: secondHash,
    })
    const collection = (await ctx.readAll('collections'))[0] as { _id: string }
    const stalePage = await ctx.raw.query(api.collections.jobs.getCollectionReindexPage, {
      collectionId: String(collection._id),
    })
    expect(stalePage).toMatchObject({ requestedGeneration: secondHash, phase: 'draft' })

    const third = contractFixture('Gallery')
    const thirdHash = await hashCanonicalJson(third)
    await ctx.raw.mutation(api.policy.installCmsPolicy, {
      contract: third,
      contractSha256: thirdHash,
    })

    expect(await ctx.readAll('collectionReindexJobs')).toEqual([
      expect.objectContaining({
        requestedGeneration: thirdHash,
        appliedGeneration: null,
        phase: 'draft',
        cursor: null,
      }),
    ])
    await expect(
      ctx.raw.mutation(api.collections.jobs.applyCollectionReindexPage, {
        collectionId: String(collection._id),
        requestedGeneration: secondHash,
        phase: stalePage!.phase,
        cursor: stalePage!.cursor,
        nextCursor: stalePage!.continueCursor,
        entryIds: stalePage!.entryIds,
      }),
    ).resolves.toBe('restart')
  })

  it('rebuilds published projections and enqueues revalidation under the replacement policy', async () => {
    const ctx = createCtx()
    const initial = buildResolvedContentContract(
      {
        collections: {
          posts: {
            type: 'page',
            source: 'content/posts/**/*.md',
            i18n: { locales: ['en', 'de'], defaultLocale: 'de' },
            route: { en: '/posts', de: '/beitraege' },
          },
        },
      },
      { defaultLocale: 'en', locales: ['en', 'de'], localeFallbacks: { de: ['en'] } },
    )
    await ctx.raw.mutation(api.policy.installCmsPolicy, {
      contract: initial,
      contractSha256: await hashCanonicalJson(initial),
    })
    const collection = (await ctx.readAll('collections'))[0] as { _id: string }
    const now = Date.now()
    const entryId = await ctx.seed(
      'entries' as never,
      {
        collectionId: collection._id,
        baseSlug: 'eins',
        stableId: 'post-1',
        status: 'published',
        dirtyLocales: [],
        draftVersion: 1,
        createdBy: 'test',
        updatedBy: 'test',
        publishedBy: 'test',
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      } as never,
    )
    const revisionId = await ctx.seed(
      'entryRevisions' as never,
      {
        entryId,
        collectionId: collection._id,
        parentRevisionId: null,
        kind: 'publish',
        snapshot: {
          parentEntryId: null,
          orderRank: 'a0',
          slug: 'eins',
          shared: {},
          locales: {
            de: {
              slug: 'eins',
              path: '/eins',
              values: { title: 'Eins' },
              bodyMdc: '',
            },
          },
        },
        affectedLocales: ['de'],
        message: null,
        createdBy: 'test',
        createdAt: now,
      } as never,
    )
    const staleHref = '/de/beitraege/eins'
    await ctx.seed(
      'publicEntries' as never,
      {
        entryId,
        revisionId,
        collectionId: collection._id,
        locale: 'de',
        stableId: 'post-1',
        parentEntryId: null,
        orderKey: 'a0',
        slug: 'eins',
        path: '/beitraege/eins',
        href: staleHref,
        title: 'Eins',
        description: null,
        data: { title: 'Eins' },
        cacheTags: ['collection:posts'],
        navIncluded: true,
        sitemapIncluded: true,
        searchIncluded: true,
        entryCreatedAt: now,
        firstPublishedAt: now,
        lastPublishedAt: now,
      } as never,
    )
    await ctx.seed(
      'publicRoutes' as never,
      {
        entryId,
        revisionId,
        collectionId: collection._id,
        locale: 'de',
        path: '/beitraege/eins',
        href: staleHref,
      } as never,
    )

    const replacement = structuredClone(initial)
    replacement.collections.posts!.componentPolicy = {
      components: {
        Callout: { kind: 'block', props: {}, slots: ['default'], media: null },
      },
    }
    const generation = await hashCanonicalJson(replacement)
    await ctx.raw.mutation(api.policy.installCmsPolicy, {
      contract: replacement,
      contractSha256: generation,
    })

    while (true) {
      const page = await ctx.raw.query(api.collections.jobs.getCollectionReindexPage, {
        collectionId: collection._id,
      })
      if (!page || page.phase === 'verify') break
      await ctx.raw.mutation(api.collections.jobs.applyCollectionReindexPage, {
        collectionId: collection._id,
        requestedGeneration: page.requestedGeneration,
        phase: page.phase,
        cursor: page.cursor,
        nextCursor: page.continueCursor,
        entryIds: page.entryIds,
      })
    }

    expect(await ctx.readAll('publicEntries')).toEqual([
      expect.objectContaining({ locale: 'de', href: '/beitraege/eins' }),
    ])
    expect(await ctx.readAll('publicRoutes')).toEqual([
      expect.objectContaining({ locale: 'de', href: '/beitraege/eins' }),
    ])
    expect(await ctx.readAll('outboxEvents')).toEqual([
      expect.objectContaining({
        idempotencyKey: `content.revalidate:policy:${generation}:${String(entryId)}`,
        paths: expect.arrayContaining([staleHref, '/beitraege/eins']),
        payload: expect.objectContaining({ reason: 'policy_sync', generation }),
      }),
    ])
  })

  it('replays every row under the replacement generation and leaves one clean terminal job', async () => {
    const ctx = createCtx()
    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'posts',
        label: 'Posts',
        icon: null,
        type: 'flat',
        routing: {
          mode: 'route',
          pathPrefix: '/posts',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [],
        settings: { defaultLocale: 'en' },
        contract: { source: 'code', version: 'generation-b' },
        createdAt: now,
        updatedAt: now,
        updatedBy: 'test',
      } as never,
    )
    const entryIds: string[] = []
    for (let index = 0; index < 51; index += 1) {
      entryIds.push(
        String(
          await ctx.seed(
            'entries' as never,
            {
              collectionId,
              baseSlug: `post-${String(index).padStart(2, '0')}`,
              stableId: `post-${index}`,
              status: 'draft',
              dirtyLocales: ['en'],
              draftVersion: 1,
              createdBy: 'test',
              updatedBy: 'test',
              createdAt: now + index,
              updatedAt: now + index,
            } as never,
          ),
        ),
      )
    }
    const jobId = await ctx.seed(
      'collectionReindexJobs' as never,
      {
        collectionId,
        requestedGeneration: 'generation-a',
        appliedGeneration: null,
        phase: 'draft',
        cursor: null,
        requestedBy: 'test',
        requestedAt: now,
        updatedAt: now,
      } as never,
    )
    const stalePage = await ctx.raw.query(api.collections.jobs.getCollectionReindexPage, {
      collectionId: String(collectionId),
    })
    await ctx.raw.run(
      async (inner) =>
        await inner.db.patch(jobId as never, {
          requestedGeneration: 'generation-b',
          appliedGeneration: null,
          phase: 'draft',
          cursor: null,
        }),
    )
    await expect(
      ctx.raw.mutation(api.collections.jobs.applyCollectionReindexPage, {
        collectionId: String(collectionId),
        requestedGeneration: 'generation-a',
        phase: stalePage!.phase,
        cursor: stalePage!.cursor,
        nextCursor: stalePage!.continueCursor,
        entryIds: stalePage!.entryIds,
      }),
    ).resolves.toBe('restart')

    const processed = new Set<string>()
    while (true) {
      const page = await ctx.raw.query(api.collections.jobs.getCollectionReindexPage, {
        collectionId: String(collectionId),
      })
      expect(page?.requestedGeneration).toBe('generation-b')
      if (page?.phase === 'verify') break
      if (!page) throw new Error('Reindex job disappeared before verification.')
      if (page.phase === 'draft') page.entryIds.forEach((id) => processed.add(id))
      await ctx.raw.mutation(api.collections.jobs.applyCollectionReindexPage, {
        collectionId: String(collectionId),
        requestedGeneration: page.requestedGeneration,
        phase: page.phase,
        cursor: page.cursor,
        nextCursor: page.continueCursor,
        entryIds: page.entryIds,
      })
    }
    expect([...processed].sort()).toEqual(entryIds.sort())
    await expect(
      ctx.raw.mutation(api.collections.jobs.finishCollectionReindex, {
        collectionId: String(collectionId),
        requestedGeneration: 'generation-b',
      }),
    ).resolves.toBe('complete')
    expect(await ctx.readAll('collectionReindexJobs')).toEqual([])
  })
})
