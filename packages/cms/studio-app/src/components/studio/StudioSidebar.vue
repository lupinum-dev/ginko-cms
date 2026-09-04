<script setup lang="ts">
import { Search } from '@lucide/vue'
import { computed } from 'vue'

import { useCmsConfig } from '../../composables/useCmsConfig'
import { useCmsI18n } from '../../composables/useCmsI18n'

const cmsConfig = useCmsConfig()
const { t } = useCmsI18n()

const studioVersion = computed(() => (cmsConfig as { version?: string }).version || 'v2.0.0')

// The template's AppSidebar drives `variant`/`collapsible`/`side` from
// useAppSettings. The Studio has no such setting surface (its only sidebar
// config is `cmsConfig.sidebar.dark`, applied as a root class in Layout), so
// these stay fixed to the Studio's established icon-collapsible left rail — now
// on the template's `inset` variant so the main area floats as a rounded card.
function openCommandPalette() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}
</script>

<template>
  <Sidebar
    role="navigation"
    aria-label="Studio navigation"
    variant="inset"
    collapsible="icon"
    class="studio-sidebar"
  >
    <SidebarHeader>
      <!-- Brand row: matches the template team-switcher item (icon tile +
           two-line label). No dropdown — it links straight to the Studio home. -->
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <RouterLink :to="{ name: 'studio-home' }" aria-label="Ginko CMS Studio home">
              <div
                class="ginko:flex ginko:aspect-square ginko:size-8 ginko:items-center ginko:justify-center ginko:rounded-lg ginko:bg-sidebar-primary ginko:text-sidebar-primary-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="ginko:size-4"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div
                class="ginko:grid ginko:flex-1 ginko:text-left ginko:text-sm ginko:leading-tight"
              >
                <span class="ginko:truncate ginko:font-semibold">Ginko Studio</span>
                <span
                  class="ginko:truncate ginko:text-xs ginko:tabular-nums ginko:text-muted-foreground"
                  >{{ studioVersion }}</span
                >
              </div>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <!-- Search: template Search component look — an input-shaped outline
           button with a ⌘K Kbd suffix — that opens CmsCommandPalette. -->
      <SidebarMenuButton as-child :tooltip="t('ginkoCms.studio.layout.searchPlaceholder')">
        <Button
          variant="outline"
          size="sm"
          class="ginko:text-xs"
          data-testid="cms-sidebar-search"
          @click="openCommandPalette"
        >
          <Search />
          <span class="ginko:font-normal ginko:group-data-[collapsible=icon]:hidden">{{
            t('ginkoCms.studio.layout.searchPlaceholder')
          }}</span>
          <div
            class="ginko:ml-auto ginko:flex ginko:items-center ginko:space-x-0.5 ginko:group-data-[collapsible=icon]:hidden"
          >
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </div>
        </Button>
      </SidebarMenuButton>
    </SidebarHeader>

    <SidebarContent>
      <StudioSidebarNav />
    </SidebarContent>

    <SidebarFooter>
      <StudioSidebarUser />
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>

<style scoped>
.studio-sidebar {
  box-shadow: none;
}
</style>
