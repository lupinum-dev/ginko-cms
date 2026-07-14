import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  authenticateMcpRequestContext,
  resetMcpAuthState,
  type ExchangedMcpCredential,
} from '#ginko-cms-server/mcp/_shared/request-auth'

type StorageValue = number[]

const storageData = new Map<string, StorageValue>()
let storageFailure = false

// A narrow caller stand-in: query/mutation/action only, never a raw JWT.
const callerQuery = vi.fn()
const narrowCaller: ExchangedMcpCredential['caller'] = {
  query: callerQuery,
  mutation: vi.fn(),
  action: vi.fn(),
}

type ExchangeOutcome = 'valid' | 'invalid' | 'transport'
let exchangeOutcome: ExchangeOutcome = 'invalid'
let accessResult: { apiKeyId: string; ownerUserId: string } | null = null

const exchangeSpy = vi.fn(async (): Promise<ExchangedMcpCredential | null> => {
  switch (exchangeOutcome) {
    case 'valid':
      return { apiKeyId: 'ba_key_valid', ownerUserId: 'user-1', caller: narrowCaller }
    case 'transport':
      // Infrastructure failure (transport, or malformed/claim-less JWT): must
      // throw so the caller returns 503 without charging the bad-secret budget.
      throw new Error('MCP authentication temporarily unavailable')
    case 'invalid':
    default:
      // Definitive invalid credential (401/403 upstream): consumes the budget.
      return null
  }
})
const accessSpy = vi.fn(async (_apiKeyId: string, _caller: ExchangedMcpCredential['caller']) => {
  return accessResult
})

function authDeps() {
  return {
    createError: (input: { statusCode: number; statusMessage: string }) =>
      Object.assign(new Error(input.statusMessage), input),
    getStorage: async () => ({
      async getItem(key: string) {
        if (storageFailure) throw new Error('storage unavailable')
        return storageData.get(key) ?? null
      },
      async setItem(key: string, value: StorageValue) {
        if (storageFailure) throw new Error('storage unavailable')
        storageData.set(key, value)
      },
    }),
    exchangeCredential: async (credential: string) => exchangeSpy(credential),
    resolveCredentialAccess: async (apiKeyId: string, caller: ExchangedMcpCredential['caller']) =>
      accessSpy(apiKeyId, caller),
  }
}

describe('ginko mcp auth middleware', () => {
  beforeEach(() => {
    storageData.clear()
    storageFailure = false
    exchangeOutcome = 'invalid'
    accessResult = null
    exchangeSpy.mockClear()
    accessSpy.mockClear()
    callerQuery.mockClear()
    resetMcpAuthState()
  })

  it('stores validated claims and the narrow caller, never the raw JWT', async () => {
    exchangeOutcome = 'valid'
    accessResult = { apiKeyId: 'ba_key_valid', ownerUserId: 'user-1' }
    const context: Record<string, unknown> = {}

    await authenticateMcpRequestContext(
      {
        path: '/mcp',
        authorizationHeader: 'Bearer ba_raw_valid',
        clientIp: '127.0.0.1',
        context,
      },
      authDeps(),
    )

    const mcpAuth = context.mcpAuth as {
      apiKeyId: string
      authUserId: string
      caller: ExchangedMcpCredential['caller']
    }
    expect(mcpAuth.apiKeyId).toBe('ba_key_valid')
    expect(mcpAuth.authUserId).toBe('user-1')
    expect(mcpAuth.caller).toBe(narrowCaller)
    expect(typeof mcpAuth.caller.query).toBe('function')

    // The whole context must never carry the exchanged JWT under any key.
    expect(JSON.stringify(context)).not.toContain('convexAuthToken')
    expect('convexAuthToken' in mcpAuth).toBe(false)

    // Exactly one exchange for a valid credential.
    expect(exchangeSpy).toHaveBeenCalledTimes(1)
    expect(exchangeSpy).toHaveBeenCalledWith('ba_raw_valid')
    expect(accessSpy).toHaveBeenCalledWith('ba_key_valid', narrowCaller)
  })

  it('does not enable spoofable forwarded IP parsing in the Nitro middleware', async () => {
    const middlewarePath = fileURLToPath(
      new URL('../../packages/cms/src/server/middleware/mcp-auth.ts', import.meta.url),
    )
    const source = await readFile(middlewarePath, 'utf8')

    expect(source).toContain('clientIp: resolveMcpClientIp(event)')
    expect(source).not.toContain('xForwardedFor: true')
  })

  it('uses the library token exchange, never a bespoke API-key verify HTTP route', async () => {
    const middlewarePath = fileURLToPath(
      new URL('../../packages/cms/src/server/middleware/mcp-auth.ts', import.meta.url),
    )
    const source = await readFile(middlewarePath, 'utf8')

    expect(source).toContain('exchangeConvexToken')
    expect(source).toContain('normalizeSiteUrl')
    expect(source).toContain('runtimeConfig.public?.convex?.siteUrl')
    expect(source).not.toContain('/api-key/verify')
    expect(source).not.toContain('process.env.GINKO_CMS_BETTER_AUTH_BASE_URL')
    expect(source).not.toContain('process.env.CONVEX_SITE_URL')
    expect(source).not.toContain('process.env.BETTER_AUTH_URL')
    // The raw JWT is never fetched twice nor stored in the middleware itself.
    expect(source).not.toContain('convexAuthToken')
  })

  it('rejects invalid credentials, charges the budget once each, and rate-limits', async () => {
    exchangeOutcome = 'invalid'
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const context: Record<string, unknown> = {}
      await expect(
        authenticateMcpRequestContext(
          {
            path: '/mcp',
            authorizationHeader: 'Bearer ba_raw_invalid',
            clientIp: '127.0.0.1',
            context,
          },
          authDeps(),
        ),
      ).rejects.toMatchObject({ statusCode: 401 })
      expect(context.mcpAuth).toBeUndefined()
    }

    // One exchange attempt per request, one budget entry per failure.
    expect(exchangeSpy).toHaveBeenCalledTimes(5)
    expect([...storageData.values()].map((values) => values.length).sort()).toEqual([5, 5])
    expect([...storageData.keys()].join('\n')).not.toContain('ba_raw_invalid')

    await expect(
      authenticateMcpRequestContext(
        {
          path: '/mcp',
          authorizationHeader: 'Bearer ba_raw_invalid',
          clientIp: '127.0.0.1',
          context: {},
        },
        authDeps(),
      ),
    ).rejects.toMatchObject({ statusCode: 429 })
  })

  it('returns 503 for an infrastructure/transport failure without charging the budget', async () => {
    exchangeOutcome = 'transport'

    await expect(
      authenticateMcpRequestContext(
        {
          path: '/mcp',
          authorizationHeader: 'Bearer ba_raw_unavailable',
          clientIp: '127.0.0.1',
          context: {},
        },
        authDeps(),
      ),
    ).rejects.toMatchObject({ statusCode: 503 })

    // Exactly one exchange attempt, and NO failure budget entry recorded.
    expect(exchangeSpy).toHaveBeenCalledTimes(1)
    expect([...storageData.values()]).toEqual([])
  })

  it('does not leak rejected MCP bearer tokens in auth failures or limiter storage', async () => {
    exchangeOutcome = 'invalid'
    const rawToken = 'ba_raw_expired_or_deleted_secret'

    await expect(
      authenticateMcpRequestContext(
        {
          path: '/mcp',
          authorizationHeader: `Bearer ${rawToken}`,
          clientIp: '127.0.0.1',
          context: {},
        },
        authDeps(),
      ),
    ).rejects.toSatisfy((error: unknown) => {
      const rendered = `${error instanceof Error ? error.message : String(error)} ${String(
        (error as { statusMessage?: unknown }).statusMessage ?? '',
      )}`
      return !rendered.includes(rawToken)
    })

    expect([...storageData.keys()].join('\n')).not.toContain(rawToken)
  })

  it('rejects a claim/access mismatch with exactly one 401 failure charge', async () => {
    exchangeOutcome = 'valid'
    // resolved owner differs from the decoded claim -> exactly one failure, 401.
    accessResult = { apiKeyId: 'ba_key_valid', ownerUserId: 'other-user' }
    const context: Record<string, unknown> = {}

    await expect(
      authenticateMcpRequestContext(
        {
          path: '/mcp',
          authorizationHeader: 'Bearer ba_raw_valid',
          clientIp: '127.0.0.1',
          context,
        },
        authDeps(),
      ),
    ).rejects.toMatchObject({ statusCode: 401 })

    expect(context.mcpAuth).toBeUndefined()
    expect(exchangeSpy).toHaveBeenCalledTimes(1)
    // Exactly one failure charge (one entry per IP + hash bucket).
    expect([...storageData.values()].map((values) => values.length).sort()).toEqual([1, 1])
  })

  it('rejects a missing credential-settings record with one 401 charge', async () => {
    exchangeOutcome = 'valid'
    accessResult = null

    await expect(
      authenticateMcpRequestContext(
        {
          path: '/mcp',
          authorizationHeader: 'Bearer ba_raw_valid',
          clientIp: '127.0.0.1',
          context: {},
        },
        authDeps(),
      ),
    ).rejects.toMatchObject({ statusCode: 401 })

    expect(exchangeSpy).toHaveBeenCalledTimes(1)
    expect([...storageData.values()].map((values) => values.length).sort()).toEqual([1, 1])
  })

  it('uses the grace path when storage fails after a healthy storage read', async () => {
    exchangeOutcome = 'valid'
    accessResult = { apiKeyId: 'ba_key_prime', ownerUserId: 'user-1' }
    // Prime a healthy read so the grace window is active.
    accessResult = { apiKeyId: 'ba_key_valid', ownerUserId: 'user-1' }
    await authenticateMcpRequestContext(
      {
        path: '/mcp',
        authorizationHeader: 'Bearer ba_raw_prime',
        clientIp: '127.0.0.1',
        context: {},
      },
      authDeps(),
    )

    exchangeOutcome = 'invalid'
    accessResult = null
    storageFailure = true

    await expect(
      authenticateMcpRequestContext(
        {
          path: '/mcp',
          authorizationHeader: 'Bearer ba_raw_grace',
          clientIp: '127.0.0.1',
          context: {},
        },
        authDeps(),
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects missing MCP bearer tokens before any exchange', async () => {
    await expect(
      authenticateMcpRequestContext(
        {
          path: '/mcp',
          authorizationHeader: null,
          clientIp: '127.0.0.1',
          context: {},
        },
        {
          createError: (input) => Object.assign(new Error(input.statusMessage), input),
          getStorage: async () => {
            throw new Error('storage should not be read')
          },
          exchangeCredential: async () => {
            throw new Error('credential should not be exchanged')
          },
          resolveCredentialAccess: async () => {
            throw new Error('credential access should not be resolved')
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
