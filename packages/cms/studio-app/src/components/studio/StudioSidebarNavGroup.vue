<script setup lang="ts">
// Studio adaptation of the template's LayoutSidebarNavGroup. The template's
// group is a collapsible menu with nested children; the Studio navigation is
// flat and organised into labelled sections (Content / Editor / Operations /
// Settings), so a "group" here is a SidebarGroup with an optional label and a
// list of StudioSidebarNavLink entries. Each link carries its own resolved
// active state and icon name from studioNavigation.
export interface StudioNavLinkItem {
  to: string
  label: string
  active?: boolean
  iconName?: string
  tooltip?: string
}

defineProps<{
  label?: string
  links: StudioNavLinkItem[]
}>()
</script>

<template>
  <SidebarGroup v-if="links.length" class="ginko:mb-3">
    <SidebarGroupLabel v-if="label">{{ label }}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <StudioSidebarNavLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :label="link.label"
          :tooltip="link.tooltip"
          :active="link.active"
          :icon-name="link.iconName"
        />
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
