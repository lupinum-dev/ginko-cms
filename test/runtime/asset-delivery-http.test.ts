import { makeFunctionReference } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { PRIVATE_ASSET_CHUNK_BYTES } from '../../packages/contract/src/assetPolicy'
import { handleGinkoAssetRequest } from '../../packages/convex/src/assetDeliveryHttp'

const descriptor = {
  url: 'https://storage.example.com/private?token=secret',
  mimeType: 'image/png',
  bytes: 4,
  sha256: 'a'.repeat(64),
}
const descriptorQuery = makeFunctionReference<'query'>('assets:getAssetDeliveryDescriptor')
const request = (init: RequestInit = {}) =>
  new Request('https://deployment.convex.site/ginko/assets/asset-1', init)
function setup() {
  const ctx = {
    auth: {
      getUserIdentity: vi
        .fn()
        .mockResolvedValue({ subject: 'member-1', token_use: 'convex-session' }),
    },
    runQuery: vi.fn().mockResolvedValue(descriptor),
  }
  const fetch = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: {
        'content-type': 'image/png',
        'content-length': '4',
        location: descriptor.url,
        'cache-control': 'public, max-age=9999',
        'set-cookie': 'secret=leak',
        'access-control-allow-origin': '*',
      },
    }),
  )
  return {
    ctx,
    input: { descriptorQuery, storageOrigin: 'https://storage.example.com', fetch },
    fetch,
  }
}

describe('private asset host HTTP delivery', () => {
  it('handles a storage provider that ignores Range without exceeding one response chunk', async () => {
    const { ctx, input, fetch } = setup()
    const total = PRIVATE_ASSET_CHUNK_BYTES + 1
    ctx.runQuery.mockResolvedValue({ ...descriptor, bytes: total })
    fetch.mockResolvedValue(new Response(new Uint8Array(total).fill(9)))
    const response = await handleGinkoAssetRequest(
      ctx,
      new Request(
        `https://deployment.convex.site/ginko/assets/asset-1?offset=${PRIVATE_ASSET_CHUNK_BYTES}`,
        { headers: { 'x-ginko-asset-version': descriptor.sha256 } },
      ),
      input,
    )
    expect(response.status).toBe(200)
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([9])
  })

  it('rejects malformed provider partial-content boundaries', async () => {
    const { ctx, input, fetch } = setup()
    fetch.mockResolvedValue(
      new Response(new Uint8Array(4), {
        status: 206,
        headers: { 'content-range': 'bytes 1-4/5' },
      }),
    )
    expect((await handleGinkoAssetRequest(ctx, request(), input)).status).toBe(502)
  })

  it.each(['-1', '1', 'NaN', '999999999999999999'])(
    'rejects invalid internal offset %s before fetching',
    async (offset) => {
      const { ctx, input, fetch } = setup()
      const response = await handleGinkoAssetRequest(
        ctx,
        new Request(`https://deployment.convex.site/ginko/assets/asset-1?offset=${offset}`),
        input,
      )
      expect(response.status).toBe(416)
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('streams bytes after current membership checks without forwarding storage headers or credentials', async () => {
    const { ctx, input, fetch } = setup()
    const response = await handleGinkoAssetRequest(
      ctx,
      request({ headers: { authorization: 'Bearer user-secret' } }),
      input,
    )
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4])
    expect(ctx.runQuery).toHaveBeenCalledTimes(2)
    expect(ctx.runQuery).toHaveBeenCalledWith(descriptorQuery, {
      assetId: 'asset-1',
      _trustedCaller: { kind: 'user', subject: 'user:member-1', userId: 'member-1' },
    })
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      redirect: 'error',
      headers: { 'accept-encoding': 'identity' },
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('Authorization, Cookie')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    for (const name of ['location', 'set-cookie', 'access-control-allow-origin'])
      expect(response.headers.has(name)).toBe(false)
  })

  it.each(['HEAD', 'POST', 'OPTIONS'])(
    'rejects %s rather than serving a cacheable alternate path',
    async (method) => {
      const { ctx, input, fetch } = setup()
      const response = await handleGinkoAssetRequest(ctx, request({ method }), input)
      expect(response.status).toBe(405)
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('rejects ranges and never forwards them', async () => {
    const { ctx, input, fetch } = setup()
    expect(
      (await handleGinkoAssetRequest(ctx, request({ headers: { range: 'bytes=0-1' } }), input))
        .status,
    ).toBe(416)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([null, { subject: 'member-1' }, { subject: 'member-1', token_use: 'oauth-access' }])(
    'denies anonymous/unrecognized token identity %j',
    async (identity) => {
      const { ctx, input, fetch } = setup()
      ctx.auth.getUserIdentity.mockResolvedValue(identity)
      const response = await handleGinkoAssetRequest(ctx, request(), input)
      expect(response.status).toBe(401)
      expect(fetch).not.toHaveBeenCalled()
      expect(ctx.runQuery).not.toHaveBeenCalled()
    },
  )

  it('denies nonmember/foreign access before opening storage', async () => {
    const { ctx, input, fetch } = setup()
    ctx.runQuery.mockRejectedValue(new Error('not a CMS member'))
    expect((await handleGinkoAssetRequest(ctx, request(), input)).status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('denies membership revoked while opening storage before releasing bytes', async () => {
    const { ctx, input, fetch } = setup()
    ctx.runQuery.mockResolvedValueOnce(descriptor).mockRejectedValueOnce(new Error('revoked'))
    const response = await handleGinkoAssetRequest(ctx, request(), input)
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('')
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true)
  })

  it.each([null, { ...descriptor, url: 'https://storage.example.com/replaced' }])(
    'rejects a trashed/replaced asset during fetch',
    async (current) => {
      const { ctx, input } = setup()
      ctx.runQuery.mockResolvedValueOnce(descriptor).mockResolvedValueOnce(current)
      expect((await handleGinkoAssetRequest(ctx, request(), input)).status).toBe(409)
    },
  )

  it('refuses a foreign storage origin before fetching', async () => {
    const { ctx, input, fetch } = setup()
    ctx.runQuery.mockResolvedValue({ ...descriptor, url: 'https://attacker.example/private' })
    expect((await handleGinkoAssetRequest(ctx, request(), input)).status).toBe(502)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not forward a storage redirect', async () => {
    const { ctx, input, fetch } = setup()
    fetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: descriptor.url } }),
    )
    const response = await handleGinkoAssetRequest(ctx, request(), input)
    expect(response.status).toBe(502)
    expect(response.headers.has('location')).toBe(false)
  })

  it('rejects oversized and truncated storage streams', async () => {
    for (const bytes of [new Uint8Array(5), new Uint8Array(3)]) {
      const { ctx, input, fetch } = setup()
      fetch.mockResolvedValue(new Response(bytes))
      const response = await handleGinkoAssetRequest(ctx, request(), input)
      expect(response.status).toBe(502)
    }
  })

  it('aborts a chunk when the requesting client disconnects', async () => {
    const { ctx, input, fetch } = setup()
    const cancelled = new AbortController()
    fetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
          cancelled.abort()
        }),
    )
    const response = await handleGinkoAssetRequest(
      ctx,
      request({ signal: cancelled.signal }),
      input,
    )
    expect(response.status).toBe(502)
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true)
  })
})
