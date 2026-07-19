<script setup lang="ts">
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { api } from './boundary/api'
import { useAppearance } from './composables/useAppearance'
import { useCmsAuthState } from './composables/useCmsAuthState'
import { useCmsConfig } from './composables/useCmsConfig'
import { useCmsI18n } from './composables/useCmsI18n'
import { useCmsStudioAccess } from './composables/useCmsStudioAccess'
import { provideRightSidebar } from './composables/useRightSidebar'
import { useConvexMutation } from './composables/useStudioConvex'

const { t } = useCmsI18n()

// Right-sidebar controller (RFC Phase 4). Provided at the layout root so both
// the SidebarInset subtree (StudioHeader toggle, RightSidebarRail) and the
// RightSidebar panel — which is a LATER flex sibling of SidebarInset, outside
// the page subtree — inject the same instance. Pages register their detail
// panel via useRightSidebarPanel(); availability also honours
// `route.meta.rightSidebar` so the header trigger shows before a page mounts.
provideRightSidebar()
const cmsConfig = useCmsConfig()
const { user, isAuthenticated } = useCmsAuthState()
const route = useRoute()
const isInvitationRoute = computed(() => route.meta.authenticatedPublic === true)

// Appearance (D7): the accent class that themes.css keys off (for example
// `.ginko-cms.color-blue`). It is bound declaratively
// into the `.ginko-cms` root's `:class` below rather than mutated onto the DOM
// imperatively — that keeps them reactive, avoids fighting Vue's class patching,
// and re-applies automatically across the access-state branch swap. The Phase 6
// Settings → Appearance UI drives the same composable.
const { appearanceClasses } = useAppearance()
const studioClass = computed(() => [
  'ginko-cms',
  'ginko-cms--studio',
  cmsConfig.sidebar?.dark && 'ginko-cms--sidebar-dark',
  ...appearanceClasses.value,
])
const { studioRoute, pending, permissions, isMember, canRead, canBootstrap } = useCmsStudioAccess()
const bootstrapCmsOwner = useConvexMutation(api.ginkoCms.members.bootstrapCmsOwner)
const bootstrapPending = ref(false)
const bootstrapError = ref('')
const studioAccess = computed<{ status: string; reason: string | null }>(() => {
  if (bootstrapPending.value) {
    return { status: 'bootstrapping', reason: null }
  }
  if (isInvitationRoute.value && isAuthenticated.value) {
    return { status: 'invitation', reason: null }
  }
  // Must come BEFORE canRead — bootstrap users pass canRead but need to claim ownership first
  if (permissions.ready.value && canBootstrap.value && !isMember.value) {
    return {
      status: 'claimable',
      reason: bootstrapError.value ? 'bootstrap_error' : null,
    }
  }
  if (permissions.ready.value && canRead.value) {
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
    })
  } catch (error) {
    bootstrapError.value = getCmsErrorMessage(error, t('ginkoCms.studio.layout.bootstrapError'))
  } finally {
    bootstrapPending.value = false
  }
}
</script>

<template>
  <div
    v-if="studioAccess.status === 'invitation'"
    data-testid="cms-member-invitation-layout"
    :class="[
      studioClass,
      'ginko:flex ginko:min-h-svh ginko:items-center ginko:justify-center ginko:bg-background ginko:px-6 ginko:py-12 ginko:text-foreground',
    ]"
  >
    <slot />
  </div>
  <SidebarProvider
    v-else-if="studioAccess.status === 'ready'"
    data-testid="cms-studio-ready"
    :class="[studioClass, 'studio-shell ginko:text-foreground']"
  >
    <CmsCommandPalette :studio-route="studioRoute" />
    <StudioSidebar />

    <!--
      Scroll model (RFC Phase 3, step 5). The template lets the whole
      SidebarInset grow and scroll as one document (`@container/main p-4 lg:p-6`
      on the page wrapper). The Studio deliberately keeps its established
      fixed-pane model instead: the inset is `overflow-hidden` at full height and
      each page owns its internal scroll containers (the entry editor, the asset
      browser, and the list frames all rely on this to keep their headers/rails
      pinned while only the body scrolls). So the `@container/main` context and
      the `p-4 lg:p-6` padding rhythm are NOT applied here — they belong INSIDE
      the scrollable region of the document-like pages, applied per page in
      Phase 6. `z-10` lifts the inset above the (future) right-sidebar panel so
      the resize rail paints over the boundary.
    -->
    <!-- Ultra-wide clamp: the card caps at --studio-content-max and the
         leftover canvas splits between margin-left:auto here and
         margin-right:auto on RightSidebar, centering the card/panel pair.
         Inline styles (not classes) because the sidebar primitive's
         peer-data-[variant=inset] rules also set margins and class order
         must not decide; auto resolves to 0 when there is no free space, so
         laptop layouts are unchanged. -->
    <SidebarInset
      class="ginko:relative ginko:z-10 ginko:flex ginko:w-full ginko:min-w-0 ginko:max-w-(--studio-content-max) ginko:flex-1 ginko:flex-col ginko:overflow-hidden"
      style="margin-left: auto"
    >
      <StudioHeader />
      <StudioContractCompatibilityNotice />
      <!-- @container: in-card layouts key off THIS width (which shrinks when
           the right-sidebar panel opens), never off the viewport. Pages use
           @3xl/@5xl/@7xl variants (768/1024/1280px container equivalents). -->
      <div
        class="ginko:@container ginko:min-h-0 ginko:w-full ginko:min-w-0 ginko:max-w-full ginko:flex-1 ginko:overflow-hidden"
      >
        <slot />
      </div>
      <!-- Resize/toggle rail. Inside SidebarInset (RFC Phase 4 step 3) so the
           inset's z-10 lifts the rail's grip above the panel, which is a later
           flex sibling that would otherwise paint over the boundary. -->
      <RightSidebarRail />
    </SidebarInset>
    <!-- The detail panel is the LAST sibling of SidebarInset so it lays out to
         the right of the main area as a flex sibling of the inset. -->
    <RightSidebar />
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
