import { useConvexQuery } from '@lupinum/better-convex-vue'
import { computed, inject, provide, type InjectionKey } from 'vue'

import { api } from '../boundary/api'
import { useCmsConfig } from '../boundary/host-bridge'
import { cmsPermissionKeys, type CmsPermissionKey } from './permissions'

interface AccessContext {
  role?: string | null
  userId?: string | null
  can?: Record<string, boolean>
}

function createCmsStudioAccess() {
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

type CmsStudioAccess = ReturnType<typeof createCmsStudioAccess>
const cmsStudioAccessKey: InjectionKey<CmsStudioAccess> = Symbol('ginko-cms-studio-access')

/** Own the Studio access subscription once at the layout boundary. */
export function provideCmsStudioAccess(): CmsStudioAccess {
  const access = createCmsStudioAccess()
  provide(cmsStudioAccessKey, access)
  return access
}

/** Read the layout-owned Studio access state without starting another query. */
export function useCmsStudioAccess(): CmsStudioAccess {
  const access = inject(cmsStudioAccessKey)
  if (!access) {
    throw new Error('[ginko-cms] Studio access must be provided by the Studio layout.')
  }
  return access
}
