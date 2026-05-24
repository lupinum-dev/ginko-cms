import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const convexMock = vi.hoisted(() => {
  const calls: Array<{ operation: string; args: unknown }> = []
  const query = vi.fn(async (ref: Record<symbol, string>, args: unknown) => {
    const functionName =
      ref[Symbol.for('functionName')] ??
      Object.getOwnPropertySymbols(ref)
        .map((symbol) => ref[symbol])
        .find((value): value is string => typeof value === 'string') ??
      ''
    const operation = functionName.split(':').pop() ?? ''
    calls.push({ operation, args })
    if (operation === 'list') {
      const input = args as { sort?: string }
      const entries = [
        {
          id: 'entry-docs-routing',
          collection: 'docs',
          revision: 'docs-routing',
          title: 'Content Routing',
          data: {
            description: 'Route content across locales.',
            bodyAst: {
              type: 'root',
              props: {},
              children: [
                {
                  type: 'element',
                  tag: 'p',
                  props: {},
                  children: [{ type: 'text', value: 'Content routing body.' }],
                },
              ],
            },
          },
          locale: { requested: 'en', resolved: 'en' },
          route: { path: '/docs/workflows/content-routing', slug: 'content-routing' },
          translations: [],
          updatedAt: 100,
          publishedAt: 90,
        },
        {
          id: 'entry-docs-launch',
          collection: 'docs',
          revision: 'docs-launch',
          title: 'Launch Checklist',
          data: {
            description: 'Ship with confidence.',
            bodyAst: {
              type: 'root',
              props: {},
              children: [
                {
                  type: 'element',
                  tag: 'p',
                  props: {},
                  children: [{ type: 'text', value: 'Launch checklist body.' }],
                },
              ],
            },
            date: '2026-02-01',
          },
          locale: { requested: 'en', resolved: 'en' },
          route: { path: '/docs/workflows/launch-checklist', slug: 'launch-checklist' },
          translations: [],
          updatedAt: 110,
          publishedAt: 95,
        },
      ]
      return {
        entries: input.sort === 'lastPublishedAt:desc' ? entries.toReversed() : entries,
        pageInfo: { hasNextPage: false, endCursor: null },
      }
    }
    if (operation === 'page' || operation === 'routeMeta') {
      const input = args as { locale?: string; path?: string }
      if (operation === 'page' && input.path === '/docs/asset') {
        return {
          status: 'found',
          page: {
            id: 'entry-docs-asset',
            collection: 'docs',
            revision: 'docs-asset',
            title: 'Asset page',
            data: {
              description: 'Asset backed image.',
              image: {
                src: 'j9792htrrg467xmj91mhjrk629874bad',
                alt: 'Asset alt',
              },
              bodyAst: {
                type: 'root',
                props: {},
                children: [
                  {
                    type: 'element',
                    tag: 'img',
                    props: {
                      src: 'j9792htrrg467xmj91mhjrk629874bad',
                      alt: 'Asset alt',
                    },
                    children: [],
                  },
                ],
              },
            },
            locale: { requested: input.locale || 'en', resolved: input.locale || 'en' },
            route: { path: '/docs/asset', slug: 'asset' },
            translations: [],
            updatedAt: 100,
            publishedAt: 90,
          },
        }
      }
      const isGerman = input.locale === 'de'
      return {
        status: 'found',
        page: {
          id: 'entry-docs-routing',
          collection: 'docs',
          revision: 'docs-routing',
          title: isGerman ? 'Content Routing DE' : 'Content Routing',
          data:
            operation === 'routeMeta'
              ? {}
              : {
                  description: 'Route content across locales.',
                  bodyAst: {
                    type: 'root',
                    props: {},
                    children: [
                      {
                        type: 'element',
                        tag: 'p',
                        props: {},
                        children: [{ type: 'text', value: 'Content routing body.' }],
                      },
                    ],
                  },
                },
          locale: { requested: input.locale || 'en', resolved: input.locale || 'en' },
          route: {
            path: isGerman
              ? '/dokumentation/arbeitsablaeufe/content-routing'
              : '/docs/workflows/content-routing',
            href: isGerman
              ? '/de/dokumentation/arbeitsablaeufe/content-routing'
              : '/docs/workflows/content-routing',
            slug: 'content-routing',
          },
          translations: [
            {
              locale: 'de',
              status: 'published',
              route: {
                path: '/dokumentation/arbeitsablaeufe/content-routing',
                href: '/de/dokumentation/arbeitsablaeufe/content-routing',
                slug: 'content-routing',
              },
            },
            {
              locale: 'en',
              status: 'published',
              route: {
                path: '/docs/workflows/content-routing',
                href: '/docs/workflows/content-routing',
                slug: 'content-routing',
              },
            },
          ],
          updatedAt: 100,
          publishedAt: 90,
        },
      }
    }
    if (operation === 'nav') {
      return {
        tree: [
          {
            entry: {
              id: 'entry-docs-routing',
              revision: 'docs-routing',
              title: 'Content Routing',
              description: 'Route content across locales.',
              route: {
                path: '/docs/workflows/content-routing',
                slug: 'content-routing',
                locale: 'en',
              },
            },
            children: [],
          },
        ],
      }
    }
    if (operation === 'surround') {
      return {
        previous: [
          {
            title: 'Launch Checklist',
            route: { path: '/docs/workflows/launch-checklist', slug: 'launch-checklist' },
          },
        ],
        next: [
          {
            title: 'Sitemap and SEO',
            route: { path: '/docs/workflows/sitemap-and-seo', slug: 'sitemap-and-seo' },
          },
        ],
      }
    }
    if (operation === 'search') {
      return {
        results: [
          {
            id: 'entry-docs-routing',
            collection: 'docs',
            revision: 'docs-routing',
            title: 'Content Routing',
            snippet: 'Route content across locales.',
            data: {
              description: 'Route content across locales.',
              bodyAst: {
                type: 'root',
                props: {},
                children: [
                  {
                    type: 'element',
                    tag: 'p',
                    props: {},
                    children: [{ type: 'text', value: 'Content routing body.' }],
                  },
                ],
              },
            },
            locale: { requested: 'en', resolved: 'en' },
            route: { path: '/docs/workflows/content-routing', slug: 'content-routing' },
            translations: [],
            updatedAt: 100,
            publishedAt: 90,
          },
        ],
      }
    }
    if (operation === 'siteData') {
      return {
        key: 'announcement',
        locale: { requested: 'en', resolved: 'en' },
        data: { message: 'Live now' },
        updatedAt: 120,
      }
    }
    if (operation === 'sitemap') {
      return {
        urls: [
          {
            route: {
              path: '/docs/workflows/content-routing',
              slug: 'content-routing',
              locale: 'en',
            },
            alternates: [
              {
                locale: 'de',
                hreflang: 'de-DE',
                route: {
                  path: '/dokumentation/arbeitsablaeufe/content-routing',
                  slug: 'content-routing',
                },
              },
            ],
          },
        ],
      }
    }
    if (operation === 'getAssetUrl') {
      const input = args as { assetId: string }
      return input.assetId === 'j9792htrrg467xmj91mhjrk629874bad'
        ? 'https://example.convex.cloud/api/storage/asset.png'
        : null
    }
    throw new Error(`Unhandled test operation: ${operation}`)
  })

  return { calls, query }
})

let contentProvider: any
let setClientFactoryForTests: any

const unwrap = (value: any) => (value?.__ginkoContentProviderResult ? value.data : value)
const cache = (value: any) => value?.cache

describe('Ginko Nuxt content provider', () => {
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

  it('declares only the portable query capabilities it actually supports', () => {
    expect(contentProvider.capabilities.query).toMatchObject({
      operators: ['$eq', '$ne', '$in', '$contains', '$icontains', '$prefix', '$and', '$or'],
      limit: true,
      skip: false,
      count: false,
    })
  })

  it('rejects unsupported query shapes before calling Convex', async () => {
    await expect(
      contentProvider.query({} as never, {
        collection: 'docs',
        where: { title: 'Hello' },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'unsupported_query_shape',
      data: {
        code: 'unsupported_query_shape',
        field: 'where',
      },
    })

    await expect(
      contentProvider.query({} as never, {
        collection: 'docs',
        skip: 10,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'unsupported_query_shape',
      data: {
        code: 'unsupported_query_shape',
        field: 'skip',
      },
    })
  })

  it('supports the portable Ginko list subset used by reference apps', async () => {
    const wrapped = await contentProvider.query({} as never, {
      collection: 'docs',
      where: [{ _draft: { $ne: true } }, { _locale: 'en' }],
      only: ['title', 'description', '_path'],
    })
    const result = unwrap(wrapped)

    expect(result).toMatchObject({
      result: [
        {
          title: 'Content Routing',
          description: 'Route content across locales.',
          _path: '/docs/workflows/content-routing',
        },
        {
          title: 'Launch Checklist',
          description: 'Ship with confidence.',
          _path: '/docs/workflows/launch-checklist',
        },
      ],
    })
    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'list',
      args: {
        collection: 'docs',
        locale: 'en',
        limit: undefined,
        cursor: undefined,
      },
    })
    expect(cache(wrapped)).toMatchObject({
      tags: expect.arrayContaining([
        'collection:docs',
        'entry:docs:docs-routing',
        'entry:docs:docs-launch',
        'route:/docs/workflows/content-routing',
      ]),
      paths: expect.arrayContaining([
        '/docs/workflows/content-routing',
        '/docs/workflows/launch-checklist',
      ]),
    })
  })

  it('forwards supported public list sort to Convex instead of sorting in memory', async () => {
    const wrapped = await contentProvider.query({} as never, {
      collection: 'docs',
      sort: [{ lastPublishedAt: -1 }],
    })

    expect(unwrap(wrapped).result.map((entry: { title: string }) => entry.title)).toEqual([
      'Launch Checklist',
      'Content Routing',
    ])
    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'list',
      args: {
        collection: 'docs',
        locale: 'en',
        limit: undefined,
        cursor: undefined,
        sort: 'lastPublishedAt:desc',
      },
    })
  })

  it('resolves Ginko route-variant queries through the page projection', async () => {
    const wrapped = await contentProvider.query({} as never, {
      collection: 'docs',
      first: true,
      resolveVariant: {
        path: '/docs/workflows/content-routing',
        locale: 'en',
        fallback: [],
      },
      only: ['title', '_path', 'localePaths', '_variantPaths'],
    })
    const result = unwrap(wrapped)

    expect(result).toEqual({
      result: {
        title: 'Content Routing',
        _path: '/docs/workflows/content-routing',
        localePaths: {
          en: {
            path: '/docs/workflows/content-routing',
            translated: true,
          },
          de: {
            path: '/de/dokumentation/arbeitsablaeufe/content-routing',
            translated: true,
          },
        },
        _variantPaths: {
          en: '/docs/workflows/content-routing',
          de: '/dokumentation/arbeitsablaeufe/content-routing',
        },
      },
    })
    expect(cache(wrapped).tags).toEqual(
      expect.arrayContaining([
        'collection:docs',
        'entry:docs:docs-routing',
        'entry:docs:docs-routing:en',
        'route:/docs/workflows/content-routing',
      ]),
    )
    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'page',
      args: {
        collection: 'docs',
        locale: 'en',
        fallback: [],
        path: '/docs/workflows/content-routing',
      },
    })
  })

  it('resolves object-style route and ref variant selectors', async () => {
    await contentProvider.query({} as never, {
      collection: 'docs',
      first: true,
      resolveVariant: {
        by: 'route',
        value: '/docs/workflows/content-routing',
        locale: 'en',
      },
      only: ['title'],
    })

    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'page',
      args: {
        collection: 'docs',
        locale: 'en',
        path: '/docs/workflows/content-routing',
      },
    })

    const refResult = unwrap(
      await contentProvider.query({} as never, {
        collection: 'docs',
        first: true,
        resolveVariant: {
          by: 'ref',
          value: 'docs-routing',
          locale: 'en',
        },
        only: ['title', 'resolved'],
      }),
    )
    expect(refResult).toMatchObject({
      result: {
        title: 'Content Routing',
        resolved: expect.objectContaining({
          requestedRoute: 'docs-routing',
        }),
      },
    })
    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'page',
      args: {
        collection: 'docs',
        locale: 'en',
        ref: 'docs-routing',
      },
    })
  })

  it('resolves direct ref route-variant selectors from ginko-content', async () => {
    const wrapped = await contentProvider.query({} as never, {
      collection: 'docs',
      first: true,
      resolveVariant: {
        ref: 'docs-routing',
        locale: 'en',
      },
      only: ['title', 'resolved'],
    })

    expect(unwrap(wrapped)).toMatchObject({
      result: {
        title: 'Content Routing',
        resolved: expect.objectContaining({
          requestedRoute: 'docs-routing',
        }),
      },
    })
    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'page',
      args: {
        collection: 'docs',
        locale: 'en',
        ref: 'docs-routing',
      },
    })
  })

  it('passes explicit fallback policy through page and route metadata reads', async () => {
    await contentProvider.page({} as never, 'docs', '/docs/workflows/content-routing', {
      locale: 'de-CH',
      resolveLocale: {
        locale: 'de-CH',
        fallback: ['de', 'en'],
      },
    })

    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'page',
      args: {
        collection: 'docs',
        locale: 'de-CH',
        fallback: ['de', 'en'],
        path: '/docs/workflows/content-routing',
      },
    })

    await contentProvider.routeMeta({} as never, 'docs', '/docs/workflows/content-routing', {
      locale: 'de-CH',
      fallback: false,
    })

    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'routeMeta',
      args: {
        collection: 'docs',
        locale: 'de-CH',
        fallback: false,
        path: '/docs/workflows/content-routing',
      },
    })
  })

  it('keeps requestedRoute separate from resolved localized route metadata', async () => {
    const wrappedPage = await contentProvider.page(
      {} as never,
      'docs',
      '/de/dokumentation/arbeitsablaeufe/content-routing?preview=1',
      { locale: 'de' },
    )

    expect(unwrap(wrappedPage)).toMatchObject({
      locale: 'de',
      canonicalPath: '/dokumentation/arbeitsablaeufe/content-routing',
      path: '/de/dokumentation/arbeitsablaeufe/content-routing',
      resolved: {
        locale: 'de',
        requestedLocale: 'de',
        fallback: false,
        path: '/de/dokumentation/arbeitsablaeufe/content-routing',
        requestedRoute: '/de/dokumentation/arbeitsablaeufe/content-routing?preview=1',
      },
    })
    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'page',
      args: {
        collection: 'docs',
        locale: 'de',
        path: '/dokumentation/arbeitsablaeufe/content-routing',
      },
    })
    expect(cache(wrappedPage)).toMatchObject({
      tags: expect.arrayContaining(['route:/dokumentation/arbeitsablaeufe/content-routing']),
      paths: ['/dokumentation/arbeitsablaeufe/content-routing'],
    })
  })

  it('uses stored route href for non-English default-locale routes without adding a prefix', async () => {
    convexMock.query.mockResolvedValueOnce({
      status: 'found',
      page: {
        id: 'entry-blog-de',
        collection: 'blog',
        revision: 'blog-de',
        title: 'Default-Locale-Beweis',
        data: {
          description: 'German default locale route.',
          bodyAst: {
            type: 'root',
            props: {},
            children: [
              {
                type: 'element',
                tag: 'p',
                props: {},
                children: [{ type: 'text', value: 'German default locale route.' }],
              },
            ],
          },
        },
        locale: { requested: 'de', resolved: 'de' },
        route: {
          locale: 'de',
          path: '/blog/default-locale-proof',
          href: '/blog/default-locale-proof',
          slug: 'default-locale-proof',
        },
        translations: [],
        updatedAt: 100,
        publishedAt: 90,
      },
    })

    const wrappedPage = await contentProvider.page(
      {} as never,
      'blog',
      '/blog/default-locale-proof',
      { locale: 'de' },
    )

    expect(unwrap(wrappedPage)).toMatchObject({
      locale: 'de',
      canonicalPath: '/blog/default-locale-proof',
      path: '/blog/default-locale-proof',
      resolved: {
        path: '/blog/default-locale-proof',
      },
    })
  })

  it('fails loudly instead of treating raw body data as parsed MDC', async () => {
    convexMock.query.mockResolvedValueOnce({
      status: 'found',
      page: {
        id: 'entry-old-row',
        collection: 'docs',
        revision: 'old-row',
        title: 'Old Row',
        data: {
          description: 'Missing bodyAst should not be treated as parsed content.',
          bodyMdc: '# Legacy raw body',
        },
        locale: { requested: 'en', resolved: 'en' },
        route: { path: '/docs/old-row', slug: 'old-row' },
        translations: [],
        updatedAt: 100,
        publishedAt: 90,
      },
    })

    await expect(
      contentProvider.page({} as never, 'docs', '/docs/old-row', { locale: 'en' }),
    ).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'provider_body_ast_missing',
      data: {
        code: 'provider_body_ast_missing',
      },
    })
  })

  it('resolves Ginko navigation queries with the normalized locale scope', async () => {
    const wrapped = await contentProvider.navigationQuery({} as never, {
      collection: 'docs',
      where: [{ _draft: { $ne: true } }, { _locale: 'de' }],
      sort: [{ _stem: 1, $numeric: true }],
    })

    expect(cache(wrapped).tags).toEqual(expect.arrayContaining(['collection:docs', 'nav:docs:de']))
    expect(convexMock.calls.at(-1)).toEqual({
      operation: 'nav',
      args: {
        collection: 'docs',
        locale: 'de',
      },
    })
  })

  it('preserves unsupported operator errors inside rejected where filters', async () => {
    await expect(
      contentProvider.query({} as never, {
        collection: 'docs',
        where: { title: { $near: 'routing' } },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'unsupported_query_operator',
      data: {
        code: 'unsupported_query_operator',
        operator: '$near',
      },
    })
  })

  it('rejects sitemap exclude filters instead of silently broadening output', async () => {
    await expect(
      contentProvider.sitemapEntries({} as never, {
        exclude: ['versions'],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'unsupported_query_shape',
      data: {
        code: 'unsupported_query_shape',
        field: 'exclude',
      },
    })
  })

  it('maps production Convex projection reads into the neutral content provider shape', async () => {
    const wrappedPage = await contentProvider.page(
      {} as never,
      'docs',
      '/en/docs/workflows/content-routing',
      { locale: 'en' },
    )
    const page = unwrap(wrappedPage)
    expect(page).toMatchObject({
      _source: 'ginko',
      _collection: 'docs',
      _path: '/docs/workflows/content-routing',
      title: 'Content Routing',
      description: 'Route content across locales.',
      locale: 'en',
      path: '/docs/workflows/content-routing',
      canonicalPath: '/docs/workflows/content-routing',
      defaultLocale: 'en',
      ref: 'docs-routing',
      stem: 'docs/workflows/content-routing',
      extension: 'md',
      _stem: 'docs/workflows/content-routing',
      _availableLocales: ['en', 'de'],
      localePaths: {
        en: {
          path: '/docs/workflows/content-routing',
          translated: true,
        },
        de: {
          path: '/de/dokumentation/arbeitsablaeufe/content-routing',
          translated: true,
        },
      },
      variants: [
        {
          locale: 'en',
          path: '/docs/workflows/content-routing',
          canonicalPath: '/docs/workflows/content-routing',
        },
        {
          locale: 'de',
          path: '/de/dokumentation/arbeitsablaeufe/content-routing',
          canonicalPath: '/dokumentation/arbeitsablaeufe/content-routing',
        },
      ],
      resolved: {
        locale: 'en',
        requestedLocale: 'en',
        fallback: false,
        path: '/docs/workflows/content-routing',
        requestedRoute: '/en/docs/workflows/content-routing',
        availableLocales: ['en', 'de'],
      },
    })
    expect(cache(wrappedPage)).toMatchObject({
      tags: expect.arrayContaining([
        'collection:docs',
        'entry:docs:docs-routing',
        'entry:docs:docs-routing:en',
        'route:/docs/workflows/content-routing',
      ]),
      paths: ['/docs/workflows/content-routing'],
    })

    const wrappedRouteMeta = await contentProvider.routeMeta(
      {} as never,
      'docs',
      '/docs/workflows/content-routing',
      {
        locale: 'en',
      },
    )
    expect(unwrap(wrappedRouteMeta)).toMatchObject({
      path: '/docs/workflows/content-routing',
      canonicalPath: '/docs/workflows/content-routing',
      locale: 'en',
      defaultLocale: 'en',
      localePaths: {
        en: {
          path: '/docs/workflows/content-routing',
          translated: true,
        },
      },
    })
    expect(cache(wrappedRouteMeta).tags).toEqual(
      expect.arrayContaining(['collection:docs', 'route:/docs/workflows/content-routing']),
    )
    expect(unwrap(wrappedRouteMeta)).not.toHaveProperty('body')

    const list = unwrap(
      await contentProvider.query({} as never, {
        collection: 'docs',
        limit: 5,
        resolveLocale: { locale: 'en' },
      }),
    )
    expect(list).toMatchObject({
      result: [
        expect.objectContaining({
          title: 'Content Routing',
          _source: 'ginko',
        }),
        expect.objectContaining({
          title: 'Launch Checklist',
          _source: 'ginko',
        }),
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    })

    const wrappedNav = await contentProvider.navigation({} as never, 'docs', { locale: 'en' })
    const nav = unwrap(wrappedNav)
    expect(nav).toEqual([
      {
        ref: 'docs-routing',
        stableId: 'docs-routing',
        title: 'Content Routing',
        _path: '/docs/workflows/content-routing',
        path: '/docs/workflows/content-routing',
        _locale: 'en',
        children: [],
      },
    ])
    expect(cache(wrappedNav).tags).toEqual(
      expect.arrayContaining(['collection:docs', 'nav:docs:en']),
    )

    expect(unwrap(await contentProvider.navigation({} as never, 'docs', ['description']))).toEqual([
      expect.objectContaining({
        title: 'Content Routing',
        description: 'Route content across locales.',
      }),
    ])

    const wrappedSurround = await contentProvider.surroundings(
      {} as never,
      'docs',
      '/docs/workflows/content-routing',
      {
        locale: 'en',
      },
    )
    const surround = unwrap(wrappedSurround)
    expect(surround).toEqual([
      {
        title: 'Launch Checklist',
        path: '/docs/workflows/launch-checklist',
        _path: '/docs/workflows/launch-checklist',
      },
      {
        title: 'Sitemap and SEO',
        path: '/docs/workflows/sitemap-and-seo',
        _path: '/docs/workflows/sitemap-and-seo',
      },
    ])
    expect(cache(wrappedSurround).tags).toEqual(['collection:docs'])

    const wrappedSearch = await contentProvider.search({} as never, {
      term: 'routing',
      locale: 'en',
      collection: 'docs',
    })
    expect(unwrap(wrappedSearch)).toEqual([
      expect.objectContaining({
        path: '/docs/workflows/content-routing',
        title: 'Content Routing',
      }),
    ])
    expect(cache(wrappedSearch).tags).toEqual(['search:en'])

    const wrappedSiteData = await contentProvider.siteData({} as never, {
      key: 'announcement',
      locale: 'en',
    })
    expect(unwrap(wrappedSiteData)).toEqual({
      key: 'announcement',
      locale: 'en',
      data: { message: 'Live now' },
      updatedAt: 120,
    })
    expect(cache(wrappedSiteData).tags).toEqual(['site-data:announcement:en'])

    const wrappedSitemap = await contentProvider.sitemapEntries({} as never, { include: ['docs'] })
    expect(unwrap(wrappedSitemap)).toEqual([
      {
        _sitemap: 'en',
        loc: '/docs/workflows/content-routing',
        lastmod: undefined,
        alternatives: [
          {
            hreflang: 'de-DE',
            href: '/de/dokumentation/arbeitsablaeufe/content-routing',
          },
        ],
      },
    ])
    expect(cache(wrappedSitemap).tags).toEqual(['sitemap'])
    expect(convexMock.calls.map((call) => call.operation)).toEqual([
      'page',
      'routeMeta',
      'list',
      'nav',
      'nav',
      'surround',
      'search',
      'siteData',
      'sitemap',
    ])
  })

  it('resolves published CMS asset ids before returning provider content', async () => {
    const wrappedPage = await contentProvider.page({} as never, 'docs', '/docs/asset', {
      locale: 'en',
    })
    const page = unwrap(wrappedPage)

    expect(page.image).toEqual({
      src: 'https://example.convex.cloud/api/storage/asset.png',
      alt: 'Asset alt',
    })
    expect(page.body.children[0].props.src).toBe(
      'https://example.convex.cloud/api/storage/asset.png',
    )
    expect(convexMock.calls).toEqual(
      expect.arrayContaining([
        {
          operation: 'getAssetUrl',
          args: { assetId: 'j9792htrrg467xmj91mhjrk629874bad' },
        },
      ]),
    )
  })

  it('fails loudly when required live provider environment is missing', async () => {
    const previousPublicConvexUrl = process.env.NUXT_PUBLIC_CONVEX_URL
    const previousConvexUrl = process.env.CONVEX_URL
    delete process.env.NUXT_PUBLIC_CONVEX_URL
    delete process.env.CONVEX_URL
    try {
      await expect(
        contentProvider.query({} as never, {
          collection: 'docs',
          limit: 1,
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        statusMessage: 'provider_config_missing',
        data: {
          code: 'provider_config_missing',
          env: 'NUXT_PUBLIC_CONVEX_URL',
        },
      })
    } finally {
      if (previousPublicConvexUrl === undefined) {
        delete process.env.NUXT_PUBLIC_CONVEX_URL
      } else {
        process.env.NUXT_PUBLIC_CONVEX_URL = previousPublicConvexUrl
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
    }
  })
})
