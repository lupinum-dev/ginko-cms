import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOperatorContext } from '../../packages/cms/src/cli/operator.js'
import {
  MAX_OPERATOR_SESSION_COOKIE_BYTES,
  MAX_OPERATOR_TOKEN_RESPONSE_BYTES,
  OPERATOR_CONVEX_TOKEN_ROUTE,
  OPERATOR_TOKEN_EXCHANGE_TIMEOUT_MS,
} from '../../packages/cms/src/server/utils/operator-token-contract.js'

const roots: string[] = []
const sessionCookie = 'better-auth.session_token=operator-session-secret'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(options: { cookie?: string; site?: string; publicSite?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ginko-cms-operator-'))
  roots.push(root)
  writeFileSync(
    resolve(root, '.env.local'),
    [
      'CONVEX_URL=https://operator.convex.cloud',
      ...(options.site === undefined ? ['SITE_URL=https://cms.example.test'] : []),
      ...(options.site ? [`SITE_URL=${options.site}`] : []),
      ...(options.publicSite ? [`NUXT_PUBLIC_SITE_URL=${options.publicSite}`] : []),
      `GINKO_CMS_SESSION_COOKIE=${options.cookie ?? sessionCookie}`,
      '',
    ].join('\n'),
    'utf8',
  )
  return root
}

function convexClient() {
  return {
    setAuth: vi.fn(),
    query: vi.fn(async () => 'query-result'),
    mutation: vi.fn(async () => 'mutation-result'),
    action: vi.fn(async () => 'action-result'),
  }
}

function tokenResponse(token = 'bounded-convex-token') {
  return new Response(JSON.stringify({ token }), {
    headers: { 'content-type': 'application/json' },
  })
}

describe('Ginko CLI operator token exchange', () => {
  it('lazily authorizes concurrent and later calls through one exact host exchange', async () => {
    const root = fixture()
    const client = convexClient()
    const fetchMock = vi.fn(async () => tokenResponse())
    vi.stubGlobal('fetch', fetchMock)

    const context = await createOperatorContext(root, () => client as never)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(client.setAuth).not.toHaveBeenCalled()

    await expect(
      Promise.all([
        context.client.query({} as never, {}),
        context.client.mutation({} as never, {}),
        context.client.action({} as never, {}),
      ]),
    ).resolves.toEqual(['query-result', 'mutation-result', 'action-result'])
    await expect(context.client.query({} as never, {})).resolves.toBe('query-result')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(client.setAuth).toHaveBeenCalledTimes(1)
    expect(client.setAuth).toHaveBeenCalledWith('bounded-convex-token')
    expect(client.setAuth.mock.invocationCallOrder[0]).toBeLessThan(
      client.query.mock.invocationCallOrder[0]!,
    )
    const [endpoint, request] = fetchMock.mock.calls[0]!
    expect(String(endpoint)).toBe(`https://cms.example.test${OPERATOR_CONVEX_TOKEN_ROUTE}`)
    expect(request).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(request).not.toHaveProperty('body')
    expect(new Headers(request?.headers).get('cookie')).toBe(sessionCookie)
    expect(new Headers(request?.headers).get('origin')).toBeNull()
    expect(new Headers(request?.headers).get('sec-fetch-site')).toBeNull()
    expect(String(endpoint)).not.toContain('operator.convex.cloud')
  })

  it('accepts the public site fallback and loopback HTTP without consulting Convex site URLs', async () => {
    const root = fixture({ site: '', publicSite: 'http://127.0.0.1:4173' })
    const client = convexClient()
    const fetchMock = vi.fn(async () => tokenResponse())
    vi.stubGlobal('fetch', fetchMock)

    const context = await createOperatorContext(root, () => client as never)
    await context.client.query({} as never, {})

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `http://127.0.0.1:4173${OPERATOR_CONVEX_TOKEN_ROUTE}`,
    )
  })

  it('refuses a redirect response without retrying or forwarding the credential', async () => {
    const redirectSecret = 'redirect-body-session-secret'
    const client = convexClient()
    const fetchMock = vi.fn(
      async () =>
        new Response(redirectSecret, {
          status: 302,
          headers: { location: 'https://attacker.example.test/collect' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const context = await createOperatorContext(fixture(), () => client as never)

    await expect(context.client.query({} as never, {})).rejects.toThrow(
      'Ginko CMS operator token exchange failed with HTTP 302.',
    )
    await expect(context.client.query({} as never, {})).rejects.not.toThrow(redirectSecret)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' })
    expect(client.setAuth).not.toHaveBeenCalled()
    expect(client.query).not.toHaveBeenCalled()
  })

  it.each([
    'http://cms.example.test',
    'https://cms.example.test/path',
    'https://cms.example.test/?query=1',
    'https://cms.example.test/#fragment',
    'https://user:password@cms.example.test/',
    'ftp://cms.example.test/',
    'not a URL',
  ])('rejects a non-origin SITE_URL before any credential egress: %s', async (site) => {
    const root = fixture({ site })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createOperatorContext(root, () => convexClient() as never)).rejects.toThrow(
      /configured Ginko CMS SITE_URL/u,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enforces the UTF-8 cookie bound and control-character rejection before fetch', async () => {
    const prefix = 'better-auth.session_token='
    const exact = `${prefix}${'x'.repeat(MAX_OPERATOR_SESSION_COOKIE_BYTES - prefix.length)}`
    const acceptedRoot = fixture({ cookie: exact })
    const fetchMock = vi.fn(async () => tokenResponse())
    vi.stubGlobal('fetch', fetchMock)
    const accepted = await createOperatorContext(acceptedRoot, () => convexClient() as never)
    await accepted.client.query({} as never, {})
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const oversizedRoot = fixture({ cookie: `${exact}é` })
    await expect(
      createOperatorContext(oversizedRoot, () => convexClient() as never),
    ).rejects.toThrow('operator session cookie is invalid')
    vi.stubEnv('GINKO_CMS_SESSION_COOKIE', `${prefix}safe\runsafe`)
    await expect(createOperatorContext(fixture(), () => convexClient() as never)).rejects.toThrow(
      'operator session cookie is invalid',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([401, 403] as const)(
    'reports HTTP %s only as an authentication failure',
    async (status) => {
      const sentinel = 'upstream-auth-body-secret'
      const fetchMock = vi.fn(async () => new Response(sentinel, { status }))
      vi.stubGlobal('fetch', fetchMock)
      const context = await createOperatorContext(fixture(), () => convexClient() as never)

      await expect(context.client.query({} as never, {})).rejects.toThrow(
        `Ginko CMS operator authentication failed with HTTP ${status}.`,
      )
      await expect(context.client.query({} as never, {})).rejects.not.toThrow(sentinel)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('sanitizes network and non-authentication HTTP failures without logging credentials', async () => {
    const raw = `${sessionCookie} raw-network-detail`
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => {
      throw new Error(raw)
    })
    vi.stubGlobal('fetch', fetchMock)
    const network = await createOperatorContext(fixture(), () => convexClient() as never)
    await expect(network.client.query({} as never, {})).rejects.toThrow(
      'Ginko CMS operator token exchange could not reach the configured SITE_URL.',
    )
    await expect(network.client.query({} as never, {})).rejects.not.toThrow(raw)

    fetchMock.mockResolvedValueOnce(new Response(raw, { status: 503 }))
    const unavailable = await createOperatorContext(fixture(), () => convexClient() as never)
    await expect(unavailable.client.query({} as never, {})).rejects.toThrow(
      'Ginko CMS operator token exchange failed with HTTP 503.',
    )
    await expect(unavailable.client.query({} as never, {})).rejects.not.toThrow(raw)
    expect([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls]).toEqual([])
  })

  it('bounds declared, streamed, malformed, and invalid-token responses', async () => {
    const huge = JSON.stringify({ token: 'x'.repeat(MAX_OPERATOR_TOKEN_RESPONSE_BYTES) })
    const cases = [
      new Response('{}', {
        headers: { 'content-length': String(MAX_OPERATOR_TOKEN_RESPONSE_BYTES + 1) },
      }),
      new Response(huge),
      new Response('{not-json'),
      tokenResponse('token\nwith-control'),
    ]
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const response of cases) {
      fetchMock.mockResolvedValueOnce(response)
      const client = convexClient()
      const context = await createOperatorContext(fixture(), () => client as never)
      await expect(context.client.query({} as never, {})).rejects.toThrow(
        'Ginko CMS operator token exchange returned an invalid response.',
      )
      expect(client.setAuth).not.toHaveBeenCalled()
      expect(client.query).not.toHaveBeenCalled()
    }
  })

  it('sanitizes a client token-installation failure and never starts the operation', async () => {
    const client = convexClient()
    client.setAuth.mockImplementation(() => {
      throw new Error(`${sessionCookie} setAuth detail`)
    })
    const fetchMock = vi.fn(async () => tokenResponse())
    vi.stubGlobal('fetch', fetchMock)
    const context = await createOperatorContext(fixture(), () => client as never)

    await expect(context.client.query({} as never, {})).rejects.toThrow(
      'Ginko CMS operator client could not accept the exchanged token.',
    )
    await expect(context.client.query({} as never, {})).rejects.not.toThrow(sessionCookie)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(client.setAuth).toHaveBeenCalledTimes(1)
    expect(client.query).not.toHaveBeenCalled()
  })

  it('keeps the deadline active until the complete response body is consumed', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (_endpoint: URL, init?: RequestInit) => {
      const signal = init?.signal
      return new Response(
        new ReadableStream({
          start(controller) {
            signal?.addEventListener('abort', () => controller.error(new Error('body secret')))
          },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = convexClient()
    const context = await createOperatorContext(fixture(), () => client as never)
    const pending = context.client.query({} as never, {})
    const rejection = expect(pending).rejects.toThrow(
      'Ginko CMS operator token exchange timed out.',
    )

    await vi.advanceTimersByTimeAsync(OPERATOR_TOKEN_EXCHANGE_TIMEOUT_MS + 1)
    await rejection
    expect(client.setAuth).not.toHaveBeenCalled()
    expect(client.query).not.toHaveBeenCalled()
  })
})
