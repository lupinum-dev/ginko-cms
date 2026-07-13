import { apiKey } from '@better-auth/api-key'
import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth'

import {
  ginkoConvexJwtPayload,
  ginkoCredentialKindPlugin,
  parseBearerApiKey,
  requireBetterAuthSecret,
} from './auth/credentialKind.js'

declare const process: {
  env: Record<string, string | undefined>
}

type DefineGinkoAuthDeps = {
  components: Record<string, unknown> & {
    betterAuth: Parameters<typeof createClient>[0]
  }
  internal?: Record<string, unknown> & {
    auth?: AuthFunctions
  }
  authConfig: unknown
  authSchema?: unknown
}

export type GinkoAuthDeps = DefineGinkoAuthDeps
export type GinkoAuthOptions = Partial<BetterAuthOptions> & {
  emailPassword?: boolean
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

function resolveTrustedOrigins(configured: BetterAuthOptions['trustedOrigins'] = []) {
  const origins = [
    process.env.SITE_URL,
    process.env.NUXT_PUBLIC_SITE_URL,
    process.env.BETTER_AUTH_URL,
    ...(Array.isArray(configured) ? configured : []),
  ].filter((origin): origin is string => typeof origin === 'string' && origin.length > 0)

  return Array.from(new Set(origins.map((origin) => origin.replace(/\/+$/, ''))))
}

/**
 * Ginko-owned auth bootstrap for Convex apps.
 *
 * Consumers configure providers in `convex/auth.config.ts`; the CMS owns the
 * direct Better Auth component setup.
 */
export function defineGinkoAuth(deps: DefineGinkoAuthDeps, options: GinkoAuthOptions = {}) {
  const authComponent = createClient(deps.components.betterAuth, {
    ...(deps.authSchema ? { local: { schema: deps.authSchema } } : {}),
    ...(deps.internal?.auth ? { authFunctions: deps.internal.auth } : {}),
  } as never)

  const createAuthOptions = (ctx: GenericCtx) =>
    ({
      ...options,
      secret: requireBetterAuthSecret(),
      trustedOrigins: resolveTrustedOrigins(options.trustedOrigins),
      database: authComponent.adapter(ctx),
      emailAndPassword: {
        enabled: options.emailPassword ?? true,
      },
      plugins: [
        apiKey({
          customAPIKeyGetter: (ctx) => parseBearerApiKey(ctx.headers?.get('authorization')),
          enableMetadata: true,
          enableSessionForAPIKeys: true,
          rateLimit: {
            enabled: false,
          },
        }),
        ginkoCredentialKindPlugin(),
        convex({
          authConfig: deps.authConfig as never,
          jwt: {
            definePayload: ginkoConvexJwtPayload,
          },
        }),
        ...(options.plugins ?? []),
      ],
    }) satisfies BetterAuthOptions

  const createAuth = (ctx: GenericCtx) => betterAuth(createAuthOptions(ctx))

  return {
    authComponent,
    createAuth,
    createAuthOptions,
    createUserIfNeeded: async () => null,
  }
}
