<script setup lang="ts">
import { Search } from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { api } from '../../boundary/api'
import { useCmsConfig } from '../../composables/useCmsConfig'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioQuery } from '../../composables/useCmsStudioQuery'
import {
  codeDefinedCollectionList,
  type StudioCollectionListItem,
} from '../../lib/codeDefinedCollections'
import {
  studioStaticRoutes,
  type StudioStaticRouteId,
} from '../../lib/studioNavigation'

const { t } = useCmsI18n()
const route = useRoute()
const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')

// Collections resolve their human label the same way the sidebar does, so the
// `/content/:collection` breadcrumb reads "Blog" rather than the raw slug.
const collectionsQuery = useCmsStudioQuery(api.ginkoCms.collections.listCollections, {})
const hostCollections = computed(() =>
  codeDefinedCollectionList(cmsConfig.collections, cmsConfig.defaultLocale),
)
const collections = computed(() => {
  const fromConvex = (collectionsQuery.data.value ?? []) as StudioCollectionListItem[]
  if (!hostCollections.value.length) return fromConvex
  const bySlug = new Map(fromConvex.map((collection) => [collection.slug, collection]))
  return hostCollections.value.map((hostCollection) => ({
    ...hostCollection,
    ...bySlug.get(hostCollection.slug),
    label: bySlug.get(hostCollection.slug)?.label || hostCollection.label,
  }))
})

function formatSegment(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function collectionLabel(slug: string): string {
  const found = collections.value.find((collection) => collection.slug === slug)
  return found?.label || formatSegment(slug)
}

// vue-router route name → studioNavigation static-route id, so breadcrumb
// labels come from the same i18n keys the sidebar uses (not path segments).
const routeIdByName: Record<string, StudioStaticRouteId> = {
  'studio-home': 'home',
  'studio-collections': 'collections',
  'studio-assets': 'assets',
  'studio-activity': 'activity',
  'studio-agents': 'agents',
  'studio-reviews': 'reviews',
  'studio-settings': 'settings',
  'studio-site-data': 'siteData',
}

interface BreadcrumbEntry {
  label: string
  to?: RouteLocationRaw
}

const breadcrumb = computed<BreadcrumbEntry[]>(() => {
  const home: BreadcrumbEntry = {
    label: t('ginkoCms.studio.layout.home'),
    to: { name: 'studio-home' },
  }
  const name = String(route.name ?? '')

  // Entry-editor family: Home → Collection → (New content | Entry).
  // Entry titles come from the editor context, which is provided inside the
  // page subtree and is not reachable from this layout-level header (the
  // provide/inject boundary the RFC resolves in Phase 5). Until then the tail
  // is a generic label; the collection segment is fully resolved.
  if (name === 'studio-collection' || name === 'studio-new' || name === 'studio-edit') {
    const slug = String(route.params.collection ?? '')
    const items: BreadcrumbEntry[] = [
      home,
      { label: collectionLabel(slug), to: `${studioRoute}/content/${slug}` },
    ]
    if (name === 'studio-new') {
      items.push({ label: t('ginkoCms.studio.collectionListPage.newEntry') })
    } else if (name === 'studio-edit') {
      items.push({ label: t('ginkoCms.studio.layout.entry') })
    }
    return items
  }

  const id = routeIdByName[name]
  if (!id || id === 'home') {
    return [home]
  }
  const staticRoute = studioStaticRoutes.find((entry) => entry.id === id)
  return [home, { label: staticRoute ? t(staticRoute.labelKey) : formatSegment(name) }]
})

function openPalette() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }
}
</script>

<template>
  <header
    class="studio-header ginko:sticky ginko:top-0 ginko:md:peer-data-[variant=inset]:top-2 ginko:z-10 ginko:flex ginko:h-(--header-height) ginko:shrink-0 ginko:items-center ginko:gap-4 ginko:border-b ginko:border-border/60 ginko:bg-background ginko:px-4 ginko:md:px-6"
  >
    <div class="ginko:flex ginko:h-4 ginko:w-full ginko:min-w-0 ginko:items-center ginko:gap-4">
      <SidebarTrigger />
      <Separator orientation="vertical" />
      <Breadcrumb class="ginko:min-w-0">
        <BreadcrumbList class="ginko:flex-nowrap">
          <template v-for="(item, index) in breadcrumb" :key="index">
            <BreadcrumbItem class="ginko:min-w-0">
              <BreadcrumbLink
                v-if="index !== breadcrumb.length - 1 && item.to"
                as-child
              >
                <RouterLink :to="item.to" class="ginko:truncate">
                  {{ item.label }}
                </RouterLink>
              </BreadcrumbLink>
              <BreadcrumbPage v-else class="ginko:truncate">
                {{ item.label }}
              </BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator v-if="index < breadcrumb.length - 1" />
          </template>
        </BreadcrumbList>
      </Breadcrumb>
    </div>

    <div class="ginko:ml-auto ginko:flex ginko:items-center ginko:gap-2">
      <slot name="actions" />
      <!-- Preserves the mobile command-palette entry point from the previous
           header (the sidebar search trigger is hidden while the rail is
           offcanvas on small screens). -->
      <Button
        variant="ghost"
        size="icon"
        class="ginko:size-8 ginko:text-muted-foreground ginko:hover:text-foreground ginko:md:hidden"
        @click="openPalette"
      >
        <Search class="ginko:size-4" />
        <span class="ginko:sr-only">{{ t('ginkoCms.studio.layout.openCommandPalette') }}</span>
      </Button>
    </div>

    <!-- Phase 4: the right-sidebar toggle mounts here. The template renders a
         <Button data-slot="right-sidebar-trigger"> gated on
         useRightSidebar().available, with aria-controls="right-sidebar" and
         aria-keyshortcuts="Meta+.". Wiring lands with the right-sidebar port. -->
  </header>
</template>

<style scoped>
.studio-header {
  box-shadow: none;
}
</style>
