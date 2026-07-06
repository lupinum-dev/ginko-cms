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
function sectionLinks(section: 'editor' | 'operations' | 'settings') {
  return studioRoutesForSection(section)
    .filter(canAccessRoute)
    .map((route) => ({
      to: studioRouteHref(studioRoute, route),
      icon: route.icon,
      label: t(route.labelKey),
    }))
}
const editorLinks = computed(() => sectionLinks('editor'))
const operationLinks = computed(() => sectionLinks('operations'))
const settingsLinks = computed(() => sectionLinks('settings'))
</script>

<template>
  <SidebarGroup class="ginko:mb-3">
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
          </SidebarMenuItem>
        </template>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

  <SidebarGroup class="ginko:mb-3">
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
    <SidebarGroup class="ginko:mb-3">
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
    <SidebarGroup class="ginko:mb-3">
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
