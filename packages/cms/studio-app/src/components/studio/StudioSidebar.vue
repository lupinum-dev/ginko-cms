<script setup lang="ts">
import { ChevronsLeft, Search } from 'lucide-vue-next'
import { computed } from 'vue'

import { useCmsConfig } from '../../composables/useCmsConfig'
import { useCmsI18n } from '../../composables/useCmsI18n'

const cmsConfig = useCmsConfig()
const { t } = useCmsI18n()
const studioRoute = cmsConfig.route.replace(/\/$/, '')

const studioVersion = computed(() => (cmsConfig as { version?: string }).version || 'v2.0.0')

function openCommandPalette() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}
</script>

<template>
  <Sidebar
    role="navigation"
    aria-label="Studio navigation"
    variant="sidebar"
    collapsible="icon"
    class="studio-sidebar ginko:border-r ginko:border-border/40 ginko:bg-sidebar"
  >
    <SidebarHeader class="ginko:px-3 ginko:py-3">
      <div class="ginko:flex ginko:items-center ginko:gap-2">
        <RouterLink
          :to="studioRoute"
          aria-label="Ginko CMS Studio home"
          class="ginko:flex ginko:min-w-0 ginko:flex-1 ginko:items-center ginko:gap-2 ginko:rounded-md ginko:outline-none ginko:transition-colors ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring/50"
        >
          <div
            class="ginko:flex ginko:aspect-square ginko:h-6 ginko:w-6 ginko:shrink-0 ginko:items-center ginko:justify-center ginko:rounded-md ginko:border ginko:border-sidebar-border/50 ginko:bg-sidebar-accent/70 ginko:text-sidebar-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              class="ginko:h-3.5 ginko:w-3.5"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span
            class="ginko:min-w-0 ginko:flex-1 ginko:truncate ginko:text-[13px] ginko:font-semibold ginko:tracking-tight ginko:text-foreground ginko:group-data-[collapsible=icon]:hidden"
          >
            Ginko Studio
            <span
              class="ginko:ml-1 ginko:align-baseline ginko:text-[10px] ginko:font-normal ginko:tabular-nums ginko:text-muted-foreground/60"
              >{{ studioVersion }}</span
            >
          </span>
        </RouterLink>
        <SidebarTrigger
          class="ginko:shrink-0 ginko:rounded-md ginko:text-muted-foreground ginko:hover:text-foreground ginko:group-data-[collapsible=icon]:hidden"
          aria-label="Collapse sidebar"
        >
          <ChevronsLeft class="ginko:size-3.5" />
        </SidebarTrigger>
      </div>
    </SidebarHeader>

    <div class="ginko:px-3 ginko:pb-2 ginko:group-data-[collapsible=icon]:hidden">
      <button
        type="button"
        class="studio-motion-fast ginko:relative ginko:flex ginko:h-8 ginko:w-full ginko:items-center ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-background/50 ginko:pl-8 ginko:pr-14 ginko:text-left ginko:text-[13px] ginko:text-sidebar-foreground/70 ginko:hover:border-border ginko:hover:bg-muted/40 ginko:hover:text-sidebar-foreground ginko:focus-visible:border-ring ginko:focus-visible:outline-none ginko:focus-visible:ring-2 ginko:focus-visible:ring-ring/40"
        @click="openCommandPalette"
      >
        <Search
          class="ginko:absolute ginko:left-2.5 ginko:top-1/2 ginko:h-3.5 ginko:w-3.5 ginko:-translate-y-1/2 ginko:text-muted-foreground/60"
        />
        <span class="ginko:truncate">{{ t('ginkoCms.studio.layout.searchPlaceholder') }}</span>
        <span
          class="ginko:absolute ginko:right-2 ginko:top-1/2 ginko:flex ginko:-translate-y-1/2 ginko:items-center ginko:gap-0.5"
        >
          <kbd
            class="ginko:pointer-events-none ginko:inline-flex ginko:h-5 ginko:min-w-[20px] ginko:select-none ginko:items-center ginko:justify-center ginko:rounded-sm ginko:border ginko:border-border/60 ginko:bg-muted/40 ginko:px-1 ginko:font-mono ginko:text-[10px] ginko:font-medium ginko:text-muted-foreground"
            >⌘</kbd
          >
          <kbd
            class="ginko:pointer-events-none ginko:inline-flex ginko:h-5 ginko:min-w-[20px] ginko:select-none ginko:items-center ginko:justify-center ginko:rounded-sm ginko:border ginko:border-border/60 ginko:bg-muted/40 ginko:px-1 ginko:font-mono ginko:text-[10px] ginko:font-medium ginko:text-muted-foreground"
            >K</kbd
          >
        </span>
      </button>
    </div>

    <SidebarContent class="ginko:px-3 ginko:pb-3">
      <StudioSidebarNav />
    </SidebarContent>

    <SidebarFooter class="ginko:border-t ginko:border-border/50 ginko:p-3">
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
