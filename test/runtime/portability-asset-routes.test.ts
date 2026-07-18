/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import { createApp, createRouter, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setTestRuntimeConfig } from '../helpers/nitro-runtime-shim'

const mutation = vi.fn()
const action = vi.fn()
const serverConvex = vi.fn(() => ({ mutation, action }))

vi.mock('better-convex-nuxt/server', () => ({ serverConvex }))

const attemptHandler = (await import('#ginko-cms-server/routes/portability-asset-attempt')).default
const downloadAttemptHandler = (
  await import('#ginko-cms-server/routes/portability-asset-download-attempt')
).default
const downloadHandler = (await import('#ginko-cms-server/routes/portability-asset-download'))
  .default
const uploadHandler = (await import('#ginko-cms-server/routes/portability-asset-upload')).default

const sha256 = 'a'.repeat(64)
const payloadSha256 = 'b'.repeat(64)
const requestHeaders = {
  cookie: 'better-auth.session_token=session-secret',
  'x-ginko-portability-run': 'portable-import:plan-1',
  'x-ginko-portability-payload': payloadSha256,
}

function routeFetch(
  method: 'get' | 'post' | 'put',
  path: string,
  handler: typeof attemptHandler,
  init: RequestInit = {},
) {
  const app = createApp()
  const router = createRouter()
  router[method](path, handler)
  app.use(router)
  return toWebHandler(app)(
    new Request(
      `http://localhost${path.replace(':sha256', sha256).replace(':holdId', sha256)}`,
      init,
    ),
  )
}

describe('portability asset Nitro routes', () => {
  beforeEach(() => {
    process.env.GINKO_CMS_PORTABILITY_SECRET = 'test-server-secret'
    setTestRuntimeConfig({ public: { convex: { url: 'https://storage.example.test' } } })
    mutation.mockReset()
    action.mockReset()
    serverConvex.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GINKO_CMS_PORTABILITY_SECRET
  })

  it('creates one sealed attempt through a required cookie caller', async () => {
    mutation.mockResolvedValue({
      runId: 'portable-import:plan-1',
      sha256,
      attemptGeneration: 1,
      leaseExpiresAt: Date.now() + 300_000,
    })

    const response = await routeFetch(
      'post',
      '/api/_ginko/portability/assets/:sha256/attempt',
      attemptHandler,
      { method: 'POST', headers: requestHeaders },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(serverConvex).toHaveBeenCalledWith(expect.anything(), { auth: 'required' })
    expect(body.token).toEqual(expect.any(String))
    expect(mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runId: 'portable-import:plan-1',
        payloadSha256,
        sha256,
        storageOrigin: 'https://storage.example.test',
        attemptTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    )
    expect(JSON.stringify(mutation.mock.calls)).not.toContain(body.token)
  })

  it('issues and streams one server-only export download capability', async () => {
    mutation
      .mockResolvedValueOnce({
        state: 'attempt',
        downloadGeneration: 1,
        expiresAt: Date.now() + 60_000,
      })
      .mockResolvedValueOnce({
        storageUrl: 'https://storage.example.test/object',
        sha256: createHash('sha256')
          .update(new Uint8Array([1, 2, 3, 4]))
          .digest('hex'),
        bytes: 4,
        mediaType: 'image/png',
        attempt: 1,
      })
    const attemptResponse = await routeFetch(
      'post',
      '/api/_ginko/portability/assets/:holdId/download-attempt',
      downloadAttemptHandler,
      {
        method: 'POST',
        headers: {
          cookie: requestHeaders.cookie,
          'x-ginko-portability-run': 'export-1',
        },
      },
    )
    const attempt = (await attemptResponse.json()) as { token: string; downloadGeneration: number }
    const storageFetch = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          headers: { 'content-length': '4' },
        }),
    )
    vi.stubGlobal('fetch', storageFetch)

    const response = await routeFetch(
      'get',
      '/api/_ginko/portability/assets/:holdId',
      downloadHandler,
      {
        method: 'GET',
        headers: {
          cookie: requestHeaders.cookie,
          'x-ginko-portability-run': 'export-1',
          'x-ginko-portability-attempt': attempt.token,
          'x-ginko-portability-generation': String(attempt.downloadGeneration),
        },
      },
    )

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(storageFetch).toHaveBeenCalledWith(
      new URL('https://storage.example.test/object'),
      expect.objectContaining({ redirect: 'error' }),
    )
    expect(JSON.stringify(mutation.mock.calls)).not.toContain(attempt.token)
  })

  it('rejects a browser-originated attempt before constructing a caller', async () => {
    const response = await routeFetch(
      'post',
      '/api/_ginko/portability/assets/:sha256/attempt',
      attemptHandler,
      {
        method: 'POST',
        headers: { ...requestHeaders, origin: 'http://localhost', 'sec-fetch-site': 'same-origin' },
      },
    )

    expect(response.status).toBe(403)
    expect(serverConvex).not.toHaveBeenCalled()
  })

  it('replays an already attached stage without returning a fresh bearer token', async () => {
    mutation.mockResolvedValue({ state: 'attached', assetId: 'asset-1' })

    const response = await routeFetch(
      'post',
      '/api/_ginko/portability/assets/:sha256/attempt',
      attemptHandler,
      { method: 'POST', headers: requestHeaders },
    )

    await expect(response.json()).resolves.toEqual({ state: 'attached', assetId: 'asset-1' })
  })

  it('streams, records, and verifies one exact raw upload', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    mutation
      .mockResolvedValueOnce({
        state: 'awaiting-upload',
        uploadUrl: 'https://storage.example.test/upload',
        byteLength: bytes.byteLength,
        mediaType: 'image/png',
        storageOrigin: 'https://storage.example.test',
      })
      .mockResolvedValueOnce({ state: 'uploaded' })
    action.mockResolvedValue({ state: 'attached', assetId: 'asset-1' })
    const storageFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Uint8Array(await new Response(init.body).arrayBuffer())).toEqual(bytes)
      return new Response(JSON.stringify({ storageId: 'storage-1' }))
    })
    vi.stubGlobal('fetch', storageFetch)

    const response = await routeFetch(
      'put',
      '/api/_ginko/portability/assets/:sha256',
      uploadHandler,
      {
        method: 'PUT',
        body: bytes,
        headers: {
          ...requestHeaders,
          'content-type': 'image/png',
          'content-length': String(bytes.byteLength),
          'x-ginko-portability-attempt': 'attempt-token',
          'x-ginko-portability-generation': '1',
        },
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ state: 'attached', assetId: 'asset-1' })
    expect(storageFetch).toHaveBeenCalledTimes(1)
    expect(mutation).toHaveBeenCalledTimes(2)
    expect(mutation.mock.calls[1]?.[1]).toMatchObject({ storageId: 'storage-1' })
    expect(action).toHaveBeenCalledTimes(1)
  })

  it.each(['uploaded', 'verifying'] as const)(
    'retries a %s stage without uploading a second object',
    async (state) => {
      mutation.mockResolvedValue({ state })
      action.mockResolvedValue({ state: 'attached', assetId: 'asset-1' })
      const storageFetch = vi.fn()
      vi.stubGlobal('fetch', storageFetch)

      const response = await routeFetch(
        'put',
        '/api/_ginko/portability/assets/:sha256',
        uploadHandler,
        {
          method: 'PUT',
          headers: {
            ...requestHeaders,
            'x-ginko-portability-attempt': 'attempt-token',
            'x-ginko-portability-generation': '1',
          },
        },
      )

      expect(response.status).toBe(200)
      expect(storageFetch).not.toHaveBeenCalled()
      expect(action).toHaveBeenCalledTimes(1)
    },
  )

  it('replays an attached result without uploading or verifying again', async () => {
    mutation.mockResolvedValue({ state: 'attached', assetId: 'asset-1' })
    const storageFetch = vi.fn()
    vi.stubGlobal('fetch', storageFetch)

    const response = await routeFetch(
      'put',
      '/api/_ginko/portability/assets/:sha256',
      uploadHandler,
      {
        method: 'PUT',
        headers: {
          ...requestHeaders,
          'x-ginko-portability-attempt': 'attempt-token',
          'x-ginko-portability-generation': '1',
        },
      },
    )

    await expect(response.json()).resolves.toEqual({ state: 'attached', assetId: 'asset-1' })
    expect(storageFetch).not.toHaveBeenCalled()
    expect(action).not.toHaveBeenCalled()
  })
})
