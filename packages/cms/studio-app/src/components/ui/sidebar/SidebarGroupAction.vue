<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import { Primitive } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<
  PrimitiveProps & {
    class?: HTMLAttributes['class']
  }
>()
</script>

<template>
  <Primitive
    data-slot="sidebar-group-action"
    data-sidebar="group-action"
    :as="as"
    :as-child="asChild"
    :class="
      cn(
        'ginko:text-sidebar-foreground ginko:ring-sidebar-ring ginko:hover:bg-sidebar-accent ginko:hover:text-sidebar-accent-foreground ginko:absolute ginko:top-3.5 ginko:right-3 ginko:flex ginko:aspect-square ginko:w-5 ginko:items-center ginko:justify-center ginko:rounded-md ginko:p-0 ginko:outline-hidden ginko:transition-transform ginko:focus-visible:ring-2 ginko:[&>svg]:size-4 ginko:[&>svg]:shrink-0',
        'ginko:after:absolute ginko:after:-inset-2 ginko:md:after:hidden',
        'ginko:group-data-[collapsible=icon]:hidden',
        props.class,
      )
    "
  >
    <slot />
  </Primitive>
</template>
