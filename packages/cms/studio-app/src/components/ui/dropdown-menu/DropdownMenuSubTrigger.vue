<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import type { DropdownMenuSubTriggerProps } from 'reka-ui'
import { DropdownMenuSubTrigger, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<
  DropdownMenuSubTriggerProps & {
    class?: HTMLAttributes['class']
    inset?: boolean
  }
>()

const delegatedProps = reactiveOmit(props, 'class', 'inset')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuSubTrigger
    data-slot="dropdown-menu-sub-trigger"
    v-bind="forwardedProps"
    :class="
      cn(
        'ginko:focus:bg-accent ginko:focus:text-accent-foreground ginko:data-[state=open]:bg-accent ginko:data-[state=open]:text-accent-foreground ginko:flex ginko:cursor-default ginko:items-center ginko:rounded-sm ginko:px-2 ginko:py-1.5 ginko:text-sm ginko:outline-hidden ginko:select-none ginko:data-[inset]:pl-8',
        props.class,
      )
    "
  >
    <slot />
    <ChevronRight class="ginko:ml-auto ginko:size-4" />
  </DropdownMenuSubTrigger>
</template>
