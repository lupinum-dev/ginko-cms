import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { jwt } from 'better-auth/plugins'
import {
  convexAuth,
  createAuthComponent,
  getConvexAuthProvider,
  requireAuthOrigin,
  type AuthCtx,
} from 'better-convex-nuxt/convex-auth'
import type { GenericDataModel } from 'convex/server'

declare const process: {
  env: Record<string, string | undefined>
}

type DefineGinkoAuthDeps = {
  components: Record<string, unknown> & {
    betterAuth: Parameters<typeof createAuthComponent>[0]
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
        convexAuth({
          authConfig: { providers: [getConvexAuthProvider()] },
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
        }),
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
