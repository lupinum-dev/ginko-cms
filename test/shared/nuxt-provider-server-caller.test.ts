import { toContentProviderQuery } from '@lupinum/ginko-content/provider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// §10.9 / "Ginko tests": event-backed `nuxt-provider.mjs` request paths must route the
// supplied H3 event through exactly one anonymous `serverConvex` caller so transport/auth
// stay library-owned. The bound H3 provider has no eventless transport path.
const serverConvexMock = vi.hoisted(() => vi.fn())

vi.mock('better-convex-nuxt/server', () => ({
  serverConvex: serverConvexMock,
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
    process.env.NUXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud'
    ;({ contentProvider } = (await import('../../packages/cms/src/nuxt-provider.ts')) as {
      contentProvider: ContentProvider
    })
  })

  afterEach(() => {
    delete process.env.NUXT_PUBLIC_CONVEX_URL
  })

  it('routes a supplied H3 event through exactly one anonymous serverConvex caller', async () => {
    const query = vi.fn(async () => ({
      key: 'announcement',
      locale: {
        requested: 'en',
        resolved: 'en',
        policy: 'strict',
        fallbacks: { fields: [] },
      },
      data: { message: 'hi' },
    }))
    serverConvexMock.mockReturnValue({ query })

    const event = { context: { runtimeConfig: { public: {} } } }
    await contentProvider.siteData(event, { key: 'announcement', locale: 'en' })

    expect(serverConvexMock).toHaveBeenCalledTimes(1)
    expect(serverConvexMock).toHaveBeenCalledWith(event, { auth: 'none' })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('shares one request caller across concurrent provider operations', async () => {
    const query = vi.fn(async () => ({
      key: 'announcement',
      locale: {
        requested: 'en',
        resolved: 'en',
        policy: 'strict',
        fallbacks: { fields: [] },
      },
      data: null,
    }))
    serverConvexMock.mockReturnValue({ query })

    const event = { context: { runtimeConfig: { public: {} } } }
    await Promise.all([
      contentProvider.siteData(event, { key: 'announcement', locale: 'en' }),
      contentProvider.siteData(event, { key: 'announcement', locale: 'en' }),
    ])

    expect(serverConvexMock).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('reuses one caller without issuing arbitrary asset-id queries', async () => {
    const query = vi.fn(async (reference: unknown) => {
      const path = String((reference as Record<symbol, unknown>)[Symbol.for('functionName')])
      if (path.endsWith('page')) {
        return {
          status: 'found',
          page: {
            id: 'entry-1',
            collection: 'pages',
            stableId: 'entry-1',
            assetFacts: [
              {
                fieldPath: 'data.heroAsset',
                assetId: 'abcdefghijklmnopqrst',
                url: 'https://assets.example/hero.png',
                expiresAt: null,
                mediaType: 'image/png',
                bytes: 68,
                sha256: '0'.repeat(64),
              },
            ],
            title: 'Home',
            revision: 'revision-1',
            updatedAt: '2026-05-28T20:28:20.000Z',
            publishedAt: '2026-05-28T20:28:20.000Z',
            locale: {
              requested: 'en',
              resolved: 'en',
              policy: 'strict',
              fallbacks: { fields: [] },
            },
            route: { path: '/', slug: '', locale: 'en', source: 'published' },
            translations: [],
            data: {
              heroAsset: 'abcdefghijklmnopqrst',
              logoAsset: 'bcdefghijklmnopqrstu',
            },
            bodyAst: { type: 'root', props: {}, children: [] },
          },
          collection: 'pages',
          locale: {
            requested: 'en',
            resolved: 'en',
            policy: 'strict',
            fallbacks: { fields: [] },
          },
          breadcrumbs: [],
          seo: { title: 'Home', description: '', canonical: '/', alternates: [], xDefault: null },
        }
      }
      throw new Error(`Unexpected provider query: ${path}`)
    })
    serverConvexMock.mockReturnValue({ query })

    const event = { context: { runtimeConfig: { public: {} } } }
    const request = toContentProviderQuery({ collection: 'pages' })
    request.plan.variantSelector = {
      by: 'route',
      requestedLocale: 'en',
      candidates: [{ locale: 'en', contentPath: '/' }],
    }
    const result = (await contentProvider.query(event, request)) as {
      data: { result: { heroAsset: string; logoAsset: string } }
    }

    expect(serverConvexMock).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledTimes(1)
    expect(result.data.result.heroAsset).toBe('https://assets.example/hero.png')
    expect(result.data.result.logoAsset).toBe('bcdefghijklmnopqrstu')
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
