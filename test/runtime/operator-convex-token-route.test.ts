/// <reference types="vite/client" />

import { createApp, createRouter, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_OPERATOR_CONVEX_TOKEN_BYTES } from '#ginko-cms-server/utils/operator-token-contract'

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  serverConvex: vi.fn(),
}))

vi.mock('@lupinum/better-convex-nuxt/server', () => ({
  serverConvex: mocks.serverConvex,
}))
vi.mock('@lupinum/better-convex-nuxt/errors', () => ({
  normalizeConvexError: (error: unknown) =>
    error && typeof error === 'object' && 'kind' in error ? error : { kind: 'unknown' },
}))

const handler = (await import('#ginko-cms-server/routes/operator-convex-token')).default

function routeFetch(init: RequestInit = {}) {
  const app = createApp()
  const router = createRouter()
  router.post('/api/_ginko/operator/convex-token', handler)
  app.use(router)
  return toWebHandler(app)(
    new Request('https://cms.example.test/api/_ginko/operator/convex-token', {
      ...init,
      method: 'POST',
    }),
  )
}

describe('operator Convex token route', () => {
  beforeEach(() => {
    mocks.getToken.mockReset()
    mocks.getToken.mockResolvedValue('operator-convex-token')
    mocks.serverConvex.mockReset()
    mocks.serverConvex.mockReturnValue({ getToken: mocks.getToken })
  })

  it('uses the real request event and returns one bounded no-store token response', async () => {
    const response = await routeFetch({
      headers: {
        cookie: 'better-auth.session_token=route-test-session',
        'cf-connecting-ip': '198.51.100.10',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ token: 'operator-convex-token' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(mocks.serverConvex).toHaveBeenCalledTimes(1)
    expect(mocks.serverConvex).toHaveBeenCalledWith(expect.anything(), { auth: 'required' })
    const event = mocks.serverConvex.mock.calls[0]?.[0] as {
      web?: { request?: Request }
    }
    expect(event.web?.request?.url).toBe(
      'https://cms.example.test/api/_ginko/operator/convex-token',
    )
    expect(event.web?.request?.headers.get('cf-connecting-ip')).toBe('198.51.100.10')
  })

  it.each([
    { headers: { origin: 'https://cms.example.test' } },
    { headers: { 'sec-fetch-site': 'same-origin' } },
  ])('rejects browser-originated requests before constructing a caller', async (init) => {
    const response = await routeFetch(init)

    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.serverConvex).not.toHaveBeenCalled()
  })

  it('rejects every request body before constructing a caller', async () => {
    const response = await routeFetch({ body: 'not-accepted' })

    expect(response.status).toBe(413)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.serverConvex).not.toHaveBeenCalled()
  })

  it.each([401, 403])('maps an upstream %s to one stable authentication error', async (status) => {
    mocks.getToken.mockRejectedValue({ kind: 'authentication', status })

    const response = await routeFetch()
    const body = await response.text()

    expect(response.status).toBe(status)
    expect(body).toContain('Ginko CMS operator authentication failed.')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('sanitizes unexpected authentication failures without logging credentials', async () => {
    const sentinel = 'upstream-secret-route-error'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getToken.mockRejectedValue(new Error(sentinel))

    const response = await routeFetch({
      headers: { cookie: 'better-auth.session_token=must-not-be-logged' },
    })
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(body).not.toContain(sentinel)
    expect(body).not.toContain('must-not-be-logged')
    expect([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls]).toEqual([])
    log.mockRestore()
    warn.mockRestore()
    error.mockRestore()
  })

  it.each(['', 'token\nwith-control', 'x'.repeat(MAX_OPERATOR_CONVEX_TOKEN_BYTES + 1)])(
    'refuses an invalid or oversized token response',
    async (token) => {
      mocks.getToken.mockResolvedValue(token)

      const response = await routeFetch()
      const body = await response.text()

      expect(response.status).toBe(503)
      expect(body).toContain('Ginko CMS operator authentication is unavailable.')
      expect(body.length).toBeLessThan(1_000)
      if (token) expect(body).not.toContain(token)
    },
  )
})
