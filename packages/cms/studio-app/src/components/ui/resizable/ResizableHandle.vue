<script setup lang="ts">
import type {
  SplitterResizeHandleEmits,
  SplitterResizeHandleProps,
} from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { GripVertical } from '@lucide/vue'
import { SplitterResizeHandle, useForwardPropsEmits } from 'reka-ui'
import { cn } from '../utils'

const props = defineProps<
  SplitterResizeHandleProps & {
    class?: HTMLAttributes['class']
    withHandle?: boolean
  }
>()
const emits = defineEmits<SplitterResizeHandleEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'withHandle')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SplitterResizeHandle
    data-slot="resizable-handle"
    v-bind="forwarded"
    :class="
      cn(
        'ginko:bg-border ginko:focus-visible:ring-ring ginko:relative ginko:flex ginko:w-px ginko:items-center ginko:justify-center ginko:after:absolute ginko:after:inset-y-0 ginko:after:left-1/2 ginko:after:w-1 ginko:after:-translate-x-1/2 ginko:focus-visible:ring-1 ginko:focus-visible:ring-offset-1 ginko:focus-visible:outline-hidden ginko:data-[orientation=vertical]:h-px ginko:data-[orientation=vertical]:w-full ginko:data-[orientation=vertical]:after:left-0 ginko:data-[orientation=vertical]:after:h-1 ginko:data-[orientation=vertical]:after:w-full ginko:data-[orientation=vertical]:after:-translate-y-1/2 ginko:data-[orientation=vertical]:after:translate-x-0 ginko:[&[data-orientation=vertical]>div]:rotate-90',
        props.class,
      )
    "
  >
    <template v-if="props.withHandle">
      <div
        class="ginko:bg-border ginko:z-10 ginko:flex ginko:h-4 ginko:w-3 ginko:items-center ginko:justify-center ginko:rounded-xs ginko:border"
      >
        <GripVertical class="ginko:size-2.5" />
      </div>
    </template>
  </SplitterResizeHandle>
</template>
