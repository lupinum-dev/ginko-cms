import { oauthProvider, type OAuthOptions, type Scope } from '@better-auth/oauth-provider'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { jwt } from 'better-auth/plugins'
import {
  convexAuth,
  createAuthComponent,
  getConvexAuthProvider,
  requireAuthOrigin,
  type AuthCtx,
} from 'better-convex-nuxt/convex-auth'
import type { FunctionReference, GenericDataModel } from 'convex/server'

declare const process: {
  env: Record<string, string | undefined>
}

type DefineGinkoAuthDeps = {
  components: Record<string, unknown> & {
    betterAuth: Parameters<typeof createAuthComponent>[0]
    ginkoCms: {
      mcpOAuthDelegations: {
        hasOAuthAdminPrivilege: FunctionReference<
          'query',
          'public',
          { authUserId: string },
          boolean
        >
      }
    }
  }
}

export type GinkoAuthDeps = DefineGinkoAuthDeps
export type GinkoAuthOptions = {
  emailPassword?: boolean
  passwordRecovery?: {
    sendResetPassword: NonNullable<
      NonNullable<BetterAuthOptions['emailAndPassword']>['sendResetPassword']
    >
    tokenExpiresInSeconds?: number
  }
}

export type GinkoAuthSetup<DataModel extends GenericDataModel> = {
  authComponent: ReturnType<typeof createAuthComponent<DataModel>>
  createAuth: (ctx: AuthCtx<DataModel>) => Promise<{
    $context: Promise<unknown>
    handler: (request: Request) => Promise<Response>
  }>
}

export function deny(message = 'Forbidden'): never {
  throw new Error(message)
}

export async function getAuth(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  return await ctx.auth.getUserIdentity()
}

export async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  const identity = await getAuth(ctx)
  if (!identity) deny('Authentication required.')
  return identity
}

function assertAuthSecretsConfigured(): void {
  if (!process.env.BETTER_AUTH_SECRETS) {
    throw new Error('BETTER_AUTH_SECRETS is required.')
  }
}

const MCP_OAUTH_SCOPES = ['cms.read', 'cms.entries.create', 'cms.entries.edit'] as const

async function hasOAuthAdminPrivilege<DataModel extends GenericDataModel>(
  ctx: AuthCtx<DataModel>,
  deps: DefineGinkoAuthDeps,
  identity: {
    session?: { userId?: string }
    user?: { id?: string }
  },
): Promise<boolean> {
  if (!identity.user?.id || identity.session?.userId !== identity.user.id) return false
  if (!('runQuery' in ctx) || typeof ctx.runQuery !== 'function') return false
  try {
    return await ctx.runQuery(deps.components.ginkoCms.mcpOAuthDelegations.hasOAuthAdminPrivilege, {
      authUserId: identity.user.id,
    })
  } catch {
    return false
  }
}

function createOAuthOptions<DataModel extends GenericDataModel>(
  ctx: AuthCtx<DataModel>,
  deps: DefineGinkoAuthDeps,
): OAuthOptions<Scope[]> {
  return {
    accessTokenExpiresIn: 600,
    allowDynamicClientRegistration: false,
    allowPublicClientPrelogin: true,
    allowUnauthenticatedClientRegistration: false,
    clientPrivileges: (identity) => hasOAuthAdminPrivilege(ctx, deps, identity),
    codeExpiresIn: 120,
    consentPage: '/oauth/consent',
    customAccessTokenClaims: () => ({ token_use: 'oauth-access' }),
    dpop: { signingAlgorithms: [] },
    enforcePerClientResources: true,
    grantTypes: ['authorization_code'],
    loginPage: '/oauth/login',
    rateLimit: {
      authorize: { max: 30, window: 60 },
      revoke: { max: 30, window: 60 },
      token: { max: 20, window: 60 },
    },
    resourcePrivileges: (identity) => hasOAuthAdminPrivilege(ctx, deps, identity),
    scopes: [...MCP_OAUTH_SCOPES],
    silenceWarnings: { oauthAuthServerConfig: true },
    storeClientSecret: 'hashed',
    storeTokens: 'hashed',
  }
}

/**
 * Ginko's single Better Convex Nuxt auth composition.
 *
 * Better Convex Nuxt owns the component schema, adapter, session JWT, proxy
 * trust boundary, and JWKS lifecycle. Ginko supplies only the product's
 * email/password and recovery policy.
 */
export function defineGinkoAuth<DataModel extends GenericDataModel = GenericDataModel>(
  deps: DefineGinkoAuthDeps,
  options: GinkoAuthOptions = {},
): GinkoAuthSetup<DataModel> {
  const authComponent = createAuthComponent<DataModel>(deps.components.betterAuth)

  const createAuth: GinkoAuthSetup<DataModel>['createAuth'] = async (ctx) => {
    const siteUrl = requireAuthOrigin('SITE_URL')
    const convexSiteUrl = requireAuthOrigin('CONVEX_SITE_URL')
    const authIssuer = `${siteUrl}/api/auth`
    assertAuthSecretsConfigured()
    const oauth = createOAuthOptions(ctx, deps)
    const convexPlugin = convexAuth({
      authConfig: { providers: [getConvexAuthProvider()] },
      oauthProvider: oauth,
      sessionJwt: {
        audience: 'convex',
        definePayload: ({ user }) => ({
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
        }),
        expirationTime: '15m',
        issuer: convexSiteUrl,
      },
    })
    const provider = oauthProvider(oauth)

    const auth = betterAuth({
      account: { encryptOAuthTokens: true, storeAccountCookie: false },
      advanced: { ipAddress: { ipAddressHeaders: ['x-bcn-verified-client-ip'] } },
      basePath: '/api/auth',
      baseURL: siteUrl,
      database: authComponent.adapter(ctx),
      disabledPaths: [
        '/token',
        '/get-access-token',
        '/refresh-token',
        '/.well-known/openid-configuration',
        '/oauth2/register',
        '/oauth2/introspect',
        '/oauth2/userinfo',
        '/oauth2/end-session',
      ],
      emailAndPassword: {
        enabled: options.emailPassword ?? true,
        ...(options.passwordRecovery
          ? {
              sendResetPassword: options.passwordRecovery.sendResetPassword,
              resetPasswordTokenExpiresIn:
                options.passwordRecovery.tokenExpiresInSeconds ?? 60 * 60,
              revokeSessionsOnPasswordReset: true,
            }
          : {}),
      },
      plugins: [
        jwt({
          disableSettingJwtHeader: true,
          jwks: {
            disablePrivateKeyEncryption: false,
            gracePeriod: 21 * 60,
            keyPairConfig: { alg: 'RS256' },
          },
          jwt: { audience: authIssuer, expirationTime: '10m', issuer: authIssuer },
        }),
        convexPlugin,
        provider,
      ],
      rateLimit: { enabled: true, modelName: 'rateLimit', storage: 'database' },
      trustedOrigins: [siteUrl],
      verification: { storeIdentifier: 'hashed' },
    })
    await auth.$context
    return auth
  }

  return { authComponent, createAuth }
}
