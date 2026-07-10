import { toContentProviderQuery } from '@lupinum/ginko-content/provider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// §10.9 / "Ginko tests": event-backed `nuxt-provider.mjs` request paths must route the
// supplied H3 event through exactly one anonymous `serverConvex` caller so transport/auth
// stay library-owned, while genuinely eventless build/CLI paths keep a direct
// `ConvexHttpClient`. These two mocks let us observe which one `callConvexFunction` picks
// without going through the `__setGinkoNuxtProviderClientFactoryForTests` test seam (which
// would otherwise short-circuit both branches).
const serverConvexMock = vi.hoisted(() => vi.fn())
const convexHttpClientMock = vi.hoisted(() =>
  vi.fn(function ConvexHttpClient() {
    return { query: vi.fn(async () => ({ key: 'announcement', data: null })) }
  }),
)

vi.mock('better-convex-nuxt/server', () => ({
  serverConvex: serverConvexMock,
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: convexHttpClientMock,
}))

type ContentProvider = {
  siteData: (event: unknown, request?: Record<string, unknown>) => Promise<unknown>
  query: (event: unknown, request: ReturnType<typeof toContentProviderQuery>) => Promise<unknown>
}

let contentProvider: ContentProvider

function containsValue(root: unknown, expected: unknown): boolean {
  const seen = new Set<object>()
  const visit = (value: unknown): boolean => {
    if (value === expected) return true
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false
    if (seen.has(value)) return false
    seen.add(value)
    return Object.getOwnPropertyNames(value).some((key) => visit(Reflect.get(value, key)))
  }
  return visit(root)
}

describe('nuxt-provider.mjs event-backed serverConvex adoption', () => {
  beforeEach(async () => {
    vi.resetModules()
    serverConvexMock.mockClear()
    convexHttpClientMock.mockClear()
    process.env.NUXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud'
    process.env.GINKO_CONTENT_PROVIDER_SITE = 'cms-provider-fixture'
    ;({ contentProvider } = (await import('../../packages/cms/src/nuxt-provider.mjs')) as {
      contentProvider: ContentProvider
    })
  })

  afterEach(() => {
    delete process.env.NUXT_PUBLIC_CONVEX_URL
    delete process.env.GINKO_CONTENT_PROVIDER_SITE
  })

  it('routes a supplied H3 event through exactly one anonymous serverConvex caller', async () => {
    const query = vi.fn(async () => ({
      key: 'announcement',
      locale: { requested: 'en' },
      data: { message: 'hi' },
      updatedAt: 1,
    }))
    serverConvexMock.mockReturnValue({ query })

    const event = { context: { runtimeConfig: { public: {} } } }
    await contentProvider.siteData(event, { key: 'announcement', locale: 'en' })

    expect(serverConvexMock).toHaveBeenCalledTimes(1)
    expect(serverConvexMock).toHaveBeenCalledWith(event, { auth: 'none' })
    expect(query).toHaveBeenCalledTimes(1)
    expect(convexHttpClientMock).not.toHaveBeenCalled()
  })

  it('reuses one caller for page and concurrent asset queries in the same request', async () => {
    const query = vi.fn(async (reference: unknown) => {
      const path = String((reference as Record<symbol, unknown>)[Symbol.for('functionName')])
      if (path.endsWith('page')) {
        return {
          status: 'found',
          page: {
            id: 'entry-1',
            collection: 'pages',
            stableId: 'entry-1',
            title: 'Home',
            updatedAt: 1,
            locale: { requested: 'en', resolved: 'en' },
            route: { path: '/', locale: 'en' },
            data: {
              heroAsset: 'abcdefghijklmnopqrst',
              logoAsset: 'bcdefghijklmnopqrstu',
            },
            bodyAst: { type: 'root', props: {}, children: [] },
          },
        }
      }
      return 'https://cdn.example.test/hero.png'
    })
    serverConvexMock.mockReturnValue({ query })

    const event = { context: { runtimeConfig: { public: {} } } }
    const request = toContentProviderQuery({ collection: 'pages' })
    request.plan.variantSelector = {
      by: 'route',
      requestedLocale: 'en',
      candidates: [{ locale: 'en', contentPath: '/' }],
    }
    await contentProvider.query(event, request)

    expect(serverConvexMock).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('keeps a direct anonymous ConvexHttpClient for genuinely eventless build/CLI paths', async () => {
    await contentProvider.siteData(undefined, { key: 'announcement', locale: 'en' })

    expect(convexHttpClientMock).toHaveBeenCalledTimes(1)
    expect(convexHttpClientMock).toHaveBeenCalledWith('https://example.convex.cloud')
    expect(serverConvexMock).not.toHaveBeenCalled()
  })

  it('never exposes opaque cause data through provider errors', async () => {
    const secret = 'opaque-cause-secret'
    serverConvexMock.mockReturnValue({
      query: vi.fn(async () => {
        throw Object.assign(new Error('Public failure'), {
          data: { code: 'PUBLIC_FAILURE', operation: 'spoofed-operation' },
          cause: { data: { token: secret } },
        })
      }),
    })

    const event = { context: { runtimeConfig: { public: {} } } }
    let thrown: unknown
    try {
      await contentProvider.siteData(event, { key: 'announcement', locale: 'en' })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(containsValue(thrown, secret)).toBe(false)
    expect(JSON.stringify(thrown)).not.toContain(secret)
    expect(thrown).toMatchObject({
      data: { code: 'PUBLIC_FAILURE', operation: 'siteData' },
    })
  })
})
