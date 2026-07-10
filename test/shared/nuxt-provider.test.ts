import {
  isContentProviderResult,
  toContentProviderNavigationQuery,
  toContentProviderQuery,
} from '@lupinum/ginko-content/provider'
import {
  expectProviderCapabilities,
  runProviderContractSuite,
} from '@lupinum/ginko-content/testing/provider-contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const entry = (locale = 'en') => ({
  id: `entry-docs-routing-${locale}`,
  stableId: 'docs-routing',
  collection: 'docs',
  revision: 'docs-routing',
  title: locale === 'de' ? 'Inhaltsrouting' : 'Content Routing',
  data: {
    description: 'Route content across locales.',
    bodyAst: { type: 'root', props: {}, children: [] },
  },
  locale: { requested: locale, resolved: locale },
  route: {
    locale,
    path: locale === 'de' ? '/dokumentation/inhaltsrouting' : '/docs/content-routing',
    slug: locale === 'de' ? 'inhaltsrouting' : 'content-routing',
  },
  translations: [
    { locale: 'en', status: 'published', route: { locale: 'en', path: '/docs/content-routing' } },
    {
      locale: 'de',
      status: 'published',
      route: { locale: 'de', path: '/dokumentation/inhaltsrouting' },
    },
  ],
  updatedAt: 1_780_000_100_000,
  publishedAt: 1_780_000_000_000,
})

const convexMock = vi.hoisted(() => {
  const calls: Array<{ operation: string; args: Record<string, unknown> }> = []
  const query = vi.fn(async (reference: Record<symbol, string>, rawArgs: unknown) => {
    const operation =
      String(reference[Symbol.for('functionName')] || '')
        .split(':')
        .pop() || ''
    const args = rawArgs as Record<string, unknown>
    calls.push({ operation, args })

    if (operation === 'page') {
      if (args.path === '/missing') return { status: 'not-found', page: null }
      return { status: 'found', page: entry(String(args.locale || 'en')) }
    }
    if (operation === 'list') {
      return {
        entries: [entry(String(args.locale || 'en'))],
        pageInfo: { hasNextPage: args.cursor !== 'next', endCursor: args.cursor ? null : 'next' },
      }
    }
    if (operation === 'nav') {
      return { tree: [{ entry: entry(String(args.locale || 'en')), children: [] }] }
    }
    if (operation === 'surround') {
      return { previous: [entry(String(args.locale || 'en'))], next: [] }
    }
    if (operation === 'search') {
      return { results: [{ ...entry(String(args.locale || 'en')), snippet: 'Matched excerpt' }] }
    }
    if (operation === 'siteData') {
      return { key: args.key, locale: { requested: args.locale }, data: { message: 'Hello' } }
    }
    if (operation === 'routes') {
      return {
        routes: [
          {
            collection: args.collection,
            stableId: 'docs-routing',
            locale: args.locale,
            path: args.locale === 'de' ? '/dokumentation/inhaltsrouting' : '/docs/content-routing',
            sitemapIncluded: args.locale !== 'de',
            lastmod: '2026-05-28T20:28:20.000Z',
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      }
    }
    if (operation === 'getAssetUrl') return 'https://cdn.example.test/asset.png'
    throw new Error(`Unexpected Convex operation: ${operation}`)
  })
  return { calls, query }
})

type ProviderModule = typeof import('../../packages/cms/src/nuxt-provider.mjs')
let contentProvider: ProviderModule['contentProvider']
let setClientFactory: ProviderModule['__setGinkoNuxtProviderClientFactoryForTests']

const event = {
  context: {
    runtimeConfig: {
      public: {
        content: {
          defaultLocale: 'en',
          locales: ['en', 'de'],
          collections: { docs: { type: 'page', i18n: { locales: ['en', 'de'] } } },
        },
      },
    },
  },
} as never

const unwrap = <T>(value: T) => (isContentProviderResult(value) ? value.data : value)

describe('Ginko Nuxt provider v2', () => {
  beforeEach(async () => {
    vi.resetModules()
    convexMock.calls.length = 0
    convexMock.query.mockClear()
    process.env.NUXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud'
    ;({ contentProvider, __setGinkoNuxtProviderClientFactoryForTests: setClientFactory } =
      await import('../../packages/cms/src/nuxt-provider.mjs'))
    setClientFactory(() => ({ query: convexMock.query }))
  })

  afterEach(() => {
    setClientFactory(undefined)
    delete process.env.NUXT_PUBLIC_CONVEX_URL
  })

  runProviderContractSuite({
    name: 'CMS provider',
    expectedProviderName: 'cms',
    loadProvider: async () => contentProvider as never,
    createEvent: () => event,
    expectedCapabilities: {
      query: { operators: ['$eq', '$ne', '$prefix'], pagination: ['cursor'] },
    },
    operatorProbes: {
      $eq: {
        positive: toContentProviderQuery({ collection: 'docs', where: { locale: { $eq: 'en' } } }),
      },
      $ne: {
        positive: toContentProviderQuery({ collection: 'docs', where: { draft: { $ne: true } } }),
      },
      $prefix: {
        positive: toContentProviderQuery({
          collection: 'docs',
          where: { path: { $prefix: '/docs' } },
        }),
      },
    },
    paginationProbes: {
      cursor: {
        positive: toContentProviderQuery({
          collection: 'docs',
          paging: { mode: 'cursor', after: null, limit: 10 },
        }),
      },
    },
  })

  it('advertises only capabilities it implements', () => {
    expectProviderCapabilities(contentProvider as never, {
      query: { operators: ['$eq', '$ne', '$prefix'], pagination: ['cursor'] },
    })
  })

  it('returns a raw provider document for a closed route selector', async () => {
    const query = toContentProviderQuery({ collection: 'docs', first: true })
    query.plan.variantSelector = {
      by: 'route',
      requestedLocale: 'de',
      candidates: [{ locale: 'de', contentPath: '/dokumentation/inhaltsrouting' }],
    }
    const response = unwrap(await contentProvider.query(event, query))
    const document = response.result

    expect(document).toMatchObject({
      id: expect.any(String),
      collection: 'docs',
      canonicalKey: 'docs:docs-routing',
      locale: 'de',
      contentPath: '/dokumentation/inhaltsrouting',
      body: { type: 'root', children: expect.any(Array) },
      routeVariants: expect.arrayContaining([
        { locale: 'en', contentPath: '/docs/content-routing' },
        { locale: 'de', contentPath: '/dokumentation/inhaltsrouting' },
      ]),
    })
    for (const legacy of [
      'resolved',
      'localePaths',
      'variants',
      'variantPaths',
      'availableLocales',
    ]) {
      expect(document).not.toHaveProperty(legacy)
    }
  })

  it('tries closed route candidates in order until a published variant is found', async () => {
    const query = toContentProviderQuery({ collection: 'docs', first: true })
    query.plan.variantSelector = {
      by: 'route',
      requestedLocale: 'de',
      candidates: [
        { locale: 'de', contentPath: '/missing' },
        { locale: 'en', contentPath: '/docs/content-routing' },
      ],
    }

    const response = unwrap(await contentProvider.query(event, query))
    const pageCalls = convexMock.calls.filter(({ operation }) => operation === 'page')

    expect(response.result).toMatchObject({ locale: 'en', canonicalKey: 'docs:docs-routing' })
    expect(pageCalls.map(({ args }) => [args.locale, args.path])).toEqual([
      ['de', '/missing'],
      ['en', '/docs/content-routing'],
    ])
  })

  it('threads opaque cursors and returns an honest cursor envelope', async () => {
    const query = toContentProviderQuery({
      collection: 'docs',
      paging: { mode: 'cursor', after: 'next', limit: 10 },
    })
    const response = unwrap(await contentProvider.query(event, query))

    expect(response).toMatchObject({
      mode: 'cursor',
      limit: 10,
      pageInfo: { endCursor: null, hasNext: false },
    })
    expect(response).not.toHaveProperty('total')
    expect(convexMock.calls.at(-1)?.args.cursor).toBe('next')
    expect(convexMock.calls.at(-1)?.args.limit).toBe(10)
  })

  it('returns raw route facts from navigation, surroundings, and search', async () => {
    const navigationWire = toContentProviderNavigationQuery({ collection: 'docs' })
    const navigation = unwrap(
      await contentProvider.navigation!(event, navigationWire.query, { locale: 'en' }),
    )
    const surroundings = unwrap(
      await contentProvider.surroundings!(event, 'docs', '/docs/content-routing', { locale: 'en' }),
    )
    const search = unwrap(
      await contentProvider.search!(event, {
        term: 'routing',
        locale: 'en',
        collections: ['docs'],
      }),
    )

    for (const route of [navigation[0]?.route, surroundings[0]?.route, search[0]?.route]) {
      expect(route).toEqual({
        collection: 'docs',
        canonicalKey: 'docs:docs-routing',
        locale: 'en',
        contentPath: '/docs/content-routing',
      })
      expect(route).not.toHaveProperty('path')
    }
  })

  it('enumerates all locale routes and preserves sitemap opt-out as a fact', async () => {
    const routes = unwrap(await contentProvider.routes!(event))

    expect(routes).toEqual([
      {
        collection: 'docs',
        canonicalKey: 'docs:docs-routing',
        locale: 'en',
        contentPath: '/docs/content-routing',
        sitemap: { lastmod: '2026-05-28T20:28:20.000Z' },
      },
      {
        collection: 'docs',
        canonicalKey: 'docs:docs-routing',
        locale: 'de',
        contentPath: '/dokumentation/inhaltsrouting',
        sitemap: false,
      },
    ])
    expect(convexMock.calls.filter((call) => call.operation === 'routes')).toHaveLength(2)
  })

  it('uses the shared symbol-marked cache wrapper', async () => {
    const response = await contentProvider.query(
      event,
      toContentProviderQuery({ collection: 'docs' }),
    )
    expect(isContentProviderResult(response)).toBe(true)
  })

  it('rejects the removed v1 wire before dispatch', async () => {
    await expect(
      contentProvider.query(event, {
        ...toContentProviderQuery({ collection: 'docs' }),
        v: 1 as 2,
      }),
    ).rejects.toMatchObject({ statusMessage: 'unsupported_query_shape' })
    expect(convexMock.query).not.toHaveBeenCalled()
  })

  it('rejects a malformed page response with a stable provider error', async () => {
    convexMock.query.mockResolvedValueOnce({ status: 'found', page: null })
    const query = toContentProviderQuery({ collection: 'docs', first: true })
    query.plan.variantSelector = {
      by: 'route',
      requestedLocale: 'en',
      candidates: [{ locale: 'en', contentPath: '/docs/content-routing' }],
    }

    await expect(contentProvider.query(event, query)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'provider_response_invalid',
      data: { operation: 'page' },
    })
  })

  it('rejects a malformed list response with a stable provider error', async () => {
    convexMock.query.mockResolvedValueOnce({ entries: null })

    await expect(
      contentProvider.query(event, toContentProviderQuery({ collection: 'docs' })),
    ).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'provider_response_invalid',
      data: { operation: 'list' },
    })
  })
})
