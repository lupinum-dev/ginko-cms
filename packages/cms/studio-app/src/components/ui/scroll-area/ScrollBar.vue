<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { ScrollAreaScrollbarProps } from 'reka-ui'
import { ScrollAreaScrollbar, ScrollAreaThumb } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = withDefaults(
  defineProps<ScrollAreaScrollbarProps & { class?: HTMLAttributes['class'] }>(),
  {
    orientation: 'vertical',
  },
)

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ScrollAreaScrollbar
    data-slot="scroll-area-scrollbar"
    v-bind="delegatedProps"
    :class="
      cn(
        'ginko:flex ginko:touch-none ginko:p-px ginko:transition-colors ginko:select-none',
        orientation === 'vertical' &&
          'ginko:h-full ginko:w-2.5 ginko:border-l ginko:border-l-transparent',
        orientation === 'horizontal' &&
          'ginko:h-2.5 ginko:flex-col ginko:border-t ginko:border-t-transparent',
        props.class,
      )
    "
  >
    <ScrollAreaThumb
      data-slot="scroll-area-thumb"
      class="ginko:bg-border ginko:relative ginko:flex-1 ginko:rounded-full"
    />
  </ScrollAreaScrollbar>
</template>
