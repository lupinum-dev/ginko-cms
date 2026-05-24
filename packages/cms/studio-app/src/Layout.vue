<script setup lang="ts">
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, ref, watch } from 'vue'

import { api } from './boundary/api'
import { useCmsAuthState } from './composables/useCmsAuthState'
import { useCmsConfig } from './composables/useCmsConfig'
import { useCmsI18n } from './composables/useCmsI18n'
import { useCmsStudioAccess } from './composables/useCmsStudioAccess'
import { useConvexMutation } from './composables/useStudioConvex'

const { t } = useCmsI18n()
const cmsConfig = useCmsConfig()
const { user } = useCmsAuthState()
const studioClass = computed(() => [
  'ginko-cms',
  'ginko-cms--studio',
  cmsConfig.sidebar?.dark && 'ginko-cms--sidebar-dark',
])
const { studioRoute, pending, permissions, isMember, canRead, canBootstrap } = useCmsStudioAccess()
const bootstrapCmsOwner = useConvexMutation(api.ginkoCms.members.bootstrapCmsOwner)
const bootstrapPending = ref(false)
const bootstrapError = ref('')
const hadReadyStudioAccess = ref(false)
const studioAccess = computed<{ status: string; reason: string | null }>(() => {
  if (bootstrapPending.value) {
    return { status: 'bootstrapping', reason: null }
  }
  // Must come BEFORE canRead — bootstrap users pass canRead but need to claim ownership first
  if (permissions.ready.value && canBootstrap.value && !isMember.value) {
    return {
      status: 'claimable',
      reason: bootstrapError.value ? 'bootstrap_error' : null,
    }
  }
  if ((permissions.ready.value || hadReadyStudioAccess.value) && canRead.value) {
    return { status: 'ready', reason: null }
  }
  if (pending.value) {
    return { status: 'loading', reason: null }
  }
  if (permissions.ready.value) {
    return { status: 'forbidden', reason: 'membership' }
  }
  if (!pending.value) {
    return { status: 'forbidden', reason: 'auth' }
  }
  return { status: 'loading', reason: null }
})

watch(
  () => studioAccess.value.status,
  (status) => {
    if (status === 'ready') {
      hadReadyStudioAccess.value = true
    } else if (status === 'forbidden' && studioAccess.value.reason === 'auth') {
      hadReadyStudioAccess.value = false
    }
    // Debug hook: set window.__ginkoLayoutDebug = [] before navigating to
    // capture studioAccess transitions.
    if (
      typeof window !== 'undefined' &&
      (window as unknown as { __ginkoLayoutDebug?: unknown[] }).__ginkoLayoutDebug
    ) {
      ;(window as unknown as { __ginkoLayoutDebug: unknown[] }).__ginkoLayoutDebug.push({
        ts: Date.now(),
        status,
        reason: studioAccess.value.reason,
        ready: permissions.ready.value,
        pending: pending.value,
        canRead: canRead.value,
        canBootstrap: canBootstrap.value,
        isMember: isMember.value,
        role: permissions.role?.value,
      })
    }
  },
  { immediate: true },
)

async function claimCmsOwnership() {
  if (bootstrapPending.value) {
    return
  }
  bootstrapPending.value = true
  bootstrapError.value = ''
  try {
    await bootstrapCmsOwner({
      displayName: user.value?.name ?? undefined,
      email: user.value?.email ?? undefined,
    })
  } catch (error) {
    bootstrapError.value = getCmsErrorMessage(error, t('ginkoCms.studio.layout.bootstrapError'))
  } finally {
    bootstrapPending.value = false
  }
}
</script>

<template>
  <SidebarProvider
    v-if="studioAccess.status === 'ready'"
    data-testid="cms-studio-ready"
    :style="{
      '--sidebar-width': '13.75rem',
      '--sidebar-width-icon': '3.5rem',
    }"
    :class="[studioClass, 'studio-shell ginko:text-foreground']"
  >
    <CmsCommandPalette :studio-route="studioRoute" />
    <StudioSidebar />

    <div
      class="ginko:relative ginko:flex ginko:min-h-svh ginko:w-full ginko:min-w-0 ginko:max-w-full ginko:flex-1 ginko:flex-col ginko:overflow-hidden ginko:bg-transparent"
    >
      <StudioHeader />
      <div
        class="ginko:min-h-0 ginko:w-full ginko:min-w-0 ginko:max-w-full ginko:flex-1 ginko:overflow-hidden"
      >
        <slot />
      </div>
    </div>
  </SidebarProvider>
  <div
    v-else
    :class="[
      studioClass,
      'ginko:flex ginko:min-h-svh ginko:items-center ginko:justify-center ginko:bg-background ginko:px-6 ginko:py-12 ginko:text-foreground',
    ]"
  >
    <Card class="ginko:w-full ginko:max-w-lg">
      <CardHeader v-if="studioAccess.status === 'bootstrapping'">
        <CardTitle>
          {{ t('ginkoCms.studio.layout.bootstrappingTitle') }}
        </CardTitle>
        <CardDescription>
          {{ t('ginkoCms.studio.layout.bootstrappingDescription') }}
        </CardDescription>
      </CardHeader>
      <CardHeader v-else-if="studioAccess.status === 'claimable'">
        <CardTitle>{{ t('ginkoCms.studio.layout.claimOwnerTitle') }}</CardTitle>
        <CardDescription>
          {{ t('ginkoCms.studio.layout.claimOwnerDescription') }}
        </CardDescription>
      </CardHeader>
      <CardHeader v-else-if="studioAccess.status === 'forbidden'">
        <CardTitle>{{ t('ginkoCms.studio.layout.forbiddenTitle') }}</CardTitle>
        <CardDescription>
          {{
            studioAccess.reason === 'auth'
              ? t('ginkoCms.studio.layout.forbiddenAuthDescription')
              : t('ginkoCms.studio.layout.forbiddenDescription')
          }}
        </CardDescription>
      </CardHeader>
      <CardHeader v-else>
        <CardTitle>{{ t('ginkoCms.studio.layout.loadingTitle') }}</CardTitle>
        <CardDescription>
          {{ t('ginkoCms.studio.layout.loadingDescription') }}
        </CardDescription>
      </CardHeader>
      <CardContent v-if="studioAccess.status === 'claimable'" class="ginko:pt-0">
        <Button
          class="ginko:w-full"
          data-testid="cms-claim-owner"
          :disabled="bootstrapPending"
          @click="claimCmsOwnership"
        >
          {{ t('ginkoCms.studio.layout.claimOwnerAction') }}
        </Button>
      </CardContent>
      <CardContent v-if="bootstrapError" class="ginko:text-sm ginko:text-destructive">
        {{ bootstrapError }}
      </CardContent>
    </Card>
  </div>
</template>
