import { toContentProviderQuery } from '@lupinum/ginko-content/provider'
import {
  expectNoLegacyProviderEnvelopeFields,
  expectProviderCapabilities,
  expectProviderDocumentEnvelope,
} from '@lupinum/ginko-content/testing/provider-contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bodyAst = {
  type: 'root',
  props: {},
  children: [
    {
      type: 'element',
      tag: 'h2',
      props: { id: 'content-routing' },
      children: [{ type: 'text', value: 'Content routing' }],
    },
    {
      type: 'element',
      tag: 'p',
      props: {},
      children: [{ type: 'text', value: 'Route content across locales.' }],
    },
  ],
}

const pageEntry = (locale = 'en') => ({
  id: 'entry-docs-routing',
  collection: 'docs',
  revision: 'rev-docs-routing-2',
  ref: 'docs-routing',
  title: locale === 'en' ? 'Content Routing' : 'Inhaltsrouting',
  data: {
    description: 'Route content across locales.',
    bodyAst,
  },
  locale: { requested: locale, resolved: locale === 'de-CH' ? 'de' : locale },
  route: {
    locale: locale === 'de-CH' ? 'de' : locale,
    path: locale === 'en' ? '/docs/workflows/content-routing' : '/dokumentation/inhaltsrouting',
    href: locale === 'en' ? '/docs/workflows/content-routing' : '/de/dokumentation/inhaltsrouting',
    slug: locale === 'en' ? 'content-routing' : 'inhaltsrouting',
  },
  translations: [
    {
      locale: 'en',
      status: 'published',
      route: {
        path: '/docs/workflows/content-routing',
        href: '/docs/workflows/content-routing',
        slug: 'content-routing',
      },
    },
    {
      locale: 'de',
      status: 'published',
      route: {
        path: '/dokumentation/inhaltsrouting',
        href: '/de/dokumentation/inhaltsrouting',
        slug: 'inhaltsrouting',
      },
    },
  ],
  updatedAt: 1_780_000_100_000,
  publishedAt: 1_780_000_000_000,
})

const convexMock = vi.hoisted(() => {
  const calls: Array<{ operation: string; args: unknown }> = []
  const query = vi.fn(async (ref: Record<symbol, string>, args: unknown) => {
    const operation =
      String(ref[Symbol.for('functionName')] ?? '')
        .split(':')
        .pop() ?? ''
    calls.push({ operation, args })

    if (operation === 'page' || operation === 'routeMeta') {
      const input = args as { locale?: string; path?: string }
      if (input.path === '/missing') return { status: 'not_found', page: null }
      return { status: 'found', page: pageEntry(input.locale || 'en') }
    }

    if (operation === 'list') {
      const input = args as { sort?: string }
      if ((args as { collection?: string }).collection === 'authors') {
        return {
          entries: [
            {
              id: 'entry-author-emily',
              collection: 'authors',
              revision: 'rev-author-emily',
              ref: 'authors.emily',
              title: 'Emily',
              data: {
                name: 'Emily',
                role: 'Editor',
              },
              locale: { requested: 'en', resolved: 'en' },
              route: { locale: 'en', path: '/authors/emily', slug: 'emily' },
              translations: [],
              updatedAt: 1_780_000_100_000,
              publishedAt: 1_780_000_000_000,
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        }
      }
      const entries = [
        pageEntry('en'),
        {
          ...pageEntry('en'),
          id: 'entry-docs-launch',
          ref: 'docs-launch',
          title: 'Launch Checklist',
          revision: 'rev-docs-launch',
          route: {
            locale: 'en',
            path: '/docs/workflows/launch-checklist',
            slug: 'launch-checklist',
          },
        },
      ]
      return {
        entries: input.sort === 'lastPublishedAt:desc' ? entries.toReversed() : entries,
        pageInfo: { hasNextPage: false, endCursor: null },
      }
    }

    if (operation === 'nav') {
      const input = args as { locale?: string }
      const locale = input.locale ?? 'en'
      return {
        tree: [
          {
            entry: {
              id: 'entry-docs-routing',
              stableId: 'docs-routing',
              title: locale === 'fr' ? 'Routage de contenu' : 'Content Routing',
              route: {
                locale,
                path: '/docs/workflows/content-routing',
                slug: 'content-routing',
              },
            },
            children:
              locale === 'fr'
                ? [
                    {
                      entry: {
                        id: 'entry-docs-child',
                        stableId: 'docs-child',
                        title: 'Enfant',
                        route: {
                          locale,
                          path: '/docs/workflows/content-routing/child',
                          slug: 'child',
                        },
                      },
                      children: [],
                    },
                  ]
                : [],
          },
        ],
      }
    }

    if (operation === 'sitemap') {
      return {
        urls: [
          {
            route: {
              locale: 'en',
              path: '/docs/workflows/content-routing',
              slug: 'content-routing',
            },
            alternates: [
              {
                locale: 'de',
                hreflang: 'de-DE',
                route: { path: '/dokumentation/inhaltsrouting', slug: 'inhaltsrouting' },
              },
            ],
            lastmod: '2026-05-05T00:00:00.000Z',
          },
        ],
      }
    }

    if (operation === 'search') {
      return {
        results: [
          {
            ...pageEntry('en'),
            snippet: 'Route content across locales.',
          },
        ],
      }
    }

    if (operation === 'siteData') {
      return {
        key: 'announcement',
        locale: { requested: 'en', resolved: 'en' },
        data: { message: 'Live now' },
        updatedAt: 1_780_000_100_000,
      }
    }

    throw new Error(`Unhandled provider contract operation: ${operation}`)
  })

  return { calls, query }
})

type ProviderResult<T> = T | { __ginkoContentProviderResult: true; data: T; cache?: unknown }
type ContentProvider = {
  capabilities: unknown
  page: (
    event: never,
    collection: string,
    path: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>
  routeMeta: (
    event: never,
    collection: string,
    path: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>
  query: (event: never, input: Record<string, unknown>) => Promise<unknown>
  navigation: (
    event: never,
    collection: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>
  sitemapEntries: (event: never, options?: Record<string, unknown>) => Promise<unknown>
  search: (event: never, request?: Record<string, unknown>) => Promise<unknown>
  siteData: (event: never, request?: Record<string, unknown>) => Promise<unknown>
}
type ClientFactorySetter = (factory?: (url: string) => { query: typeof convexMock.query }) => void

let contentProvider: ContentProvider
let setClientFactoryForTests: ClientFactorySetter

const unwrap = <T>(value: ProviderResult<T>): T =>
  typeof value === 'object' &&
  value !== null &&
  '__ginkoContentProviderResult' in value &&
  value.__ginkoContentProviderResult
    ? value.data
    : value
const cache = (value: unknown) =>
  typeof value === 'object' && value !== null && 'cache' in value ? value.cache : undefined
const lastCall = () => convexMock.calls.at(-1)

describe('CMS provider contract', () => {
  beforeEach(async () => {
    vi.resetModules()
    convexMock.calls.length = 0
    convexMock.query.mockClear()
    process.env.NUXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud'
    process.env.GINKO_CONTENT_PROVIDER_SITE = 'cms-provider-fixture'
    ;({ contentProvider, __setGinkoNuxtProviderClientFactoryForTests: setClientFactoryForTests } =
      await import('../../packages/cms/src/nuxt-provider.mjs'))
    setClientFactoryForTests(() => ({ query: convexMock.query }))
  })

  afterEach(() => {
    setClientFactoryForTests?.(undefined)
    delete process.env.NUXT_PUBLIC_CONVEX_URL
    delete process.env.GINKO_CONTENT_PROVIDER_SITE
  })

  it('advertises only the public capabilities covered by executable tests', () => {
    expectProviderCapabilities(contentProvider as never, {
      routeBackedCollections: true,
      dataCollections: true,
      localizedRoutes: true,
      translatedSlugs: true,
      navigation: true,
      surroundings: true,
      sitemap: true,
      query: {
        operators: ['$eq', '$ne', '$in', '$contains', '$icontains', '$prefix', '$and', '$or'],
        limit: true,
        skip: false,
        count: false,
      },
    })
  })

  it('returns page payloads with stored Comark AST and fallback metadata', async () => {
    const wrapped = await contentProvider.page(
      {} as never,
      'docs',
      '/dokumentation/inhaltsrouting',
      {
        locale: 'de-CH',
        resolveLocale: { fallback: ['de', 'en'] },
      },
    )
    const page = unwrap(wrapped)

    expectProviderDocumentEnvelope(page, { locale: 'de', defaultLocale: 'en' })
    expect(page).toMatchObject({
      id: 'entry-docs-routing',
      collection: 'docs',
      type: 'markdown',
      path: '/de/dokumentation/inhaltsrouting',
      unprefixedPath: '/dokumentation/inhaltsrouting',
      locale: 'de',
      canonicalKey: 'docs:docs-routing',
      title: 'Inhaltsrouting',
      body: bodyAst,
      resolved: {
        locale: 'de',
        requestedLocale: 'de-CH',
        fallback: true,
        fallbackLocale: 'de',
        requestedRoute: '/dokumentation/inhaltsrouting',
      },
    })
    expectNoLegacyProviderEnvelopeFields(page)
    expect(cache(wrapped).tags).toEqual(
      expect.arrayContaining([
        'collection:docs',
        'entry:docs:docs-routing',
        'entry:docs:docs-routing:de',
        'route:/dokumentation/inhaltsrouting',
      ]),
    )
    expect(lastCall()).toEqual({
      operation: 'page',
      args: {
        collection: 'docs',
        locale: 'de-CH',
        fallback: ['de', 'en'],
        path: '/dokumentation/inhaltsrouting',
      },
    })
  })

  it('returns null for unknown pages without changing the result shape', async () => {
    const wrapped = await contentProvider.page({} as never, 'docs', '/missing', { locale: 'en' })

    expect(unwrap(wrapped)).toBeNull()
    expect(cache(wrapped).tags).toEqual(['collection:docs'])
  })

  it('forwards list pagination and indexed sort to Convex', async () => {
    const wrapped = await contentProvider.query(
      {} as never,
      toContentProviderQuery({
        collection: 'docs',
        limit: 10,
        sort: [{ lastPublishedAt: -1 }],
        only: ['title', 'path'],
      }),
    )

    expect(unwrap(wrapped)).toMatchObject({
      result: [
        { title: 'Launch Checklist', path: '/docs/workflows/launch-checklist' },
        { title: 'Content Routing', path: '/docs/workflows/content-routing' },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
    expect(lastCall()).toEqual({
      operation: 'list',
      args: {
        collection: 'docs',
        locale: 'en',
        limit: 10,
        cursor: undefined,
        sort: 'lastPublishedAt:desc',
      },
    })
  })

  it('uses runtime content default locale instead of hardcoding en', async () => {
    await contentProvider.query(
      {
        context: {
          runtimeConfig: {
            public: {
              content: {
                defaultLocale: 'fr',
                locales: ['fr', 'en'],
              },
            },
          },
        },
      } as never,
      toContentProviderQuery({
        collection: 'docs',
        limit: 3,
      }),
    )

    expect(lastCall()).toEqual({
      operation: 'list',
      args: {
        collection: 'docs',
        locale: 'fr',
        limit: 3,
        cursor: undefined,
      },
    })
  })

  it('uses runtime default locale across public provider surfaces without explicit locale', async () => {
    const event = {
      context: {
        runtimeConfig: {
          public: {
            ginkoCms: {
              defaultLocale: 'fr',
            },
          },
        },
      },
    } as never

    await contentProvider.page(event, 'docs', '/docs/workflows/content-routing')
    expect(lastCall()).toMatchObject({
      operation: 'page',
      args: { collection: 'docs', locale: 'fr' },
    })

    await contentProvider.routeMeta(event, 'docs', '/docs/workflows/content-routing')
    expect(lastCall()).toMatchObject({
      operation: 'routeMeta',
      args: { collection: 'docs', locale: 'fr' },
    })

    await contentProvider.search(event, { term: 'routing', collection: 'docs' })
    expect(lastCall()).toMatchObject({
      operation: 'search',
      args: { collection: 'docs', locale: 'fr' },
    })

    await contentProvider.siteData(event, { key: 'announcement' })
    expect(lastCall()).toMatchObject({
      operation: 'siteData',
      args: { key: 'announcement', locale: 'fr' },
    })

    await contentProvider.sitemapEntries(event, { include: ['docs'] })
    expect(lastCall()).toMatchObject({
      operation: 'sitemap',
      args: { collection: 'docs', locale: 'fr' },
    })
  })

  it('uses runtime ginkoCms default locale before content and i18n defaults', async () => {
    await contentProvider.query(
      {
        context: {
          runtimeConfig: {
            public: {
              ginkoCms: {
                defaultLocale: 'fr',
              },
              content: {
                defaultLocale: 'en',
              },
              i18n: {
                defaultLocale: 'de',
              },
            },
          },
        },
      } as never,
      toContentProviderQuery({
        collection: 'docs',
        limit: 3,
      }),
    )

    expect(lastCall()).toEqual({
      operation: 'list',
      args: {
        collection: 'docs',
        locale: 'fr',
        limit: 3,
        cursor: undefined,
      },
    })
  })

  it('falls back to runtime i18n default locale when CMS/content defaults are absent', async () => {
    await contentProvider.query(
      {
        context: {
          runtimeConfig: {
            public: {
              i18n: {
                defaultLocale: 'de',
              },
            },
          },
        },
      } as never,
      toContentProviderQuery({
        collection: 'docs',
        limit: 3,
      }),
    )

    expect(lastCall()).toEqual({
      operation: 'list',
      args: {
        collection: 'docs',
        locale: 'de',
        limit: 3,
        cursor: undefined,
      },
    })
  })

  it('uses runtime content default locale when rendering navigation hrefs', async () => {
    const wrapped = await contentProvider.navigation(
      {
        context: {
          runtimeConfig: {
            public: {
              content: {
                defaultLocale: 'fr',
                locales: ['fr', 'en'],
              },
            },
          },
        },
      } as never,
      'docs',
      { locale: 'fr' },
    )

    expect(unwrap(wrapped)).toMatchObject([
      {
        title: 'Routage de contenu',
        path: '/docs/workflows/content-routing',
        children: [
          {
            title: 'Enfant',
            path: '/docs/workflows/content-routing/child',
          },
        ],
      },
    ])
    expect(lastCall()).toEqual({
      operation: 'nav',
      args: {
        collection: 'docs',
        locale: 'fr',
      },
    })
  })

  it('forwards path prefix filters to the public list query instead of filtering in memory', async () => {
    await contentProvider.query(
      {} as never,
      toContentProviderQuery({
        collection: 'docs',
        where: { path: { $prefix: '/docs/workflows' } },
        limit: 5,
      }),
    )

    expect(lastCall()).toEqual({
      operation: 'list',
      args: {
        collection: 'docs',
        locale: 'en',
        limit: 5,
        cursor: undefined,
        pathPrefix: '/docs/workflows',
      },
    })
  })

  it('rejects path prefix queries with public sort because the CMS list endpoint uses path order', async () => {
    await expect(
      contentProvider.query(
        {} as never,
        toContentProviderQuery({
          collection: 'docs',
          where: { path: { $prefix: '/docs/workflows' } },
          sort: [{ lastPublishedAt: -1 }],
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'unsupported_query_shape',
      data: {
        code: 'unsupported_query_shape',
        field: 'sort',
      },
    })
    expect(convexMock.query).not.toHaveBeenCalled()
  })

  it('rejects unsupported list sort instead of sorting in memory', async () => {
    await expect(
      contentProvider.query(
        {} as never,
        toContentProviderQuery({
          collection: 'docs',
          sort: [{ title: 1 }],
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'unsupported_sort',
      data: {
        code: 'unsupported_sort',
        field: 'title',
      },
    })
    expect(convexMock.query).not.toHaveBeenCalled()
  })

  it('returns nav, sitemap, search, search sections, and site data through public queries', async () => {
    expect(unwrap(await contentProvider.navigation({} as never, 'docs', { locale: 'en' }))).toEqual(
      [
        {
          title: 'Content Routing',
          path: '/docs/workflows/content-routing',
          unprefixedPath: '/docs/workflows/content-routing',
          locale: 'en',
          stableId: 'docs-routing',
          ref: 'docs-routing',
          children: [],
        },
      ],
    )

    expect(
      unwrap(
        await contentProvider.sitemapEntries({} as never, {
          locale: 'en',
          include: ['docs'],
        }),
      ),
    ).toEqual([
      {
        _sitemap: 'en',
        loc: '/docs/workflows/content-routing',
        alternatives: [
          {
            hreflang: 'de-DE',
            href: '/de/dokumentation/inhaltsrouting',
          },
        ],
        lastmod: '2026-05-05T00:00:00.000Z',
      },
    ])

    expect(
      unwrap(
        await contentProvider.search({} as never, {
          term: 'routing',
          locale: 'en',
          collection: 'docs',
        }),
      ),
    ).toEqual([
      {
        path: '/docs/workflows/content-routing',
        title: 'Content Routing',
        excerpt: 'Route content across locales.',
        score: 1,
        locale: 'en',
        collection: 'docs',
      },
    ])

    expect(
      unwrap(await contentProvider.siteData({} as never, { key: 'announcement', locale: 'en' })),
    ).toEqual({
      key: 'announcement',
      locale: 'en',
      data: { message: 'Live now' },
      updatedAt: 1_780_000_100_000,
    })
  })

  it('returns an empty body for YAML/data entries with no Markdown body fields', async () => {
    const wrapped = await contentProvider.query(
      {} as never,
      toContentProviderQuery({
        collection: 'authors',
        first: true,
      }),
    )

    expect(unwrap(wrapped)).toMatchObject({
      result: {
        type: 'yaml',
        title: 'Emily',
        body: {
          type: 'root',
          props: {},
          children: [],
        },
      },
    })
  })
})
