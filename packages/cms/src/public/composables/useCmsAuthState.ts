import { useConvexAuth } from '@lupinum/trellis/composables'
import type { ComputedRef } from 'vue'

import { computed, useRuntimeConfig } from '#imports'

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
    const { sessionUser, signOut } = useConvexAuth()
    return {
      authEnabled: computed(() => true),
      user: computed(() => {
        const current = sessionUser.value
        if (!current) {
          return null
        }
        return {
          name: current.displayName ?? null,
          email: current.email ?? null,
          image: current.avatarUrl ?? null,
        }
      }),
      signOut,
    }
  }

  return {
    authEnabled: computed(() => false),
    user: computed(() => null),
    signOut: async () => {},
  }
}
