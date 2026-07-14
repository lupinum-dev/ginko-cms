<script setup lang="ts">
import type { ScrollAreaRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from 'reka-ui'
import { cn } from '../utils'
import ScrollBar from './ScrollBar.vue'

const props = defineProps<
  ScrollAreaRootProps & {
    class?: HTMLAttributes['class']
    viewportClass?: HTMLAttributes['class']
  }
>()

const delegatedProps = reactiveOmit(props, 'class', 'viewportClass')
</script>

<template>
  <ScrollAreaRoot
    data-slot="scroll-area"
    v-bind="delegatedProps"
    :class="cn('ginko:relative ginko:min-h-0 ginko:min-w-0 ginko:w-full', props.class)"
  >
    <ScrollAreaViewport
      data-slot="scroll-area-viewport"
      :class="
        cn(
          'ginko:focus-visible:ring-ring/50 ginko:size-full ginko:rounded-[inherit] ginko:transition-[color,box-shadow] ginko:outline-none ginko:focus-visible:ring-[3px] ginko:focus-visible:outline-1',
          props.viewportClass,
        )
      "
    >
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
