import { useConvexQuery } from '@lupinum/better-convex-vue'
import { computed } from 'vue'

import { api } from '../boundary/api'
import { useCmsConfig } from '../boundary/host-bridge'
import { cmsPermissionKeys, type CmsPermissionKey } from './permissions'

interface AccessContext {
  role?: string | null
  userId?: string | null
  can?: Record<string, boolean>
}

// Studio-side access helper. It intentionally reads the explicit host bridge
// and SPA permissions state instead of Nuxt runtime auto-imports.
export function useCmsStudioAccess() {
  const cmsConfig = useCmsConfig()
  const studioRoute = (cmsConfig.route ?? '/studio').replace(/\/$/, '')
  const loginPath = `${studioRoute}/auth/signin`

  const query = useConvexQuery(api.ginkoCms.members.getAccessContext, {}, { auth: 'required' })
  const ctx = computed<AccessContext | null>(() => query.data.value ?? null)
  const role = computed(() => ctx.value?.role ?? null)
  const ready = computed(() => query.status.value === 'success')

  const canRead = computed(() => ctx.value?.can?.[cmsPermissionKeys.read] === true)
  const canBootstrap = computed(() => ctx.value?.can?.[cmsPermissionKeys.bootstrap] === true)
  const isMember = computed(() => role.value !== null)

  return {
    ctx,
    role,
    userId: computed(() => ctx.value?.userId ?? null),
    studioRoute,
    loginPath,
    canRead,
    canBootstrap,
    isMember,
    ready,
    pending: query.pending,
    can: (key: CmsPermissionKey) => computed(() => ctx.value?.can?.[key] === true),
  }
}
