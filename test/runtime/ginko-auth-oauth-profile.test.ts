import { beforeEach, describe, expect, it, vi } from 'vitest'

let capturedAuthOptions: Record<string, unknown> | null = null
let capturedConvexOptions: Record<string, unknown> | null = null
let capturedOAuthOptions: Record<string, unknown> | null = null

vi.mock('better-auth', () => ({
  betterAuth: (options: Record<string, unknown>) => {
    capturedAuthOptions = options
    return {
      $context: Promise.resolve({}),
      handler: async () => new Response(null, { status: 204 }),
    }
  },
}))

vi.mock('better-auth/plugins', () => ({
  jwt: (options: unknown) => ({ id: 'jwt', options }),
}))

vi.mock('@better-auth/oauth-provider', () => ({
  oauthProvider: (options: Record<string, unknown>) => {
    capturedOAuthOptions = options
    return { id: 'oauth-provider', options }
  },
}))

vi.mock('better-convex-nuxt/convex-auth', () => ({
  convexAuth: (options: Record<string, unknown>) => {
    capturedConvexOptions = options
    return { id: 'convex-auth', options }
  },
  createAuthComponent: () => ({
    adapter: () => ({ id: 'adapter' }),
    jwksOperatorFunctions: () => ({}),
  }),
  getConvexAuthProvider: () => ({ applicationID: 'convex' }),
  requireAuthOrigin: (name: string) =>
    name === 'SITE_URL' ? 'https://app.example.test' : 'https://convex.example.test',
}))

const { defineGinkoAuth } = await import('../../packages/convex/src/convex.auth')

describe('Ginko fixed MCP OAuth provider profile', () => {
  beforeEach(() => {
    capturedAuthOptions = null
    capturedConvexOptions = null
    capturedOAuthOptions = null
    process.env.BETTER_AUTH_SECRETS = 'test-only-secret-material'
  })

  it('constructs one fixed authorization-code and PKCE-compatible delegated profile', async () => {
    const privilegedQuery = Symbol('hasOAuthAdminPrivilege')
    const setup = defineGinkoAuth({
      components: {
        betterAuth: {} as never,
        ginkoCms: {
          mcpOAuthDelegations: { hasOAuthAdminPrivilege: privilegedQuery as never },
        },
      },
    })
    const runQuery = vi.fn(async () => true)
    await setup.createAuth({ runQuery } as never)

    expect(capturedOAuthOptions).toMatchObject({
      accessTokenExpiresIn: 600,
      allowDynamicClientRegistration: false,
      allowPublicClientPrelogin: true,
      allowUnauthenticatedClientRegistration: false,
      codeExpiresIn: 120,
      consentPage: '/oauth/consent',
      dpop: { signingAlgorithms: [] },
      enforcePerClientResources: true,
      grantTypes: ['authorization_code'],
      loginPage: '/oauth/login',
      scopes: ['cms.read', 'cms.entries.create', 'cms.entries.edit'],
      storeClientSecret: 'hashed',
      storeTokens: 'hashed',
    })
    expect(capturedConvexOptions?.oauthProvider).toBe(capturedOAuthOptions)
    expect(capturedAuthOptions?.disabledPaths).toEqual(
      expect.arrayContaining(['/oauth2/register', '/oauth2/introspect', '/oauth2/userinfo']),
    )

    const clientPrivileges = capturedOAuthOptions?.clientPrivileges as (
      identity: unknown,
    ) => Promise<boolean>
    const resourcePrivileges = capturedOAuthOptions?.resourcePrivileges as (
      identity: unknown,
    ) => Promise<boolean>
    const identity = { session: { userId: 'owner-1' }, user: { id: 'owner-1' } }
    await expect(clientPrivileges(identity)).resolves.toBe(true)
    await expect(resourcePrivileges(identity)).resolves.toBe(true)
    expect(runQuery).toHaveBeenCalledWith(privilegedQuery, { authUserId: 'owner-1' })
    await expect(
      clientPrivileges({ session: { userId: 'other' }, user: { id: 'owner-1' } }),
    ).resolves.toBe(false)
  })

  it('fails closed when the application-owned OAuth administrator check throws', async () => {
    const setup = defineGinkoAuth({
      components: {
        betterAuth: {} as never,
        ginkoCms: {
          mcpOAuthDelegations: { hasOAuthAdminPrivilege: Symbol('query') as never },
        },
      },
    })
    await setup.createAuth({ runQuery: async () => Promise.reject(new Error('private')) } as never)
    const clientPrivileges = capturedOAuthOptions?.clientPrivileges as (
      identity: unknown,
    ) => Promise<boolean>
    await expect(
      clientPrivileges({ session: { userId: 'owner-1' }, user: { id: 'owner-1' } }),
    ).resolves.toBe(false)
  })
})
