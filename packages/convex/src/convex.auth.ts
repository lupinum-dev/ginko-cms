import type { OAuthOptions, Scope } from '@better-auth/oauth-provider'
import {
  createBetterConvexAuth,
  type AuthCtx,
  type BetterConvexAuth,
} from '@lupinum/better-convex-nuxt/better-auth/server'
import { mcpDelegatedScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import type { BetterAuthOptions } from 'better-auth'
import type { FunctionReference, GenericDataModel } from 'convex/server'

type DefineGinkoAuthDeps = {
  components: Record<string, unknown> & {
    betterAuth: Parameters<typeof createBetterConvexAuth>[0]
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

export type GinkoAuthSetup<DataModel extends GenericDataModel> = BetterConvexAuth<DataModel>

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
    scopes: [...mcpDelegatedScopeKeys],
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
  return createBetterConvexAuth<DataModel>(deps.components.betterAuth, {
    defineSessionClaims: ({ user }) => ({
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
    }),
    emailAndPassword:
      options.emailPassword === false
        ? false
        : {
            ...(options.passwordRecovery
              ? {
                  sendResetPassword: options.passwordRecovery.sendResetPassword,
                  resetPasswordTokenExpiresIn:
                    options.passwordRecovery.tokenExpiresInSeconds ?? 60 * 60,
                  revokeSessionsOnPasswordReset: true,
                }
              : {}),
          },
    oauthProvider: (ctx) => createOAuthOptions(ctx, deps),
  })
}
