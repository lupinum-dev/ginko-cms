import type { ComputedRef } from 'vue'

import { computed, useConvexAuth, useConvexConfig } from '#imports'

interface CmsAuthUser {
  name?: string | null
  email?: string | null
  image?: string | null
}

interface CmsAuthState {
  authEnabled: ComputedRef<boolean>
  user: ComputedRef<CmsAuthUser | null>
  signOut: () => Promise<void>
}

export function useCmsAuthState(): CmsAuthState {
  // `useConvexAuth()` is called unconditionally (vNext §5.3/§10.3); disabled
  // auth is read from the normalized config (`auth === false`, vNext §5.7/§10.4)
  // rather than a raw `runtimeConfig.public.convex` cast.
  const convexConfig = useConvexConfig()
  const authEnabled = convexConfig.auth !== false
  const { user: convexUser, signOut } = useConvexAuth()

  return {
    authEnabled: computed(() => authEnabled),
    user: computed(() => {
      const current = convexUser.value
      if (!current) {
        return null
      }
      return {
        name: current.name ?? null,
        email: current.email ?? null,
        image: current.image ?? null,
      }
    }),
    signOut: async () => {
      await signOut()
    },
  }
}
