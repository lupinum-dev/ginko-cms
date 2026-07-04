import { apiKey } from '@better-auth/api-key'
import { apiKeyClient } from '@better-auth/api-key/client'
import { getAuthConfigProvider } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { createAuthClient } from 'better-auth/client'
import { getTestInstance } from 'better-auth/test'
import { describe, expect, it } from 'vitest'

function parseBearerApiKey(authorizationHeader?: string | null): string | null {
  const prefix = 'Bearer '
  if (!authorizationHeader?.startsWith(prefix)) return null

  const token = authorizationHeader.slice(prefix.length).trim()
  return token.length > 0 ? token : null
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('JWT payload is missing.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}

describe('Better Auth API-key Convex token sessions', () => {
  it('issues Convex auth tokens for Bearer API-key sessions with the API key id as sessionId', async () => {
    const previousSiteUrl = process.env.CONVEX_SITE_URL
    process.env.CONVEX_SITE_URL = 'http://localhost:3000'
    try {
      const instance = await getTestInstance({
        plugins: [
          apiKey({
            customAPIKeyGetter(ctx) {
              return parseBearerApiKey(ctx.headers?.get('authorization'))
            },
            enableSessionForAPIKeys: true,
            rateLimit: {
              enabled: false,
            },
          }),
          convex({
            authConfig: {
              providers: [getAuthConfigProvider()],
            },
          }),
        ],
      })
      const client = createAuthClient({
        baseURL: 'http://localhost:3000/api/auth',
        plugins: [apiKeyClient()],
        fetchOptions: {
          customFetchImpl: instance.customFetchImpl,
        },
      })
      const signedIn = await instance.signInWithTestUser()
      const created = await client.apiKey.create({
        name: 'Convex MCP',
        fetchOptions: {
          headers: signedIn.headers,
        },
      })
      const rawKey = created.data?.key
      expect(rawKey).toBeDefined()

      const tokenResponse = await instance.customFetchImpl(
        'http://localhost:3000/api/auth/convex/token',
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${rawKey}`,
          },
        },
      )
      expect(tokenResponse.ok).toBe(true)

      const body = (await tokenResponse.json()) as { token?: unknown }
      expect(typeof body.token).toBe('string')
      const payload = decodeJwtPayload(body.token as string)
      expect(payload.sub).toBe(signedIn.user.id)
      expect(payload.sessionId).toBe(created.data?.id)
    } finally {
      if (previousSiteUrl === undefined) {
        delete process.env.CONVEX_SITE_URL
      } else {
        process.env.CONVEX_SITE_URL = previousSiteUrl
      }
    }
  })
})
