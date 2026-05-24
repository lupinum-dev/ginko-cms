<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { ChevronDown } from 'lucide-vue-next'
import type { SelectTriggerProps } from 'reka-ui'
import { SelectIcon, SelectTrigger, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = withDefaults(
  defineProps<
    SelectTriggerProps & {
      class?: HTMLAttributes['class']
      size?: 'sm' | 'default'
    }
  >(),
  { size: 'default' },
)

const delegatedProps = reactiveOmit(props, 'class', 'size')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectTrigger
    data-slot="select-trigger"
    :data-size="size"
    v-bind="forwardedProps"
    :class="
      cn(
        'ginko:border-input ginko:data-[placeholder]:text-muted-foreground ginko:[&_svg:not([class*=\'text-\'])]:text-muted-foreground ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:aria-invalid:ring-destructive/20 ginko:dark:aria-invalid:ring-destructive/40 ginko:aria-invalid:border-destructive ginko:dark:bg-input/30 ginko:dark:hover:bg-input/50 ginko:flex ginko:w-fit ginko:items-center ginko:justify-between ginko:gap-2 ginko:rounded-lg ginko:border ginko:bg-background/50 ginko:px-2.5 ginko:py-1 ginko:text-sm ginko:whitespace-nowrap ginko:transition-[color,box-shadow] ginko:outline-none ginko:focus-visible:ring-[3px] ginko:disabled:cursor-not-allowed ginko:disabled:opacity-50 ginko:data-[size=default]:h-8 ginko:data-[size=sm]:h-7 ginko:*:data-[slot=select-value]:line-clamp-1 ginko:*:data-[slot=select-value]:flex ginko:*:data-[slot=select-value]:items-center ginko:*:data-[slot=select-value]:gap-2 ginko:[&_svg]:pointer-events-none ginko:[&_svg]:shrink-0 ginko:[&_svg:not([class*=\'size-\'])]:size-4',
        props.class,
      )
    "
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="ginko:size-4 ginko:opacity-50" />
    </SelectIcon>
  </SelectTrigger>
</template>
