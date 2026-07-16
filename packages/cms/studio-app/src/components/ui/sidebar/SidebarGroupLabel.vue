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
    data-slot="sidebar-group-label"
    data-sidebar="group-label"
    :as="as"
    :as-child="asChild"
    :class="
      cn(
        'ginko:text-sidebar-foreground/70 ginko:ring-sidebar-ring ginko:flex ginko:h-8 ginko:shrink-0 ginko:items-center ginko:rounded-md ginko:px-2 ginko:text-xs ginko:font-medium ginko:outline-hidden ginko:transition-[margin,opacity] ginko:duration-200 ginko:ease-linear ginko:focus-visible:ring-2 ginko:[&>svg]:size-4 ginko:[&>svg]:shrink-0',
        'ginko:group-data-[collapsible=icon]:-mt-8 ginko:group-data-[collapsible=icon]:opacity-0',
        props.class,
      )
    "
  >
    <slot />
  </Primitive>
</template>
