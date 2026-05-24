import { computed } from 'vue'

import { useCmsConfig } from '../boundary/host-bridge'
import { cmsPermissionKeys, type CmsPermissionKey } from './permissions'
import { useAccess } from './useAccess'

// Studio-side access helper. It intentionally reads the explicit host bridge
// and SPA permissions state instead of Nuxt runtime auto-imports.
export function useCmsStudioAccess() {
  const cmsConfig = useCmsConfig()
  const studioRoute = (cmsConfig.route ?? '/studio').replace(/\/$/, '')
  const loginPath = `${studioRoute}/auth/signin`

  const permissions = useAccess()

  const canRead = computed(() => permissions.ctx.value?.can?.[cmsPermissionKeys.read] === true)
  const canBootstrap = computed(
    () => permissions.ctx.value?.can?.[cmsPermissionKeys.bootstrap] === true,
  )
  const isMember = computed(() => permissions.role.value !== null)

  return {
    permissions,
    studioRoute,
    loginPath,
    canRead,
    canBootstrap,
    isMember,
    ready: permissions.ready,
    pending: permissions.pending,
    can: (key: CmsPermissionKey) => computed(() => permissions.ctx.value?.can?.[key] === true),
  }
}
