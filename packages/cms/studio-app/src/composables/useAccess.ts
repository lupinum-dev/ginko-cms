import type { ComputedRef } from 'vue'
import { computed, onScopeDispose, ref, watchEffect } from 'vue'

import { api } from '../boundary/api'
import { useStudioHostContext } from '../boundary/studio-host-context'

// Mirrors the host-side CMS permission map,
// but configured inside the
// SPA so studio code calls the real Convex query against the host's
// `ginkoCms/members.getAccessContext`.
//
// Lazy resolution: `api.ginkoCms.members.getAccessContext` is read
// through the boundary/api proxy. The proxy walks
// the typed host API on every property access — so by the time
// useAccess() runs (component setup, after the host page's
// onBeforeMount populated the bridge), the real function reference is
// returned and the factory captures it.
//
interface UseAccessReturn {
  ctx: ComputedRef<{
    role?: string | null
    userId?: string | null
    can?: Record<string, boolean>
  } | null>
  role: ComputedRef<string | null>
  userId: ComputedRef<string | null>
  ready: ComputedRef<boolean>
  pending: ComputedRef<boolean>
  can: (permission: string) => ComputedRef<boolean>
}

export function useAccess(): UseAccessReturn {
  const studioHost = useStudioHostContext()
  const ctx = ref<{
    role?: string | null
    userId?: string | null
    can?: Record<string, boolean>
  } | null>(null)
  const pending = ref(true)
  const error = ref<Error | null>(null)
  let unsubscribe: (() => void) | null = null

  const stop = watchEffect((onCleanup) => {
    unsubscribe?.()
    unsubscribe = null

    const convex = studioHost.getConvexClient()
    if (!convex) {
      pending.value = true
      return
    }

    pending.value = true
    unsubscribe = convex.onUpdate(
      api.ginkoCms.members.getAccessContext,
      {},
      (
        next: {
          role?: string | null
          userId?: string | null
          can?: Record<string, boolean>
        } | null,
      ) => {
        ctx.value = next
        error.value = null
        pending.value = false
      },
      (err: unknown) => {
        error.value = err instanceof Error ? err : new Error(String(err))
        pending.value = false
      },
    )

    onCleanup(() => {
      unsubscribe?.()
      unsubscribe = null
    })
  })

  onScopeDispose(() => {
    stop()
    unsubscribe?.()
    unsubscribe = null
  })

  void error

  return {
    ctx: computed(() => ctx.value),
    role: computed(() => ctx.value?.role ?? null),
    userId: computed(() => ctx.value?.userId ?? null),
    ready: computed(() => ctx.value !== null),
    pending: computed(() => pending.value),
    can: (permission: string) => computed(() => ctx.value?.can?.[permission] === true),
  }
}
