import { beforeEach, describe, expect, it, vi } from 'vitest'

let capturedFactoryOptions: Record<string, unknown> | null = null
let capturedOAuthOptions: Record<string, unknown> | null = null

vi.mock('@lupinum/better-convex-nuxt/better-auth/server', () => ({
  createBetterConvexAuth: (_component: unknown, options: Record<string, unknown>) => {
    capturedFactoryOptions = options
    return {
      authComponent: {},
      createAuth: async (ctx: unknown) => {
        const profile = options.oauthProvider as (ctx: unknown) => Record<string, unknown>
        capturedOAuthOptions = profile(ctx)
        return { $context: Promise.resolve({}), handler: async () => new Response(null) }
      },
      jwksOperatorFunctions: () => ({}),
      registerRoutes: () => undefined,
      triggerFunctions: {},
    }
  },
}))

const { defineGinkoAuth } = await import('../../packages/convex/src/convex.auth')

describe('Ginko fixed MCP OAuth provider profile', () => {
  beforeEach(() => {
    capturedFactoryOptions = null
    capturedOAuthOptions = null
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
      scopes: ['cms.read', 'cms.entries.edit'],
      storeClientSecret: 'hashed',
      storeTokens: 'hashed',
    })
    expect(capturedFactoryOptions).toMatchObject({
      emailAndPassword: {},
      oauthProvider: expect.any(Function),
    })
    expect(capturedOAuthOptions).not.toHaveProperty('silenceWarnings')

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
