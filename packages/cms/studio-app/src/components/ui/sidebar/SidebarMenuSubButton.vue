<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Primitive } from 'reka-ui'
import { cn } from '../utils'

const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      size?: 'sm' | 'md'
      isActive?: boolean
      class?: HTMLAttributes['class']
    }
  >(),
  {
    as: 'a',
    size: 'md',
  },
)
</script>

<template>
  <Primitive
    data-slot="sidebar-menu-sub-button"
    data-sidebar="menu-sub-button"
    :as="as"
    :as-child="asChild"
    :data-size="size"
    :data-active="isActive"
    :class="
      cn(
        'ginko:text-sidebar-foreground ginko:ring-sidebar-ring ginko:hover:bg-sidebar-accent ginko:hover:text-sidebar-accent-foreground ginko:active:bg-sidebar-accent ginko:active:text-sidebar-accent-foreground ginko:[&>svg]:text-sidebar-accent-foreground ginko:flex ginko:h-7 ginko:min-w-0 ginko:-translate-x-px ginko:items-center ginko:gap-2 ginko:overflow-hidden ginko:rounded-md ginko:px-2 ginko:outline-hidden ginko:focus-visible:ring-2 ginko:disabled:pointer-events-none ginko:disabled:opacity-50 ginko:aria-disabled:pointer-events-none ginko:aria-disabled:opacity-50 ginko:[&>span:last-child]:truncate ginko:[&>svg]:size-4 ginko:[&>svg]:shrink-0',
        'ginko:data-[active=true]:bg-sidebar-accent ginko:data-[active=true]:text-sidebar-accent-foreground',
        size === 'sm' && 'ginko:text-xs',
        size === 'md' && 'ginko:text-sm',
        'ginko:group-data-[collapsible=icon]:hidden',
        props.class,
      )
    "
  >
    <slot />
  </Primitive>
</template>
