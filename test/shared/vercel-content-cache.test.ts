import type { ContentCacheAdapter } from '@lupinum/ginko-content/provider'
import { createApp, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import revalidate from '../../node_modules/@lupinum/ginko-content/dist/runtime/server/api/revalidate.js'
import { vercelContentCache } from '../../packages/cms/src/nuxt-provider/vercel-cache.js'
import { hmacSha256Hex } from '../../packages/convex/src/revalidation/worker.js'

// Exercise the installed Content endpoint, not a second implementation of its
// authentication rules. Only its runtime configuration/adapter loaders are replaced.
const boundary = vi.hoisted(() => ({
  getContentCacheAdapter: vi.fn(),
  getContentRuntimeConfig: vi.fn(),
}))
vi.mock('../../node_modules/@lupinum/ginko-content/dist/runtime/server/cache-adapter.js', () => ({
  getContentCacheAdapter: boundary.getContentCacheAdapter,
}))
vi.mock('../../node_modules/@lupinum/ginko-content/dist/runtime/server/runtime-config.js', () => ({
  getContentRuntimeConfig: boundary.getContentRuntimeConfig,
}))

const receive = toWebHandler(createApp().use(revalidate))
const publicPath = (path: string) => path === '/' || path === '/blog' || path.startsWith('/blog/')
const makeAdapter = () =>
  vercelContentCache({
    origin: 'https://website.example',
    bypassToken: 'private-vercel-token',
    isPublicPath: publicPath,
  })

async function request(
  options: {
    body?: string
    signedBody?: string
    timestamp?: number
    eventId?: string
    secret?: string
  } = {},
) {
  const body = options.body ?? JSON.stringify({ paths: ['/blog/story'], tags: ['collection:blog'] })
  const timestamp = String(options.timestamp ?? Date.now())
  const eventId = options.eventId ?? 'event-1'
  // This is the real CMS outbox signing function.
  const signature = await hmacSha256Hex(
    options.secret ?? 'webhook-secret',
    `${timestamp}.${eventId}.${options.signedBody ?? body}`,
  )
  return receive(
    new Request('https://website.example/api/_content/revalidate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ginko-revalidation-event': eventId,
        'x-ginko-signature-timestamp': timestamp,
        'x-ginko-signature': `sha256=${signature}`,
      },
      body,
    }),
  )
}

describe('Vercel content delivery', () => {
  let adapter: ContentCacheAdapter
  beforeEach(() => {
    adapter = makeAdapter()
    boundary.getContentCacheAdapter.mockResolvedValue(adapter)
    boundary.getContentRuntimeConfig.mockReturnValue({
      content: { revalidate: { token: 'webhook-secret' } },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('accepts the CMS signature and regenerates HTML and extracted payload with only the Vercel credential', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('published'))
    vi.stubGlobal('fetch', fetcher)
    expect((await request()).status).toBe(200)
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://website.example/blog/story',
      'https://website.example/blog/story/_payload.json',
    ])
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'x-prerender-revalidate': 'private-vercel-token' },
      })
      expect(init).not.toHaveProperty('body')
    }
  })

  it('rejects unsigned, wrong-secret, modified-body and stale requests before touching Vercel', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const unsigned = await receive(
      new Request('https://website.example/api/_content/revalidate', {
        method: 'POST',
        body: '{}',
      }),
    )
    expect(unsigned.status).toBe(401)
    expect((await request({ secret: 'wrong' })).status).toBe(401)
    expect((await request({ signedBody: '{"paths":["/"]}' })).status).toBe(401)
    expect((await request({ timestamp: Date.now() - 10 * 60_000 })).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('makes duplicate and out-of-order delivery safe by rendering the current publication on every request', async () => {
    let publication = 'approved-1'
    let cached = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        cached = publication
        return new Response(publication)
      }),
    )
    expect((await request({ eventId: 'older' })).status).toBe(200)
    expect(cached).toBe('approved-1')
    publication = 'approved-2'
    expect((await request({ eventId: 'newer' })).status).toBe(200)
    expect((await request({ eventId: 'older' })).status).toBe(200)
    expect((await request({ eventId: 'older' })).status).toBe(200)
    expect(cached).toBe('approved-2')
  })

  it('returns a retryable failure for partial upstream failures, then retries the entire batch', async () => {
    let unavailable = true
    const fetcher = vi.fn<typeof fetch>(
      async (url) =>
        new Response('', {
          status: unavailable && String(url).endsWith('_payload.json') ? 503 : 200,
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    expect((await request()).status).toBe(500)
    unavailable = false
    expect((await request()).status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('does not silently accept tag-only invalidation without a route mapping', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(adapter.invalidate?.({ tags: ['site:footer'] })).rejects.toThrow(
      'resolved public paths',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('includes host-declared listing and global consumers and deduplicates paths', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(''))
    vi.stubGlobal('fetch', fetcher)
    const configured = vercelContentCache({
      origin: 'https://website.example',
      bypassToken: 'secret',
      isPublicPath: publicPath,
      pathsForTags: (tags) => (tags.includes('collection:blog') ? ['/blog', '/blog/story'] : []),
    })
    await configured.invalidate?.({
      paths: ['/blog/story', '/blog/story'],
      tags: ['collection:blog'],
    })
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname).sort()).toEqual([
      '/blog',
      '/blog/_payload.json',
      '/blog/story',
      '/blog/story/_payload.json',
    ])
  })

  it.each([
    'https://attacker.example/',
    '//attacker.example/',
    '/blog/../studio',
    '/blog/%2e%2e/studio',
    '/blog/%2fsecret',
    '/blog/hello?x=1',
    '/blog/hello#fragment',
    '/blog/\\attacker',
    '/studio',
    '/api/secret',
    '/preview/blog/id',
  ])('rejects unsafe or nonpublic path %s before any request in the batch', async (path) => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(adapter.invalidate?.({ paths: ['/blog/valid', path] })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not follow redirects or treat removal and missing payloads as failed publication', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith('_payload.json')
        ? new Response('', { status: 404 })
        : new Response('', { status: 302, headers: { location: 'https://attacker.example/' } }),
    )
    vi.stubGlobal('fetch', fetcher)
    await adapter.invalidate?.({ paths: ['/blog/old-slug'] })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true)
  })

  it('aborts a stalled batch so the outbox can retry instead of timing out indefinitely', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('request aborted')), {
            once: true,
          })
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const result = adapter.invalidate?.({ paths: ['/blog/story'] })
    const failure = expect(result).rejects.toThrow('request aborted')
    await vi.advanceTimersByTimeAsync(7_500)
    await failure
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds parallel requests and rejects oversized batches before network effects', async () => {
    let running = 0
    let peak = 0
    const fetcher = vi.fn<typeof fetch>(async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running--
      return new Response('')
    })
    vi.stubGlobal('fetch', fetcher)
    await adapter.invalidate?.({ paths: Array.from({ length: 8 }, (_, i) => `/blog/${i}`) })
    expect(fetcher).toHaveBeenCalledTimes(16)
    expect(peak).toBe(4)
    fetcher.mockClear()
    await expect(
      adapter.invalidate?.({ paths: Array.from({ length: 101 }, (_, i) => `/blog/${i}`) }),
    ).rejects.toThrow('resolved public paths')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects invalid host configuration', () => {
    for (const origin of [
      'http://website.example',
      'https://user:pass@website.example',
      'https://website.example/path',
      'https://website.example?query=1',
    ]) {
      expect(() =>
        vercelContentCache({ origin, bypassToken: 'secret', isPublicPath: publicPath }),
      ).toThrow()
    }
    expect(() =>
      vercelContentCache({
        origin: 'https://website.example',
        bypassToken: '',
        isPublicPath: publicPath,
      }),
    ).toThrow()
  })
})
