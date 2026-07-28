import { memoryAdapter } from 'better-auth/adapters/memory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = {
  account: [],
  jwks: [],
  oauthAccessToken: [],
  oauthApplication: [],
  oauthConsent: [],
  rateLimit: [],
  session: [],
  user: [],
  verification: [],
}

vi.mock('better-convex-nuxt/convex-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-convex-nuxt/convex-auth')>()
  return {
    ...actual,
    createAuthComponent: () => ({
      adapter: () => memoryAdapter(database),
      jwksOperatorFunctions: () => ({}),
    }),
    getConvexAuthProvider: () => ({
      algorithm: 'RS256',
      applicationID: 'convex',
      issuer: 'https://convex.example.test',
      type: 'customJwt',
    }),
    requireAuthOrigin: (name: string) =>
      name === 'SITE_URL' ? 'https://app.example.test' : 'https://convex.example.test',
  }
})

const { defineGinkoAuth } = await import('../../packages/convex/src/convex.auth')

describe('Ginko Better Convex auth runtime compatibility', () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRETS =
      '0:d0f9e60506f248f7b87656005dd789a3282eb7f6a1224eebb6417261d8cf6d47'
    process.env.BCN_AUTH_PROXY_IP_SECRET =
      'd0f9e60506f248f7b87656005dd789a3282eb7f6a1224eebb6417261d8cf6d47'
  })

  it('initializes the real Better Auth and Better Convex plugins', async () => {
    const setup = defineGinkoAuth({
      components: {
        betterAuth: {} as never,
        ginkoCms: {
          mcpOAuthDelegations: { hasOAuthAdminPrivilege: Symbol('query') as never },
        },
      },
    })

    await expect(setup.createAuth({ runQuery: async () => false } as never)).resolves.toMatchObject(
      {
        handler: expect.any(Function),
      },
    )
  })
})
