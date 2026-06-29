import {
  defineBetterAuth,
  type DefineBetterAuthDeps,
  type DefineBetterAuthOptions,
} from './auth/runtime'

export type {
  DefineBetterAuthDeps as GinkoAuthDeps,
  DefineBetterAuthOptions as GinkoAuthOptions,
} from './auth/runtime'
export { getCmsAuth, requireCmsAuth, deny } from './auth/runtime'

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
