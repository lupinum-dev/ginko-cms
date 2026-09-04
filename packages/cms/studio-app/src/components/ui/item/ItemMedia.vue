<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import { Primitive } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      class?: HTMLAttributes['class']
      variant?: 'default' | 'icon' | 'image'
    }
  >(),
  { as: 'div', variant: 'default' },
)
</script>

<template>
  <Primitive
    data-slot="item-media"
    :data-variant="variant"
    :as="as"
    :as-child="asChild"
    :class="
      cn(
        'ginko:flex ginko:shrink-0 ginko:items-center ginko:justify-center ginko:[&_svg]:pointer-events-none ginko:[&_svg]:shrink-0',
        variant === 'icon' &&
          'ginko:size-8 ginko:rounded-lg ginko:bg-muted ginko:text-foreground ginko:[&_svg:not([class*=size-])]:size-4',
        variant === 'image' &&
          'ginko:size-10 ginko:overflow-hidden ginko:rounded-lg ginko:[&>img]:size-full ginko:[&>img]:object-cover',
        props.class,
      )
    "
  >
    <slot />
  </Primitive>
</template>
