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
let consumeResult: { mcpKeyId: string } | null = null
const mutationSpy = vi.fn(async () => consumeResult)

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

describe('ginko mcp auth middleware', () => {
  beforeEach(() => {
    storageData.clear()
    storageFailure = false
    consumeResult = null
    mutationSpy.mockClear()
    resetMcpAuthState()
  })

  it('stores authenticated MCP context for a valid token', async () => {
    consumeResult = { mcpKeyId: 'key_valid' }
    const event = createEvent('mcp_valid')

    await authenticateMcpRequestContext(
      {
        path: event.path,
        authorizationHeader: event.node.req.headers.authorization,
        clientIp: event.node.req.headers['x-forwarded-for'],
        context: event.context,
      },
      {
        createError: (input) => Object.assign(new Error(input.statusMessage), input),
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
        consumeToken: async (input) => {
          expect(input.clientIp).toBe('127.0.0.1')
          mutationSpy(input)
          return consumeResult
        },
      },
    )

    expect(event.context.mcpAuth).toEqual({
      mcpKeyId: 'key_valid',
    })
    expect(mutationSpy).toHaveBeenCalledTimes(1)
  })

  it('does not enable spoofable forwarded IP parsing in the Nitro middleware', async () => {
    const middlewarePath = fileURLToPath(
      new URL('../../packages/cms/src/server/middleware/mcp-auth.ts', import.meta.url),
    )
    const source = await readFile(middlewarePath, 'utf8')

    expect(source).toContain('clientIp: resolveMcpClientIp(event)')
    expect(source).not.toContain('xForwardedFor: true')
  })

  it('rejects invalid tokens and rate-limits repeated failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const event = createEvent('mcp_invalid')
      await expect(
        authenticateMcpRequestContext(
          {
            path: event.path,
            authorizationHeader: event.node.req.headers.authorization,
            clientIp: event.node.req.headers['x-forwarded-for'],
            context: event.context,
          },
          {
            createError: (input) => Object.assign(new Error(input.statusMessage), input),
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
            consumeToken: async (input) => {
              mutationSpy(input)
              return consumeResult
            },
          },
        ),
      ).rejects.toMatchObject({ statusCode: 401 })
      expect(event.context.mcpAuth).toBeUndefined()
    }

    await expect(
      authenticateMcpRequestContext(
        {
          path: '/mcp',
          authorizationHeader: 'Bearer mcp_invalid',
          clientIp: '127.0.0.1',
          context: {},
        },
        {
          createError: (input) => Object.assign(new Error(input.statusMessage), input),
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
          consumeToken: async (input) => {
            mutationSpy(input)
            return consumeResult
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 429 })
  })

  it('uses the grace path when storage fails after a healthy storage read', async () => {
    consumeResult = { mcpKeyId: 'key_prime' }
    await authenticateMcpRequestContext(
      {
        path: '/mcp',
        authorizationHeader: 'Bearer mcp_prime',
        clientIp: '127.0.0.1',
        context: {},
      },
      {
        createError: (input) => Object.assign(new Error(input.statusMessage), input),
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
        consumeToken: async (input) => {
          mutationSpy(input)
          return consumeResult
        },
      },
    )
    consumeResult = null
    storageFailure = true

    await expect(
      authenticateMcpRequestContext(
        {
          path: '/mcp',
          authorizationHeader: 'Bearer mcp_grace',
          clientIp: '127.0.0.1',
          context: {},
        },
        {
          createError: (input) => Object.assign(new Error(input.statusMessage), input),
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
          consumeToken: async (input) => {
            mutationSpy(input)
            return consumeResult
          },
        },
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
          consumeToken: async () => {
            throw new Error('token should not be consumed')
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
