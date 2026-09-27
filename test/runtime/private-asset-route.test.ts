import { makeFunctionReference } from 'convex/server'
import { createApp, createRouter, toWebHandler, type H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PRIVATE_ASSET_CHUNK_BYTES } from '../../packages/contract/src/assetPolicy'
import { handleGinkoAssetRequest } from '../../packages/convex/src/assetDeliveryHttp'
import { setTestRuntimeConfig } from '../helpers/nitro-runtime-shim'

const mocks = vi.hoisted(() => ({ getToken: vi.fn(), serverConvex: vi.fn(), fetch: vi.fn() }))
vi.mock('@lupinum/better-convex-nuxt/server', () => ({ serverConvex: mocks.serverConvex }))
vi.mock('@lupinum/better-convex-nuxt/errors', () => ({
  normalizeConvexError: (error: unknown) =>
    error && typeof error === 'object' && 'kind' in error ? error : { kind: 'unknown' },
}))
const handler = (await import('../../packages/cms/src/server/routes/private-asset')).default

function routeFetch(init: RequestInit = {}) {
  const app = createApp()
  const router = createRouter()
  router.use('/api/_ginko/assets/:assetId', handler)
  app.use(router)
  return toWebHandler(app)(new Request('https://cms.example.test/api/_ginko/assets/asset-1', init))
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getToken.mockResolvedValue('current-convex-token')
  mocks.serverConvex.mockReturnValue({ getToken: mocks.getToken })
  mocks.fetch.mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: {
        'content-type': 'image/png',
        'content-length': '4',
        'x-ginko-asset-bytes': '4',
        'x-ginko-asset-offset': '0',
        'x-ginko-asset-version': 'a'.repeat(64),
        'cache-control': 'public',
        location: 'https://storage.example/secret',
        'set-cookie': 'secret=value',
        'access-control-allow-origin': '*',
      },
    }),
  )
  setTestRuntimeConfig({ public: { convex: { siteUrl: 'https://deployment.convex.site' } } })
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('same-origin private image route', () => {
  it('aborts the first upstream chunk when the Node response closes and removes its listener', async () => {
    mocks.fetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('disconnected')), {
            once: true,
          })
        }),
    )
    const pending = routeFetch()
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1))
    const event = mocks.serverConvex.mock.calls[0]![0] as H3Event
    event.node.res.emit('close')
    expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(true)
    await pending
    expect(event.node.res.listenerCount('close')).toBe(0)
  })

  function connectChunkGateway(total: number) {
    const descriptor = {
      url: 'https://storage.example.com/asset',
      mimeType: 'image/png',
      bytes: total,
      sha256: 'a'.repeat(64),
    }
    const ctx = {
      auth: {
        getUserIdentity: vi
          .fn()
          .mockResolvedValue({ subject: 'member-1', token_use: 'convex-session' }),
      },
      runQuery: vi.fn().mockResolvedValue(descriptor),
    }
    const storageFetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('range')!
      const [, rawStart, rawEnd] = range.match(/^bytes=(\d+)-(\d+)$/)!
      const start = Number(rawStart)
      const end = Number(rawEnd)
      return new Response(new Uint8Array(end - start + 1).fill(7), {
        status: 206,
        headers: {
          'content-range': `bytes ${start}-${end}/${total}`,
          'content-length': String(end - start + 1),
        },
      })
    })
    mocks.fetch.mockImplementation(
      async (url, init) =>
        await handleGinkoAssetRequest(ctx, new Request(url, init), {
          descriptorQuery: makeFunctionReference<'query'>('assets:getAssetDeliveryDescriptor'),
          storageOrigin: 'https://storage.example.com',
          fetch: storageFetch,
        }),
    )
    return { ctx, descriptor, storageFetch }
  }

  it.each([20_000_000 - 1, 20_000_000 + 1, 20 * 1024 * 1024 + 1, 25 * 1024 * 1024])(
    'preserves the %i-byte asset through bounded authenticated chunks',
    async (total) => {
      const { ctx, storageFetch } = connectChunkGateway(total)
      const response = await routeFetch()
      expect(response.status).toBe(200)
      expect(response.headers.get('content-length')).toBe(String(total))
      const bytes = new Uint8Array(await response.arrayBuffer())
      expect(bytes.byteLength).toBe(total)
      expect(bytes[0]).toBe(7)
      expect(bytes.at(-1)).toBe(7)
      const chunks = Math.ceil(total / PRIVATE_ASSET_CHUNK_BYTES)
      expect(storageFetch).toHaveBeenCalledTimes(chunks)
      expect(ctx.runQuery).toHaveBeenCalledTimes(chunks * 2)
      for (const [, init] of mocks.fetch.mock.calls.slice(1)) {
        expect(init.headers['x-ginko-asset-version']).toBe('a'.repeat(64))
      }
      expect(response.headers.has('x-ginko-asset-version')).toBe(false)
    },
  )

  it('fails the assembled stream when a member is revoked between chunks', async () => {
    const { ctx, descriptor, storageFetch } = connectChunkGateway(PRIVATE_ASSET_CHUNK_BYTES + 1)
    ctx.runQuery
      .mockReset()
      .mockResolvedValueOnce(descriptor)
      .mockResolvedValueOnce(descriptor)
      .mockRejectedValue(new Error('revoked'))
    const response = await routeFetch()
    await expect(response.arrayBuffer()).rejects.toThrow('Private asset delivery failed.')
    expect(storageFetch).toHaveBeenCalledTimes(1)
  })

  it('does not combine bytes from different asset revisions', async () => {
    const { ctx, descriptor, storageFetch } = connectChunkGateway(PRIVATE_ASSET_CHUNK_BYTES + 1)
    ctx.runQuery
      .mockReset()
      .mockResolvedValueOnce(descriptor)
      .mockResolvedValueOnce(descriptor)
      .mockResolvedValue({ ...descriptor, sha256: 'b'.repeat(64) })
    const response = await routeFetch()
    await expect(response.arrayBuffer()).rejects.toThrow('Private asset delivery failed.')
    expect(storageFetch).toHaveBeenCalledTimes(1)
  })

  it('exchanges the current session and forwards only its token to the configured HTTP endpoint', async () => {
    const response = await routeFetch({
      headers: {
        cookie: 'better-auth.session_token=private',
        authorization: 'Bearer caller-controlled',
      },
    })
    expect(response.status).toBe(200)
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4])
    expect(mocks.serverConvex).toHaveBeenCalledWith(expect.anything(), { auth: 'required' })
    expect(mocks.fetch.mock.calls[0]![0].href).toBe(
      'https://deployment.convex.site/ginko/assets/asset-1',
    )
    expect(mocks.fetch.mock.calls[0]![1]).toMatchObject({
      redirect: 'error',
      headers: { authorization: 'Bearer current-convex-token' },
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    for (const name of ['location', 'set-cookie', 'access-control-allow-origin'])
      expect(response.headers.has(name)).toBe(false)
  })

  it.each([null, { kind: 'authentication' }])(
    'denies missing or revoked authentication %j before fetching',
    async (failure) => {
      if (failure) mocks.getToken.mockRejectedValue(failure)
      else mocks.getToken.mockResolvedValue(null)
      expect((await routeFetch()).status).toBe(401)
      expect(mocks.fetch).not.toHaveBeenCalled()
    },
  )

  it.each(['HEAD', 'POST', 'OPTIONS'])('rejects %s without a storage request', async (method) => {
    expect((await routeFetch({ method })).status).toBe(405)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('rejects ranges without a storage request', async () => {
    expect((await routeFetch({ headers: { range: 'bytes=0-1' } })).status).toBe(416)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([401, 403, 404])(
    'preserves denial status %i without exposing the upstream body',
    async (status) => {
      mocks.fetch.mockResolvedValue(new Response('private diagnostic', { status }))
      const response = await routeFetch()
      expect(response.status).toBe(status)
      expect(await response.text()).not.toContain('private diagnostic')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    },
  )

  it('does not forward an upstream redirect or storage URL', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://storage.example/secret' } }),
    )
    const response = await routeFetch()
    expect(response.status).toBe(502)
    expect(response.headers.has('location')).toBe(false)
    expect(await response.text()).not.toContain('storage.example')
  })

  it('rejects an insecure configured endpoint before sending the token', async () => {
    setTestRuntimeConfig({ public: { convex: { siteUrl: 'http://public.example.com' } } })
    expect((await routeFetch()).status).toBe(503)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
