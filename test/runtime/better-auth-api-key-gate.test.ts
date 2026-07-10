import { apiKey } from '@better-auth/api-key'
import { apiKeyClient } from '@better-auth/api-key/client'
import { createAuthClient } from 'better-auth/client'
import { getTestInstance } from 'better-auth/test'
import { describe, expect, it } from 'vitest'

import { parseMcpBearerApiKey } from '../../packages/cms/src/server/mcp/_shared/better-auth-api-key.js'

// The production verifier helper was collapsed into the single library-owned
// token exchange (vNext §10.9). This gate still proves Better Auth API keys work
// as MCP credentials via Bearer parsing, so it reconstructs the tiny parse +
// verify shape locally rather than depending on a deleted helper.
type BearerVerify = (input: { key: string }) => Promise<{
  valid: boolean
  key: { id: string; referenceId: string } | null
}>

async function verifyMcpBearerApiKey(
  authorizationHeader: string | null | undefined,
  verify: BearerVerify,
): Promise<{ betterAuthApiKeyId: string; authUserId: string } | null> {
  const key = parseMcpBearerApiKey(authorizationHeader)
  if (!key) return null
  const result = await verify({ key })
  if (!result.valid || !result.key) return null
  return { betterAuthApiKeyId: result.key.id, authUserId: result.key.referenceId }
}

const apiKeyPlugin = apiKey({
  enableMetadata: true,
  keyExpiration: {
    defaultExpiresIn: 60 * 60 * 24,
    minExpiresIn: 0,
    maxExpiresIn: 365,
  },
  rateLimit: {
    enabled: false,
  },
})

async function createApiKeyProofInstance(plugin = apiKeyPlugin) {
  const instance = await getTestInstance({
    plugins: [plugin],
  })
  const client = createAuthClient({
    baseURL: 'http://localhost:3000/api/auth',
    plugins: [apiKeyClient()],
    fetchOptions: {
      customFetchImpl: instance.customFetchImpl,
    },
  })

  const signedIn = await instance.signInWithTestUser()
  return {
    ...instance,
    apiKeyClient: client.apiKey,
    signedIn,
  }
}

describe('Gate 2: Better Auth API keys as MCP credentials', () => {
  it('creates and verifies an authenticated user-owned API key through Bearer parsing', async () => {
    const instance = await createApiKeyProofInstance()
    const created = await instance.apiKeyClient.create({
      name: 'Codex MCP',
      expiresIn: 60 * 60,
      metadata: {
        purpose: 'mcp',
      },
      fetchOptions: {
        headers: instance.signedIn.headers,
      },
    })

    expect(created.error).toBeNull()
    const rawKey = created.data?.key
    expect(typeof rawKey).toBe('string')
    expect(rawKey).not.toHaveLength(0)

    const verified = await verifyMcpBearerApiKey(`Bearer ${rawKey}`, async ({ key }) => {
      return await instance.auth.api.verifyApiKey({
        body: { key },
      })
    })

    expect(verified).toEqual({
      betterAuthApiKeyId: created.data?.id,
      authUserId: instance.signedIn.user.id,
    })
    expect(JSON.stringify(verified)).not.toContain(rawKey)
  })

  it('uses an explicit Bearer adapter because the API-key plugin defaults to x-api-key', async () => {
    expect(parseMcpBearerApiKey(null)).toBeNull()
    expect(parseMcpBearerApiKey('x-api-key abc')).toBeNull()
    expect(parseMcpBearerApiKey('Bearer   ')).toBeNull()
    expect(parseMcpBearerApiKey('Bearer ba_123')).toBe('ba_123')

    const plugin = apiKey({
      customAPIKeyGetter(ctx) {
        const authorization = ctx.headers?.get('authorization')
        return parseMcpBearerApiKey(authorization)
      },
      enableSessionForAPIKeys: true,
      rateLimit: {
        enabled: false,
      },
    })

    expect(plugin.id).toBe('api-key')
  })

  it('rejects deleted and expired API keys', async () => {
    const instance = await createApiKeyProofInstance()
    const created = await instance.apiKeyClient.create({
      name: 'Temporary MCP',
      expiresIn: 1,
      fetchOptions: {
        headers: instance.signedIn.headers,
      },
    })
    const rawKey = created.data?.key
    expect(rawKey).toBeDefined()

    await expect(
      verifyMcpBearerApiKey(`Bearer ${rawKey}`, async ({ key }) => {
        return await instance.auth.api.verifyApiKey({
          body: { key },
        })
      }),
    ).resolves.toMatchObject({
      betterAuthApiKeyId: created.data?.id,
    })

    await instance.apiKeyClient.delete({
      keyId: created.data!.id,
      fetchOptions: {
        headers: instance.signedIn.headers,
      },
    })

    await expect(
      verifyMcpBearerApiKey(`Bearer ${rawKey}`, async ({ key }) => {
        return await instance.auth.api.verifyApiKey({
          body: { key },
        })
      }),
    ).resolves.toBeNull()

    const expiring = await instance.apiKeyClient.create({
      name: 'Expiring MCP',
      expiresIn: 1,
      fetchOptions: {
        headers: instance.signedIn.headers,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 1100))

    await expect(
      verifyMcpBearerApiKey(`Bearer ${expiring.data?.key}`, async ({ key }) => {
        return await instance.auth.api.verifyApiKey({
          body: { key },
        })
      }),
    ).resolves.toBeNull()
  })

  it('rate-limits API-key verification without a separate session lookup', async () => {
    const instance = await createApiKeyProofInstance(
      apiKey({
        rateLimit: {
          enabled: true,
          maxRequests: 1,
          timeWindow: 60_000,
        },
      }),
    )
    const created = await instance.apiKeyClient.create({
      name: 'Rate Limited MCP',
      fetchOptions: {
        headers: instance.signedIn.headers,
      },
    })
    const rawKey = created.data!.key

    const first = await instance.auth.api.verifyApiKey({
      body: { key: rawKey },
    })
    const second = await instance.auth.api.verifyApiKey({
      body: { key: rawKey },
    })

    expect(first.valid).toBe(true)
    expect(second.valid).toBe(false)
    expect(second.error?.code).toBe('RATE_LIMITED')
  })
})
