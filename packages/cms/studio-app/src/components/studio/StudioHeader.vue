<script setup lang="ts">
import { ChevronRight, FileText, Folder, LayoutDashboard, Search, Settings } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { useCmsConfig } from '../../composables/useCmsConfig'
import { useCmsI18n } from '../../composables/useCmsI18n'

const { t } = useCmsI18n()
const route = useRoute()
const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')

function formatSegment(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

interface BreadcrumbItem {
  icon: typeof FileText
  label: string
  to?: string
}

const breadcrumb = computed<BreadcrumbItem[]>(() => {
  const path = route.path.replace(studioRoute, '').replace(/^\/+/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) {
    return [{ icon: LayoutDashboard, label: 'Dashboard' }]
  }
  if (parts[0] === 'content' && parts[1]) {
    const collection = formatSegment(parts[1])
    const items: BreadcrumbItem[] = [
      { icon: Folder, label: collection, to: `${studioRoute}/content/${parts[1]}` },
    ]
    if (parts[2] === 'new') {
      items.push({ icon: FileText, label: 'New entry' })
    } else if (parts[2]) {
      items.push({ icon: FileText, label: 'Entry' })
    }
    return items
  }
  const head = parts[0] ?? 'studio'
  if (head === 'settings') return [{ icon: Settings, label: 'Settings' }]
  return [{ icon: LayoutDashboard, label: formatSegment(head) }]
})

const isEntryEditor = computed(() => {
  const path = route.path.replace(studioRoute, '').replace(/^\/+/, '')
  const parts = path.split('/').filter(Boolean)
  return parts[0] === 'content' && Boolean(parts[1]) && Boolean(parts[2])
})

function openPalette() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }
}
</script>

<template>
  <header
    class="studio-header ginko:shrink-0 ginko:border-b ginko:border-border/60 ginko:bg-card ginko:md:hidden"
  >
    <div class="ginko:flex ginko:h-11 ginko:items-center ginko:gap-2 ginko:px-3">
      <SidebarTrigger
        class="ginko:h-7 ginko:w-7 ginko:text-muted-foreground ginko:hover:text-foreground ginko:md:hidden"
      />
      <nav
        v-if="!isEntryEditor"
        class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-2 ginko:text-[13px]"
      >
        <template v-for="(item, index) in breadcrumb" :key="index">
          <ChevronRight
            v-if="index > 0"
            class="ginko:size-3.5 ginko:shrink-0 ginko:text-muted-foreground/50"
          />
          <component
            :is="item.icon"
            class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground/70"
          />
          <RouterLink
            v-if="item.to && index < breadcrumb.length - 1"
            :to="item.to"
            class="ginko:truncate ginko:text-muted-foreground ginko:transition-colors ginko:hover:text-foreground"
          >
            {{ item.label }}
          </RouterLink>
          <span
            v-else
            :class="[
              'ginko:truncate',
              index === breadcrumb.length - 1
                ? 'ginko:font-medium ginko:text-foreground'
                : 'ginko:text-muted-foreground',
            ]"
          >
            {{ item.label }}
          </span>
        </template>
      </nav>
      <div class="ginko:flex-1" />
      <Button
        variant="ghost"
        size="icon"
        class="ginko:h-8 ginko:w-8 ginko:text-muted-foreground ginko:hover:text-foreground ginko:sm:hidden"
        @click="openPalette"
      >
        <Search class="ginko:size-4" />
        <span class="ginko:sr-only">{{ t('ginkoCms.studio.layout.openCommandPalette') }}</span>
      </Button>
    </div>
  </header>
</template>

<style scoped>
.studio-header {
  box-shadow: none;
}
</style>
