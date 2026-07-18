import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  authenticateMcpRequestContext,
  type AuthenticateDeps,
  type ExchangedMcpCredential,
} from '#ginko-cms-server/mcp/_shared/request-auth'

type Attempt = { requestId: string; timestamp: number }

const buckets = new Map<string, Attempt[]>()
let recordQueue = Promise.resolve()
const callerQuery = vi.fn()
const narrowCaller: ExchangedMcpCredential['caller'] = {
  query: callerQuery,
  mutation: vi.fn(),
  action: vi.fn(),
}

type ExchangeOutcome = 'valid' | 'invalid' | 'transport' | 'rate-limited'
let exchangeOutcome: ExchangeOutcome = 'invalid'
let accessResult: { apiKeyId: string; ownerUserId: string } | null = null

const exchangeSpy = vi.fn(async (): Promise<ExchangedMcpCredential | null> => {
  if (exchangeOutcome === 'valid') {
    return { apiKeyId: 'ba_key_valid', ownerUserId: 'user-1', caller: narrowCaller }
  }
  if (exchangeOutcome === 'transport') throw new Error('transport unavailable')
  if (exchangeOutcome === 'rate-limited') {
    throw Object.assign(new Error('upstream rate limited'), { statusCode: 429 })
  }
  return null
})
const accessSpy = vi.fn(async () => accessResult)

function active(key: string, now: number, windowMs: number) {
  return (buckets.get(key) ?? []).filter((attempt) => now - attempt.timestamp < windowMs)
}

function authDeps(overrides: Partial<AuthenticateDeps> = {}): AuthenticateDeps {
  return {
    createError: (input) => Object.assign(new Error(input.statusMessage), input),
    limiterSecret: 'test-better-auth-secret',
    checkFailureBudget: async (args) => ({
      limited:
        active(args.ipBucketKey, args.timestamp, 60_000).length >= 30 ||
        active(args.credentialBucketKey, args.timestamp, 300_000).length >= 5,
    }),
    recordFailure: async (args) => {
      const result = { limited: false }
      recordQueue = recordQueue.then(async () => {
        const configs = [
          { key: args.ipBucketKey, max: 30, windowMs: 60_000 },
          { key: args.credentialBucketKey, max: 5, windowMs: 300_000 },
        ]
        for (const config of configs) {
          const attempts = active(config.key, args.timestamp, config.windowMs)
          if (attempts.some((attempt) => attempt.requestId === args.requestId)) {
            result.limited ||= attempts.length >= config.max
            continue
          }
          if (attempts.length >= config.max) {
            result.limited = true
            continue
          }
          attempts.push({ requestId: args.requestId, timestamp: args.timestamp })
          buckets.set(config.key, attempts)
        }
      })
      await recordQueue
      return result
    },
    exchangeCredential: async (credential) => exchangeSpy(credential),
    resolveCredentialAccess: async () => accessSpy(),
    ...overrides,
  }
}

async function authenticate(args: {
  token?: string
  ip?: string
  deps?: Partial<AuthenticateDeps>
  context?: Record<string, unknown>
}) {
  return await authenticateMcpRequestContext(
    {
      path: '/mcp',
      authorizationHeader: args.token === undefined ? null : `Bearer ${args.token}`,
      clientIp: args.ip ?? '127.0.0.1',
      context: args.context ?? {},
    },
    authDeps(args.deps),
  )
}

describe('ginko mcp auth middleware', () => {
  beforeEach(() => {
    buckets.clear()
    recordQueue = Promise.resolve()
    exchangeOutcome = 'invalid'
    accessResult = null
    exchangeSpy.mockClear()
    accessSpy.mockClear()
    callerQuery.mockClear()
  })

  it('stores validated claims and the narrow caller, never the raw JWT', async () => {
    exchangeOutcome = 'valid'
    accessResult = { apiKeyId: 'ba_key_valid', ownerUserId: 'user-1' }
    const context: Record<string, unknown> = {}
    await authenticate({ token: 'ba_raw_valid', context })

    expect(context.mcpAuth).toEqual({
      apiKeyId: 'ba_key_valid',
      authUserId: 'user-1',
      caller: narrowCaller,
    })
    expect(JSON.stringify(context)).not.toContain('convexAuthToken')
    expect(exchangeSpy).toHaveBeenCalledOnce()
  })

  it('uses the real client IP and a signed unauthenticated host bridge', async () => {
    const middlewarePath = fileURLToPath(
      new URL('../../packages/cms/src/server/middleware/mcp-auth.ts', import.meta.url),
    )
    const source = await readFile(middlewarePath, 'utf8')
    expect(source).toContain('clientIp: resolveMcpClientIp(event)')
    expect(source).toContain("serverConvex(event, { auth: 'none' })")
    expect(source).not.toContain('xForwardedFor: true')
    expect(source).not.toContain('useStorage')
  })

  it('atomically records five concurrent invalid attempts and limits the next request', async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        expect(
          authenticate({
            token: 'ba_raw_concurrent_invalid',
            deps: { requestId: () => `request-${index}` },
          }),
        ).rejects.toMatchObject({ statusCode: 401 }),
      ),
    )

    expect([...buckets.values()].map((attempts) => attempts.length).sort()).toEqual([5, 5])
    await expect(authenticate({ token: 'ba_raw_concurrent_invalid' })).rejects.toMatchObject({
      statusCode: 429,
    })
  })

  it('keeps IP and credential budgets independent', async () => {
    for (let index = 0; index < 5; index += 1) {
      await expect(
        authenticate({ token: 'same-bad-token', ip: `10.0.0.${index}` }),
      ).rejects.toMatchObject({ statusCode: 401 })
    }
    await expect(authenticate({ token: 'same-bad-token', ip: '10.0.0.99' })).rejects.toMatchObject({
      statusCode: 429,
    })
    await expect(
      authenticate({ token: 'different-bad-token', ip: '10.0.0.99' }),
    ).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('does not charge successful or transport-failed authentication', async () => {
    exchangeOutcome = 'valid'
    accessResult = { apiKeyId: 'ba_key_valid', ownerUserId: 'user-1' }
    await authenticate({ token: 'valid-token' })
    expect(buckets.size).toBe(0)

    exchangeOutcome = 'transport'
    await expect(authenticate({ token: 'unavailable-token' })).rejects.toMatchObject({
      statusCode: 503,
    })
    expect(buckets.size).toBe(0)
  })

  it('preserves upstream 429 separately from invalid credentials and infrastructure failures', async () => {
    exchangeOutcome = 'rate-limited'
    await expect(authenticate({ token: 'rate-limited-token' })).rejects.toMatchObject({
      statusCode: 429,
    })
    expect(buckets.size).toBe(0)

    exchangeOutcome = 'invalid'
    await expect(authenticate({ token: 'invalid-token' })).rejects.toMatchObject({
      statusCode: 401,
    })

    await expect(
      authenticate({
        token: 'limiter-down',
        deps: { checkFailureBudget: async () => Promise.reject(new Error('convex down')) },
      }),
    ).rejects.toMatchObject({ statusCode: 503 })
  })

  it('records access mismatches exactly once', async () => {
    exchangeOutcome = 'valid'
    accessResult = { apiKeyId: 'ba_key_valid', ownerUserId: 'other-user' }
    await expect(authenticate({ token: 'valid-token' })).rejects.toMatchObject({ statusCode: 401 })
    expect([...buckets.values()].map((attempts) => attempts.length).sort()).toEqual([1, 1])
  })

  it('returns 401 when an exchanged key has been revoked from CMS access', async () => {
    exchangeOutcome = 'valid'
    accessResult = null

    await expect(authenticate({ token: 'revoked-key' })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Invalid MCP credential settings',
    })
    expect(accessSpy).toHaveBeenCalledOnce()
    expect([...buckets.values()].map((attempts) => attempts.length).sort()).toEqual([1, 1])
  })

  it('signs a delayed failure record with a fresh timestamp', async () => {
    const timestamps: number[] = []
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(45_000)

    await expect(
      authenticate({
        token: 'slow-invalid-token',
        deps: {
          now,
          checkFailureBudget: async (args) => {
            timestamps.push(args.timestamp)
            return { limited: false }
          },
          recordFailure: async (args) => {
            timestamps.push(args.timestamp)
            return { limited: false }
          },
        },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })

    expect(timestamps).toEqual([1_000, 45_000])
  })

  it('never transmits or stores raw client IPs or credentials in limiter state', async () => {
    const rawToken = 'ba_raw_expired_or_deleted_secret'
    const rawIp = '203.0.113.47'
    await expect(authenticate({ token: rawToken, ip: rawIp })).rejects.toMatchObject({
      statusCode: 401,
    })
    const rendered = JSON.stringify([...buckets.entries()])
    expect(rendered).not.toContain(rawToken)
    expect(rendered).not.toContain(rawIp)
    expect([...buckets.keys()]).toSatisfy((keys: string[]) =>
      keys.every((key) => /^[a-f0-9]{64}$/.test(key)),
    )
  })

  it('rejects missing MCP bearer tokens before limiter or exchange work', async () => {
    const checkFailureBudget = vi.fn()
    await expect(authenticate({ deps: { checkFailureBudget } })).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(checkFailureBudget).not.toHaveBeenCalled()
    expect(exchangeSpy).not.toHaveBeenCalled()
  })
})
