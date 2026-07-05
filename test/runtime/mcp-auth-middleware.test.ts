import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  authenticateMcpRequestContext,
  resetMcpAuthState,
} from '#ginko-cms-server/mcp/_shared/request-auth'

type StorageValue = number[]

const storageData = new Map<string, StorageValue>()
let storageFailure = false
let verifyResult: { valid: boolean; key: { id: string; referenceId: string } | null } = {
  valid: false,
  key: null,
}
let accessResult: { apiKeyId: string; ownerUserId: string } | null = null
const verifySpy = vi.fn(async () => verifyResult)
const tokenSpy = vi.fn(async () => 'convex-token-valid')
const accessSpy = vi.fn(async () => accessResult)

function createEvent(token: string) {
  return {
    path: '/mcp',
    context: {},
    node: {
      req: {
        headers: {
          authorization: `Bearer ${token}`,
          'x-forwarded-for': '127.0.0.1',
        },
        socket: {
          remoteAddress: '127.0.0.1',
        },
      },
    },
  } as never
}

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
    verifyApiKey: async (input: { key: string }) => verifySpy(input),
    getConvexAuthToken: async (apiKey: string) => tokenSpy(apiKey),
    resolveCredentialAccess: async (apiKeyId: string, convexAuthToken: string) =>
      accessSpy(apiKeyId, convexAuthToken),
  }
}

describe('ginko mcp auth middleware', () => {
  beforeEach(() => {
    storageData.clear()
    storageFailure = false
    verifyResult = { valid: false, key: null }
    accessResult = null
    verifySpy.mockClear()
    tokenSpy.mockClear()
    accessSpy.mockClear()
    resetMcpAuthState()
  })

  it('stores authenticated MCP context for a valid Better Auth API key', async () => {
    verifyResult = { valid: true, key: { id: 'ba_key_valid', referenceId: 'user-1' } }
    accessResult = { apiKeyId: 'ba_key_valid', ownerUserId: 'user-1' }
    const event = createEvent('ba_raw_valid')

    await authenticateMcpRequestContext(
      {
        path: event.path,
        authorizationHeader: event.node.req.headers.authorization,
        clientIp: event.node.req.headers['x-forwarded-for'],
        context: event.context,
      },
      authDeps(),
    )

    expect(event.context.mcpAuth).toEqual({
      apiKeyId: 'ba_key_valid',
      authUserId: 'user-1',
      convexAuthToken: 'convex-token-valid',
    })
    expect(verifySpy).toHaveBeenCalledWith({ key: 'ba_raw_valid' })
    expect(tokenSpy).toHaveBeenCalledWith('ba_raw_valid')
    expect(accessSpy).toHaveBeenCalledWith('ba_key_valid', 'convex-token-valid')
  })

  it('does not enable spoofable forwarded IP parsing in the Nitro middleware', async () => {
    const middlewarePath = fileURLToPath(
      new URL('../../packages/cms/src/server/middleware/mcp-auth.ts', import.meta.url),
    )
    const source = await readFile(middlewarePath, 'utf8')

    expect(source).toContain('clientIp: resolveMcpClientIp(event)')
    expect(source).not.toContain('xForwardedFor: true')
  })

  it('does not call the API-key verify HTTP route that Better Auth does not expose', async () => {
    const middlewarePath = fileURLToPath(
      new URL('../../packages/cms/src/server/middleware/mcp-auth.ts', import.meta.url),
    )
    const source = await readFile(middlewarePath, 'utf8')

    expect(source).toContain('/convex/token')
    expect(source).not.toContain('/api-key/verify')
  })

  it('rejects invalid API keys and rate-limits repeated failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const event = createEvent('ba_raw_invalid')
      await expect(
        authenticateMcpRequestContext(
          {
            path: event.path,
            authorizationHeader: event.node.req.headers.authorization,
            clientIp: event.node.req.headers['x-forwarded-for'],
            context: event.context,
          },
          authDeps(),
        ),
      ).rejects.toMatchObject({ statusCode: 401 })
      expect(event.context.mcpAuth).toBeUndefined()
    }

    expect(verifySpy).toHaveBeenCalledTimes(5)
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

  it('does not leak rejected MCP bearer tokens in auth failures or limiter storage', async () => {
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

  it('rejects verified API keys without matching active CMS credential settings', async () => {
    verifyResult = { valid: true, key: { id: 'ba_key_valid', referenceId: 'user-1' } }
    accessResult = { apiKeyId: 'ba_key_valid', ownerUserId: 'other-user' }

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
  })

  it('uses the grace path when storage fails after a healthy storage read', async () => {
    verifyResult = { valid: true, key: { id: 'ba_key_prime', referenceId: 'user-1' } }
    accessResult = { apiKeyId: 'ba_key_prime', ownerUserId: 'user-1' }
    await authenticateMcpRequestContext(
      {
        path: '/mcp',
        authorizationHeader: 'Bearer ba_raw_prime',
        clientIp: '127.0.0.1',
        context: {},
      },
      authDeps(),
    )
    verifyResult = { valid: false, key: null }
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

  it('rejects missing MCP bearer tokens', async () => {
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
          verifyApiKey: async () => {
            throw new Error('token should not be verified')
          },
          getConvexAuthToken: async () => {
            throw new Error('Convex token should not be requested')
          },
          resolveCredentialAccess: async () => {
            throw new Error('credential access should not be resolved')
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
