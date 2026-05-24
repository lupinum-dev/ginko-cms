import { computed, type ComputedRef } from 'vue'

import { useStudioHostContext } from '../boundary/studio-host-context'

// SPA-side auth state. Mirrors the public composable's shape so studio code
// (StudioSidebarUser, Layout's bootstrap branch, etc.) destructures `user`,
// `signOut`, etc. without touching the call sites.
//
// Reads the Trellis auth engine refs that the host page puts on the typed
// host bridge. Refs are shared
// across the host/SPA boundary because both run in the same JS context;
// `auth.user.value`, `auth.token.value`, etc. update reactively as
// better-auth signs the user in or out.
//
// Falls back to "no user, auth disabled" when the bridge isn't populated
// (studio:dev standalone with no host attached) so Layout still renders
// without throwing.

export interface CmsAuthUser {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
}

interface BridgeAuth {
  token: { value: string | null | undefined }
  user: { value: unknown }
  pending: { value: boolean }
  isAuthenticated: { value: boolean }
  isAnonymous: { value: boolean }
}

function normalizeUser(raw: unknown): CmsAuthUser | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id =
    (typeof obj.id === 'string' ? obj.id : null) ??
    (typeof obj._id === 'string' ? obj._id : null) ??
    (typeof obj.userId === 'string' ? obj.userId : null)
  if (!id) return null
  return {
    id,
    name: typeof obj.name === 'string' ? obj.name : null,
    email: typeof obj.email === 'string' ? obj.email : null,
    image:
      typeof obj.image === 'string'
        ? obj.image
        : typeof obj.avatarUrl === 'string'
          ? obj.avatarUrl
          : null,
  }
}

interface UseCmsAuthStateReturn {
  authEnabled: ComputedRef<boolean>
  user: ComputedRef<CmsAuthUser | null>
  isAuthenticated: ComputedRef<boolean>
  signOut: () => Promise<void>
  getJwt: () => string | null
}

export function useCmsAuthState(): UseCmsAuthStateReturn {
  const studioHost = useStudioHostContext()
  const readBridgeAuth = () =>
    (studioHost.getBridge().auth as BridgeAuth | null | undefined) ?? null

  // Read on every getter call — refs from the consumer-side trellis auth
  // engine survive across the boundary, but `bridge.auth` itself can be
  // null until the host page's onBeforeMount hook runs. Lazy access keeps
  // the SPA tolerant of host-bridge timing variations.
  const auth = computed<BridgeAuth | null>(() => readBridgeAuth())

  const isAuthenticated = computed(() => auth.value?.isAuthenticated.value === true)
  const user = computed(() => normalizeUser(auth.value?.user.value))

  return {
    authEnabled: computed(() => auth.value !== null),
    user,
    isAuthenticated,
    async signOut(): Promise<void> {
      const onSignOut = studioHost.getBridge().onSignOut
      if (typeof onSignOut === 'function') await onSignOut()
    },
    getJwt(): string | null {
      return readBridgeAuth()?.token.value ?? null
    },
  }
}
