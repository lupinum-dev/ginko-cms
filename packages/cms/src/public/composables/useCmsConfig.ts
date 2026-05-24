import { useRuntimeConfig } from '#imports'

import type { GinkoCmsPublicConfig } from '../types'

/**
 * Return the typed Ginko CMS public runtime config.
 *
 * This is the ONE place where the `as` cast from the untyped Nuxt
 * runtime-config record happens. Every other composable imports from here
 * instead of casting inline.
 */
export function useCmsConfig(): GinkoCmsPublicConfig {
  return useRuntimeConfig().public.ginkoCms as unknown as GinkoCmsPublicConfig
}
