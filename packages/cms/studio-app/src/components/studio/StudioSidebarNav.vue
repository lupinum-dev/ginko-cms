<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { api } from '../../boundary/api'
import { cmsPermissionKeys, type CmsPermissionKey } from '../../composables/permissions'
import { useCmsConfig } from '../../composables/useCmsConfig'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioAccess } from '../../composables/useCmsStudioAccess'
import { useCmsStudioQuery } from '../../composables/useCmsStudioQuery'
import {
  codeDefinedCollectionList,
  type StudioCollectionListItem,
} from '../../lib/codeDefinedCollections'
import {
  studioRouteHref,
  studioRoutesForSection,
  type StudioRouteSection,
  type StudioStaticRoute,
} from '../../lib/studioNavigation'
import StudioCollectionIcon from './collections/StudioCollectionIcon.vue'

const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const { t } = useCmsI18n()
const { can } = useCmsStudioAccess()
const canManageAssets = can(cmsPermissionKeys.manageAssets)
const canManageCollections = can(cmsPermissionKeys.manageCollections)
const canManageSettings = can(cmsPermissionKeys.manageSettings)
const canPublishEntries = can(cmsPermissionKeys.publishEntries)
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
const isCollectionsLoading = computed(
  () =>
    !hostCollections.value.length &&
    collectionsQuery.data.value === null &&
    collectionsQuery.pending.value,
)
const route = useRoute()
const activeCollection = computed(() => route.params.collection)
const isHomeActive = computed(() => route.name === 'studio-home')
function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}
const capabilityAccess: Partial<Record<CmsPermissionKey, typeof canManageAssets>> = {
  [cmsPermissionKeys.manageAssets]: canManageAssets,
  [cmsPermissionKeys.manageCollections]: canManageCollections,
  [cmsPermissionKeys.manageSettings]: canManageSettings,
  [cmsPermissionKeys.publishEntries]: canPublishEntries,
}
function canAccessRoute(route: StudioStaticRoute): boolean {
  const requiredCapability = route.requiredCapability
  return !requiredCapability || capabilityAccess[requiredCapability]?.value === true
}
function sectionLinks(section: StudioRouteSection) {
  return studioRoutesForSection(section)
    .filter(canAccessRoute)
    .map((route) => ({
      to: studioRouteHref(studioRoute, route),
      icon: route.icon,
      label: t(route.labelKey),
    }))
}
const homeLink = computed(() => sectionLinks('home')[0])
const editorLinks = computed(() => sectionLinks('editor'))
const operationLinks = computed(() => sectionLinks('operations'))
const settingsLinks = computed(() => sectionLinks('settings'))
</script>

<template>
  <SidebarGroup class="studio-sidebar-nav__group">
    <SidebarGroupLabel>Home</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton as-child :tooltip="homeLink?.label" :is-active="isHomeActive">
            <RouterLink :to="homeLink?.to || studioRoute">
              <Icon :name="homeLink?.icon || 'lucide:layout-dashboard'" class="ginko:size-4" />
              <span>{{ homeLink?.label }}</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

  <SidebarGroup class="studio-sidebar-nav__group">
    <SidebarGroupLabel>
      {{ t('ginkoCms.studio.layout.content') }}
    </SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <template v-if="isCollectionsLoading">
          <li role="status" aria-busy="true" aria-live="polite" class="ginko:contents">
            <span class="ginko:sr-only">Loading collections</span>
            <SidebarMenuItem
              v-for="(w, i) in [60, 75, 50, 80, 65]"
              :key="`skeleton-${i}`"
              aria-hidden="true"
            >
              <div
                class="ginko:flex ginko:h-8 ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2"
              >
                <Skeleton class="ginko:size-4 ginko:rounded-md" />
                <Skeleton class="ginko:h-4 ginko:flex-1" :style="{ maxWidth: `${w}%` }" />
              </div>
            </SidebarMenuItem>
          </li>
        </template>
        <template v-else>
          <SidebarMenuItem v-for="collection in collections" :key="collection.slug">
            <SidebarMenuButton
              as-child
              :tooltip="collection.label"
              :is-active="activeCollection === collection.slug"
            >
              <RouterLink :to="`${contentRoute}/${collection.slug}`">
                <StudioCollectionIcon
                  :icon="collection.icon"
                  :slug="collection.slug"
                  class="ginko:size-4"
                />
                <span>{{ collection.label }}</span>
              </RouterLink>
            </SidebarMenuButton>
            <SidebarMenuBadge
              v-if="collection.singleton"
              class="studio-singleton-chip"
              :title="t('ginkoCms.studio.layout.singletonBadge')"
              :aria-label="t('ginkoCms.studio.layout.singletonBadge')"
            >
              1
            </SidebarMenuBadge>
          </SidebarMenuItem>
        </template>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

  <SidebarSeparator />

  <SidebarGroup class="studio-sidebar-nav__group">
    <SidebarGroupLabel>{{ t('ginkoCms.studio.layout.editor') }}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="link in editorLinks" :key="link.to">
          <SidebarMenuButton as-child :tooltip="link.label" :is-active="isActive(link.to)">
            <RouterLink :to="link.to">
              <Icon :name="link.icon" class="ginko:size-4" />
              <span>{{ link.label }}</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

  <template v-if="operationLinks.length">
    <SidebarSeparator />

    <SidebarGroup class="studio-sidebar-nav__group">
      <SidebarGroupLabel>{{ t('ginkoCms.studio.layout.operations') }}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem v-for="link in operationLinks" :key="link.to">
            <SidebarMenuButton as-child :tooltip="link.label" :is-active="isActive(link.to)">
              <RouterLink :to="link.to">
                <Icon :name="link.icon" class="ginko:size-4" />
                <span>{{ link.label }}</span>
              </RouterLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </template>

  <template v-if="settingsLinks.length">
    <SidebarSeparator />

    <SidebarGroup class="studio-sidebar-nav__group">
      <SidebarGroupLabel>
        {{ t('ginkoCms.common.settings') }}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem v-for="link in settingsLinks" :key="link.to">
            <SidebarMenuButton as-child :tooltip="link.label" :is-active="isActive(link.to)">
              <RouterLink :to="link.to">
                <Icon :name="link.icon" class="ginko:size-4" />
                <span>{{ link.label }}</span>
              </RouterLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </template>
</template>

<style scoped>
.studio-sidebar-nav__group {
  margin-bottom: 0.75rem;
}

:deep([data-sidebar='group-label']) {
  height: 1.75rem;
  padding-inline: 0.5rem;
  margin-bottom: 0.25rem;
  color: color-mix(in oklch, var(--sidebar-foreground) 60%, transparent);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

:deep([data-sidebar='menu-button']) {
  height: 1.875rem;
  padding-inline: 0.5rem;
  border-radius: 0.375rem;
  color: color-mix(in oklch, var(--sidebar-foreground) 70%, transparent);
  font-size: 0.8125rem;
  gap: 0.625rem;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

:deep([data-sidebar='menu-button'] svg) {
  color: color-mix(in oklch, var(--sidebar-foreground) 60%, transparent);
}

:deep([data-sidebar='menu-button']:hover) {
  background: color-mix(in oklch, var(--sidebar-accent) 50%, transparent);
  color: var(--sidebar-foreground);
}

:deep([data-sidebar='menu-button'][data-active='true']),
:deep([data-sidebar='menu-button'][data-active='']) {
  background: color-mix(in oklch, var(--sidebar-foreground) 10%, transparent);
  color: var(--sidebar-foreground);
  font-weight: 500;
  box-shadow: none;
}

:deep([data-sidebar='menu-button'][data-active='true'] svg),
:deep([data-sidebar='menu-button'][data-active=''] svg),
:deep([data-sidebar='menu-button']:hover svg) {
  color: currentColor;
}

:deep([data-sidebar='separator']) {
  display: none;
}

/* Singleton "1" chip — quiet metadata next to one-of-a-kind collections.
 * Numeric, monospace, tinted. Reads as "this collection has exactly one
 * entry" without the awkward "single" word floating in the row. */
:deep(.studio-singleton-chip) {
  top: 0.3125rem;
  right: 0.375rem;
  height: 1rem;
  min-width: 1rem;
  padding-inline: 0.25rem;
  border-radius: 0.25rem;
  background: color-mix(in oklch, var(--sidebar-foreground) 8%, transparent);
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0;
  color: color-mix(in oklch, var(--sidebar-foreground) 55%, transparent);
}

:deep([data-sidebar='menu-button']:hover) ~ .studio-singleton-chip,
:deep([data-sidebar='menu-button'][data-active='true']) ~ .studio-singleton-chip,
:deep([data-sidebar='menu-button'][data-active='']) ~ .studio-singleton-chip {
  background: color-mix(in oklch, var(--sidebar-foreground) 12%, transparent);
  color: color-mix(in oklch, var(--sidebar-foreground) 70%, transparent);
}
</style>
