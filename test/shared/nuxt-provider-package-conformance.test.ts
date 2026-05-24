import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const convexMock = vi.hoisted(() => {
  const calls: Array<{ operation: string; args: unknown }> = []
  const query = vi.fn(async (ref: Record<symbol, string>, args: unknown) => {
    const operation =
      String(ref[Symbol.for('functionName')] ?? '')
        .split(':')
        .pop() ?? ''
    calls.push({ operation, args })

    if (operation === 'page') {
      return {
        status: 'found',
        page: {
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
      }
    }

    if (operation === 'list') {
      return {
        entries: [
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
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      }
    }

    throw new Error(`Unhandled package provider test operation: ${operation}`)
  })

  return { calls, query }
})

let contentProvider: any
let setClientFactoryForTests: any

const unwrap = (value: any) => (value?.__ginkoContentProviderResult ? value.data : value)
const cache = (value: any) => value?.cache

describe('built ginko-cms Nuxt provider package output', () => {
  beforeEach(async () => {
    vi.resetModules()
    convexMock.calls.length = 0
    convexMock.query.mockClear()
    process.env.NUXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud'
    process.env.GINKO_CONTENT_PROVIDER_SITE = 'cms-provider-fixture'
    ;({ contentProvider, __setGinkoNuxtProviderClientFactoryForTests: setClientFactoryForTests } =
      await import('../../packages/cms/dist/nuxt-provider.mjs'))
    setClientFactoryForTests(() => ({ query: convexMock.query }))
  })

  afterEach(() => {
    setClientFactoryForTests?.(undefined)
    delete process.env.NUXT_PUBLIC_CONVEX_URL
    delete process.env.GINKO_CONTENT_PROVIDER_SITE
  })

  it('maps built package page and list reads into the final provider contract shape', async () => {
    const wrappedPage = await contentProvider.page(
      {} as never,
      'docs',
      '/docs/workflows/content-routing',
      { locale: 'en' },
    )
    const page = unwrap(wrappedPage)
    expect(page).toMatchObject({
      _source: 'ginko',
      _collection: 'docs',
      _path: '/docs/workflows/content-routing',
      title: 'Content Routing',
      description: 'Route content across locales.',
      canonicalPath: '/docs/workflows/content-routing',
      localePaths: {
        en: {
          path: '/docs/workflows/content-routing',
          translated: true,
        },
      },
      resolved: {
        locale: 'en',
        requestedLocale: 'en',
        fallback: false,
      },
    })
    expect(cache(wrappedPage).tags).toEqual(
      expect.arrayContaining([
        'collection:docs',
        'entry:docs:docs-routing',
        'entry:docs:docs-routing:en',
        'route:/docs/workflows/content-routing',
      ]),
    )

    const wrappedList = await contentProvider.query({} as never, {
      collection: 'docs',
      resolveLocale: { locale: 'en' },
      limit: 5,
    })
    const list = unwrap(wrappedList)
    expect(list).toMatchObject({
      result: [
        expect.objectContaining({
          _source: 'ginko',
          title: 'Content Routing',
        }),
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
    expect(cache(wrappedList).tags).toEqual(
      expect.arrayContaining(['collection:docs', 'entry:docs:docs-routing']),
    )

    expect(convexMock.calls.map((call) => call.operation)).toEqual(['page', 'list'])
  })
})
