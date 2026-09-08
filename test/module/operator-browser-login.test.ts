import { describe, expect, it } from 'vitest'

import { authorizeOperatorInBrowser } from '../../packages/cms/src/cli/operator-browser-login.js'
import { validateRedirectPath } from '../../packages/cms/src/public/utils/redirectSafety.js'
import {
  decodeOperatorBrowserRequest,
  resolveOperatorLoopbackCallback,
} from '../../packages/cms/src/server/utils/operator-token-contract.js'

describe('browser-backed CLI owner authorization', () => {
  it('accepts one matching loopback form response without persisting a browser cookie', async () => {
    const token = await authorizeOperatorInBrowser('https://cms.example.test', {
      timeoutMs: 2_000,
      open(url) {
        const login = new URL(url)
        const request = decodeOperatorBrowserRequest(login.searchParams.get('request'))
        void fetch(request.callback, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            state: request.state,
            token: 'short-lived-convex-token',
          }),
        })
      },
    })

    expect(token).toBe('short-lived-convex-token')
  })

  it('preserves only the structured operator return through sign-in redirect validation', () => {
    const request = Buffer.from(
      JSON.stringify({
        callback: 'http://127.0.0.1:43125/callback',
        state: 'a'.repeat(43),
      }),
    ).toString('base64url')
    const path = `/api/_ginko/operator/login?request=${request}`

    expect(validateRedirectPath(path)).toBe(path)
    expect(
      validateRedirectPath('/studio?next=http%3A%2F%2F127.0.0.1%3A43125%2Fcallback'),
    ).toBeNull()
  })

  it('ignores a nonce mismatch and accepts the subsequent matching callback', async () => {
    const token = await authorizeOperatorInBrowser('https://cms.example.test', {
      timeoutMs: 2_000,
      async open(url) {
        const login = new URL(url)
        const request = decodeOperatorBrowserRequest(login.searchParams.get('request'))
        const wrong = await fetch(request.callback, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ state: 'x'.repeat(43), token: 'attacker-token' }),
        })
        expect(wrong.status).toBe(400)
        await fetch(request.callback, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ state: request.state, token: 'owner-token' }),
        })
      },
    })
    expect(token).toBe('owner-token')
  })

  it('cleans up when the origin or browser opener fails', async () => {
    await expect(authorizeOperatorInBrowser('not-an-origin')).rejects.toThrow(/SITE_URL/i)
    let callback: string | undefined
    await expect(
      authorizeOperatorInBrowser('https://cms.example.test', {
        onUrl(url) {
          const login = new URL(url)
          callback = decodeOperatorBrowserRequest(login.searchParams.get('request')).callback
        },
        open: async () => {
          throw new Error('no browser')
        },
      }),
    ).rejects.toThrow('no browser')
    expect(callback).toBeDefined()
    await expect(fetch(callback!)).rejects.toThrow()
  })

  it('allows only an exact loopback callback', () => {
    expect(resolveOperatorLoopbackCallback('http://127.0.0.1:43125/callback').href).toBe(
      'http://127.0.0.1:43125/callback',
    )
    for (const value of [
      'https://127.0.0.1:43125/callback',
      'http://example.test/callback',
      'http://127.0.0.1:43125/other',
      'http://user@127.0.0.1:43125/callback',
    ]) {
      expect(() => resolveOperatorLoopbackCallback(value)).toThrow(/loopback callback/i)
    }
  })
})
