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
}

let contentProvider: ContentProvider

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

  it('keeps a direct anonymous ConvexHttpClient for genuinely eventless build/CLI paths', async () => {
    await contentProvider.siteData(undefined, { key: 'announcement', locale: 'en' })

    expect(convexHttpClientMock).toHaveBeenCalledTimes(1)
    expect(convexHttpClientMock).toHaveBeenCalledWith('https://example.convex.cloud')
    expect(serverConvexMock).not.toHaveBeenCalled()
  })
})
