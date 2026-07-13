import { apiKey } from '@better-auth/api-key'
import { apiKeyClient } from '@better-auth/api-key/client'
import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import { convex } from '@convex-dev/better-auth/plugins'
import { createAuthClient } from 'better-auth/client'
import { getTestInstance } from 'better-auth/test'
import { describe, expect, it } from 'vitest'

import {
  ginkoConvexJwtPayload,
  ginkoCredentialKindPlugin,
  requireBetterAuthSecret,
} from '../src/auth/credentialKind.js'

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

function extractSessionCookie(response: Response): string | null {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) return null
  return setCookie.split(';')[0] ?? null
}

const TEST_USER = {
  email: 'api-key-convex-token@test.com',
  password: 'test123456',
  name: 'API-key Convex token user',
} as const

describe('Better Auth API-key Convex token sessions', () => {
  it('requires the deployment auth secret instead of inventing one', () => {
    const previous = process.env.BETTER_AUTH_SECRET
    delete process.env.BETTER_AUTH_SECRET
    try {
      expect(() => requireBetterAuthSecret()).toThrow('BETTER_AUTH_SECRET is required')
      process.env.BETTER_AUTH_SECRET = 'test-secret'
      expect(requireBetterAuthSecret()).toBe('test-secret')
    } finally {
      if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
      else process.env.BETTER_AUTH_SECRET = previous
    }
  })

  it('issues Convex auth tokens for Bearer API-key sessions with an explicit MCP credential kind', async () => {
    const previousSiteUrl = process.env.CONVEX_SITE_URL
    process.env.CONVEX_SITE_URL = 'http://localhost:3000'
    try {
      // `disableTestUser: true` is required: the Convex plugin no-ops every
      // adapter write whenever `adapter.options.isRunMutationCtx` is falsy, so
      // the harness' built-in test-user sign-up (which runs *inside*
      // getTestInstance, before we can touch the adapter) would fail with
      // "Failed to create user". We create the user ourselves below, after the
      // adapter has been marked write-capable.
      const instance = await getTestInstance(
        {
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
            ginkoCredentialKindPlugin(),
            convex({
              authConfig: {
                providers: [getAuthConfigProvider()],
              },
              jwt: {
                definePayload: ginkoConvexJwtPayload,
              },
            }),
          ],
        },
        { disableTestUser: true },
      )

      // The @convex-dev/better-auth Convex plugin guards writes with a
      // `before` hook that no-ops adapter create/update/delete unless the
      // adapter reports `isRunMutationCtx`. In production that flag comes from a
      // real Convex mutation ctx; under getTestInstance the adapter is an
      // in-memory Kysely/SQLite adapter that is *always* write-capable, so the
      // guard is spuriously tripped. Marking the adapter as a mutation ctx
      // reflects reality (writes here always succeed) and lets the API-key ->
      // Convex-token exchange run end-to-end against the in-memory database.
      const authContext = await instance.auth.$context
      authContext.adapter.options = {
        ...authContext.adapter.options,
        isRunMutationCtx: true,
      }

      const client = createAuthClient({
        baseURL: 'http://localhost:3000/api/auth',
        plugins: [apiKeyClient()],
        fetchOptions: {
          customFetchImpl: instance.customFetchImpl,
        },
      })

      const signUp = await instance.auth.api.signUpEmail({ body: { ...TEST_USER } })
      const userId = signUp.user.id
      expect(userId).toBeTruthy()

      const signInResponse = await instance.customFetchImpl(
        'http://localhost:3000/api/auth/sign-in/email',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
        },
      )
      expect(signInResponse.ok).toBe(true)
      const sessionCookie = extractSessionCookie(signInResponse)
      expect(sessionCookie).toBeTruthy()
      const signedInHeaders = new Headers({ cookie: sessionCookie as string })

      const browserTokenResponse = await instance.customFetchImpl(
        'http://localhost:3000/api/auth/convex/token',
        { method: 'GET', headers: signedInHeaders },
      )
      expect(browserTokenResponse.ok).toBe(true)
      const browserTokenBody = (await browserTokenResponse.json()) as { token?: unknown }
      const browserPayload = decodeJwtPayload(browserTokenBody.token as string)
      expect(browserPayload.sub).toBe(userId)
      expect(browserPayload.ginkoCredentialKind).toBe('user-session')

      const created = await client.apiKey.create({
        name: 'Convex MCP',
        fetchOptions: {
          headers: signedInHeaders,
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
      expect(payload.sub).toBe(userId)
      expect(payload.sessionId).toBe(created.data?.id)
      expect(payload.ginkoCredentialKind).toBe('mcp-api-key')
    } finally {
      if (previousSiteUrl === undefined) {
        delete process.env.CONVEX_SITE_URL
      } else {
        process.env.CONVEX_SITE_URL = previousSiteUrl
      }
    }
  })
})
