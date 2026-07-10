import { isContentProviderResult, toContentProviderQuery } from '@lupinum/ginko-content/provider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const convexMock = vi.hoisted(() => {
  const calls: Array<{ operation: string; args: unknown }> = []
  const page = {
    id: 'entry-docs-routing',
    stableId: 'docs-routing',
    collection: 'docs',
    revision: 'docs-routing',
    title: 'Content Routing',
    data: {
      description: 'Route content across locales.',
      bodyAst: { type: 'root', props: {}, children: [] },
    },
    locale: { requested: 'en', resolved: 'en' },
    route: { locale: 'en', path: '/docs/content-routing', slug: 'content-routing' },
    translations: [],
    updatedAt: 100,
    publishedAt: 90,
  }
  const query = vi.fn(async (ref: Record<symbol, string>, args: unknown) => {
    const operation =
      String(ref[Symbol.for('functionName')] ?? '')
        .split(':')
        .pop() ?? ''
    calls.push({ operation, args })
    if (operation === 'page') return { status: 'found', page }
    if (operation === 'list') {
      return { entries: [page], pageInfo: { hasNextPage: false, endCursor: null } }
    }
    throw new Error(`Unhandled package provider test operation: ${operation}`)
  })
  return { calls, query }
})

type ProviderModule = typeof import('../../packages/cms/dist/nuxt-provider.mjs')
let contentProvider: ProviderModule['contentProvider']
let setClientFactory: ProviderModule['__setGinkoNuxtProviderClientFactoryForTests']

const unwrap = <T>(value: T) => (isContentProviderResult(value) ? value.data : value)

describe('built ginko-cms Nuxt provider package output', () => {
  beforeEach(async () => {
    vi.resetModules()
    convexMock.calls.length = 0
    convexMock.query.mockClear()
    process.env.NUXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud'
    ;({ contentProvider, __setGinkoNuxtProviderClientFactoryForTests: setClientFactory } =
      await import('../../packages/cms/dist/nuxt-provider.mjs'))
    setClientFactory(() => ({ query: convexMock.query }))
  })

  afterEach(() => {
    setClientFactory(undefined)
    delete process.env.NUXT_PUBLIC_CONVEX_URL
  })

  it('ships the same v2 raw-document and cursor contracts as the source adapter', async () => {
    const pageQuery = toContentProviderQuery({ collection: 'docs', first: true })
    pageQuery.plan.variantSelector = {
      by: 'route',
      requestedLocale: 'en',
      candidates: [{ locale: 'en', contentPath: '/docs/content-routing' }],
    }
    const page = unwrap(await contentProvider.query({} as never, pageQuery)).result
    expect(page).toMatchObject({
      canonicalKey: 'docs:docs-routing',
      contentPath: '/docs/content-routing',
      routeVariants: [{ locale: 'en', contentPath: '/docs/content-routing' }],
    })
    expect(page).not.toHaveProperty('resolved')

    const list = unwrap(
      await contentProvider.query(
        {} as never,
        toContentProviderQuery({
          collection: 'docs',
          paging: { mode: 'cursor', after: null, limit: 5 },
        }),
      ),
    )
    expect(list).toMatchObject({
      mode: 'cursor',
      result: [expect.objectContaining({ canonicalKey: 'docs:docs-routing' })],
      pageInfo: { hasNext: false, endCursor: null },
    })
    expect(list).not.toHaveProperty('total')
    expect(convexMock.calls.map((call) => call.operation)).toEqual(['page', 'list'])
  })
})
