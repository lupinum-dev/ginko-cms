import type { ComputedRef } from 'vue'

import { computed, useConvexAuth, useRuntimeConfig } from '#imports'

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
  const runtimeConfig = useRuntimeConfig()
  const publicConfig = runtimeConfig.public as {
    convex?: {
      auth?: {
        enabled?: boolean
      }
    }
  }
  const authEnabled = publicConfig.convex?.auth?.enabled !== false

  if (authEnabled) {
    const { user: convexUser, signOut } = useConvexAuth()
    return {
      authEnabled: computed(() => true),
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

  return {
    authEnabled: computed(() => false),
    user: computed(() => null),
    signOut: async () => {},
  }
}
