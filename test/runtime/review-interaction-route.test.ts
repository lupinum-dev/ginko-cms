import { describe, expect, it, vi } from 'vitest'

import reviewInteractionHandler from '../../packages/cms/src/server/routes/review-interaction'

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: (event: { context: { nitro: { runtimeConfig: unknown } } }) =>
    event.context.nitro.runtimeConfig,
}))

function eventFor(reviewRequestId: string, studioRoute = '/studio') {
  const headers = new Map<string, string>()
  let body = ''
  const response = {
    statusCode: 200,
    statusMessage: '',
    end(value = '') {
      body = String(value)
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase())
    },
    getHeaders() {
      return Object.fromEntries(headers)
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), String(value))
    },
  }
  return {
    event: {
      context: {
        nitro: { runtimeConfig: { public: { ginkoCms: { route: studioRoute } } } },
        params: { reviewRequestId },
      },
      handled: false,
      node: { req: { method: 'GET' }, res: response },
    },
    headers,
    response,
    body: () => body,
  }
}

describe('review interaction redirect', () => {
  it('performs no effect and redirects an opaque review id through the configured Studio route', async () => {
    const fixture = eventFor('review_123', '/admin/studio')

    await reviewInteractionHandler(fixture.event as never)

    expect(fixture.response.statusCode).toBe(302)
    expect(fixture.headers.get('location')).toBe('/admin/studio/reviews?review=review_123')
    expect(fixture.headers.get('cache-control')).toBe('private, no-store')
    expect(fixture.headers.get('referrer-policy')).toBe('no-referrer')
    expect(fixture.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(fixture.body()).not.toContain('review_123</body>')
  })

  it.each(['', '../foreign', 'review?next=https://evil.test', 'x'.repeat(129)])(
    'rejects an invalid locator without redirecting: %s',
    async (reviewRequestId) => {
      const fixture = eventFor(reviewRequestId)
      await expect(reviewInteractionHandler(fixture.event as never)).rejects.toMatchObject({
        statusCode: 400,
      })
      expect(fixture.headers.has('location')).toBe(false)
    },
  )
})
