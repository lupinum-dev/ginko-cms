import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth'

declare const process: {
  env: Record<string, string | undefined>
}

type DefineGinkoAuthDeps = {
  components: {
    betterAuth: Parameters<typeof createClient>[0]
  }
  internal?: {
    auth?: AuthFunctions
  }
  authConfig: unknown
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

/**
 * Ginko-owned auth bootstrap for Convex apps.
 *
 * Consumers configure providers in `convex/auth.config.ts`; the CMS owns the
 * direct Better Auth component setup.
 */
export function defineGinkoAuth(deps: DefineGinkoAuthDeps, options: GinkoAuthOptions = {}) {
  const authComponent = createClient(deps.components.betterAuth, {
    ...(deps.internal?.auth ? { authFunctions: deps.internal.auth } : {}),
  } as never)

  const createAuthOptions = (ctx: GenericCtx<any>) =>
    ({
      secret: process.env.BETTER_AUTH_SECRET ?? 'ginko-cms-dev-secret',
      database: authComponent.adapter(ctx),
      emailAndPassword: {
        enabled: options.emailPassword ?? true,
      },
      plugins: [
        convex({
          authConfig: deps.authConfig as never,
        }),
      ],
      ...options,
    }) satisfies BetterAuthOptions

  const createAuth = (ctx: GenericCtx<any>) => betterAuth(createAuthOptions(ctx))

  return {
    authComponent,
    createAuth,
    createUserIfNeeded: async () => null,
  }
}
