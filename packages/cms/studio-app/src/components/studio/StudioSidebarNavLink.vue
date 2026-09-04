<script setup lang="ts">
import { useSidebar } from '../ui/sidebar/utils'

// Studio adaptation of the template's LayoutSidebarNavLink: a single sidebar
// menu entry backed by a vue-router RouterLink instead of NuxtLink. The active
// state is passed in explicitly by the parent (static routes resolve it by
// path, collection routes by the `:collection` param), and the leading icon is
// provided through the `#icon` slot so both lucide icons (via the global Icon
// component) and StudioCollectionIcon compose through the same primitive.
withDefaults(
  defineProps<{
    to: string
    label: string
    tooltip?: string
    active?: boolean
    /** Fallback icon name (e.g. 'lucide:image') used when no #icon slot is given. */
    iconName?: string
  }>(),
  {
    active: false,
  },
)

const { setOpenMobile } = useSidebar()
</script>

<template>
  <SidebarMenuItem>
    <SidebarMenuButton as-child :tooltip="tooltip ?? label" :is-active="active">
      <RouterLink :to="to" @click="setOpenMobile(false)">
        <slot name="icon">
          <Icon v-if="iconName" :name="iconName" class="ginko:size-4" />
        </slot>
        <span>{{ label }}</span>
        <slot name="badge" />
      </RouterLink>
    </SidebarMenuButton>
  </SidebarMenuItem>
</template>
