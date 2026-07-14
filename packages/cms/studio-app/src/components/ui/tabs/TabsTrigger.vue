<script setup lang="ts">
import type { TabsTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { TabsTrigger, useForwardProps } from 'reka-ui'
import { cn } from '../utils'

const props = defineProps<
  TabsTriggerProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <TabsTrigger
    data-slot="tabs-trigger"
    v-bind="forwardedProps"
    :class="
      cn(
        'ginko:data-[state=active]:bg-background ginko:dark:data-[state=active]:text-foreground ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:focus-visible:outline-ring ginko:dark:data-[state=active]:border-input ginko:dark:data-[state=active]:bg-input/30 ginko:text-foreground ginko:dark:text-muted-foreground ginko:inline-flex ginko:h-[calc(100%-1px)] ginko:flex-1 ginko:items-center ginko:justify-center ginko:gap-1.5 ginko:rounded-md ginko:border ginko:border-transparent ginko:px-2 ginko:py-1 ginko:text-sm ginko:font-medium ginko:whitespace-nowrap ginko:transition-[color,box-shadow] ginko:focus-visible:ring-[3px] ginko:focus-visible:outline-1 ginko:disabled:pointer-events-none ginko:disabled:opacity-50 ginko:data-[state=active]:shadow-sm ginko:[&_svg]:pointer-events-none ginko:[&_svg]:shrink-0 ginko:[&_svg:not([class*=\'size-\'])]:size-4',
        props.class,
      )
    "
  >
    <slot />
  </TabsTrigger>
</template>
