import {
  defineBetterAuth,
  type DefineBetterAuthDeps,
  type DefineBetterAuthOptions,
} from '@lupinum/trellis/auth'

export type {
  DefineBetterAuthDeps as GinkoAuthDeps,
  DefineBetterAuthOptions as GinkoAuthOptions,
} from '@lupinum/trellis/auth'
export { getAuth, requireAuth, deny } from '@lupinum/trellis/auth'

/**
 * Ginko-owned auth bootstrap for Convex apps.
 *
 * Consumers configure providers in `convex/auth.config.ts`; the CMS owns the
 * internal bridge layer that turns that config into Convex auth routes.
 */
export function defineGinkoAuth(
  deps: DefineBetterAuthDeps,
  options: DefineBetterAuthOptions = {},
): ReturnType<typeof defineBetterAuth> {
  return defineBetterAuth(deps, {
    emailPassword: true,
    ...options,
  })
}
