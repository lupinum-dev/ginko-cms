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
import type { StudioNavLinkItem } from './StudioSidebarNavGroup.vue'

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
function sectionLinks(section: 'home' | 'editor' | 'operations' | 'settings'): StudioNavLinkItem[] {
  return studioRoutesForSection(section)
    .filter(canAccessRoute)
    .map((route) => {
      const to = studioRouteHref(studioRoute, route)
      return {
        to,
        iconName: route.icon,
        label: t(route.labelKey),
        active: isActive(to),
      }
    })
}
// The Home link is a discrete nav item again (UI-REVISION P0; the shell swap
// had regressed it to logo-as-home only — design review, audit D).
const homeLinks = computed(() => sectionLinks('home'))
const editorLinks = computed(() => sectionLinks('editor'))
const operationLinks = computed(() => sectionLinks('operations'))
const settingsLinks = computed(() => sectionLinks('settings'))
</script>

<template>
  <SidebarGroup class="ginko:mb-1 ginko:pt-0">
    <SidebarGroupContent>
      <SidebarMenu>
        <StudioSidebarNavLink
          v-for="link in homeLinks"
          :key="link.to"
          :to="link.to"
          :label="link.label"
          :tooltip="link.label"
          :icon-name="link.iconName"
          :active="route.path === link.to || route.path === `${link.to}/`"
        />
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

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
          <StudioSidebarNavLink
            v-for="collection in collections"
            :key="collection.slug"
            :to="`${contentRoute}/${collection.slug}`"
            :label="collection.label"
            :tooltip="collection.label"
            :active="activeCollection === collection.slug"
          >
            <template #icon>
              <StudioCollectionIcon
                :icon="collection.icon"
                :slug="collection.slug"
                class="ginko:size-4"
              />
            </template>
          </StudioSidebarNavLink>
        </template>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

  <StudioSidebarNavGroup :label="t('ginkoCms.studio.layout.editor')" :links="editorLinks" />

  <StudioSidebarNavGroup :label="t('ginkoCms.studio.layout.operations')" :links="operationLinks" />

  <StudioSidebarNavGroup :label="t('ginkoCms.common.settings')" :links="settingsLinks" />
</template>
