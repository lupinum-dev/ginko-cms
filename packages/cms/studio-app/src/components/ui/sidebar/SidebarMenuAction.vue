<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Primitive } from 'reka-ui'
import { cn } from '../utils'

const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      showOnHover?: boolean
      class?: HTMLAttributes['class']
    }
  >(),
  {
    as: 'button',
  },
)
</script>

<template>
  <Primitive
    data-slot="sidebar-menu-action"
    data-sidebar="menu-action"
    :class="
      cn(
        'ginko:text-sidebar-foreground ginko:ring-sidebar-ring ginko:hover:bg-sidebar-accent ginko:hover:text-sidebar-accent-foreground ginko:peer-hover/menu-button:text-sidebar-accent-foreground ginko:absolute ginko:top-1.5 ginko:right-1 ginko:flex ginko:aspect-square ginko:w-5 ginko:items-center ginko:justify-center ginko:rounded-md ginko:p-0 ginko:outline-hidden ginko:transition-transform ginko:focus-visible:ring-2 ginko:[&>svg]:size-4 ginko:[&>svg]:shrink-0',
        'ginko:after:absolute ginko:after:-inset-2 ginko:md:after:hidden',
        'ginko:peer-data-[size=sm]/menu-button:top-1',
        'ginko:peer-data-[size=default]/menu-button:top-1.5',
        'ginko:peer-data-[size=lg]/menu-button:top-2.5',
        'ginko:group-data-[collapsible=icon]:hidden',
        showOnHover &&
          'ginko:peer-data-[active=true]/menu-button:text-sidebar-accent-foreground ginko:group-focus-within/menu-item:opacity-100 ginko:group-hover/menu-item:opacity-100 ginko:data-[state=open]:opacity-100 ginko:md:opacity-0',
        props.class,
      )
    "
    :as="as"
    :as-child="asChild"
  >
    <slot />
  </Primitive>
</template>
