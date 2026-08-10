import type { ComputedRef } from 'vue'

import { computed, useConvexAuth } from '#imports'

interface CmsAuthUser {
  name?: string | null
  email?: string | null
  image?: string | null
}

interface CmsAuthState {
  user: ComputedRef<CmsAuthUser | null>
  signOut: () => Promise<void>
}

export function useCmsAuthState(): CmsAuthState {
  const auth = useConvexAuth()

  return {
    user: computed(() => {
      const current = auth.user.value
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
      if (!auth.client) throw new TypeError('Ginko CMS authentication client is unavailable.')
      await auth.client.signOut()
    },
  }
}
