import { useConvexQuery } from 'better-convex-vue'
import { computed, type ComputedRef } from 'vue'

import { api } from '../boundary/api'

interface AccessContext {
  role?: string | null
  userId?: string | null
  can?: Record<string, boolean>
}

interface UseAccessReturn {
  ctx: ComputedRef<AccessContext | null>
  role: ComputedRef<string | null>
  userId: ComputedRef<string | null>
  ready: ComputedRef<boolean>
  pending: ComputedRef<boolean>
  can: (permission: string) => ComputedRef<boolean>
}

/** Canonical required-auth access query; the backend remains authoritative. */
export function useAccess(): UseAccessReturn {
  const query = useConvexQuery(api.ginkoCms.members.getAccessContext, {}, { auth: 'required' })
  const ctx = computed<AccessContext | null>(() => query.data.value)

  return {
    ctx,
    role: computed(() => ctx.value?.role ?? null),
    userId: computed(() => ctx.value?.userId ?? null),
    ready: computed(() => query.status.value === 'success'),
    pending: query.pending,
    can: (permission: string) => computed(() => ctx.value?.can?.[permission] === true),
  }
}
