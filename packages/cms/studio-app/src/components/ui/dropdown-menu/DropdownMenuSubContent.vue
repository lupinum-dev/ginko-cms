<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { DropdownMenuSubContentEmits, DropdownMenuSubContentProps } from 'reka-ui'
import { DropdownMenuSubContent, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<DropdownMenuSubContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<DropdownMenuSubContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuSubContent
    data-slot="dropdown-menu-sub-content"
    v-bind="forwarded"
    :class="
      cn(
        'ginko:bg-popover ginko:text-popover-foreground ginko:data-[state=open]:animate-in ginko:data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ginko:z-50 ginko:min-w-[8rem] ginko:origin-(--reka-dropdown-menu-content-transform-origin) ginko:overflow-hidden ginko:rounded-md ginko:border ginko:p-1 ginko:shadow-lg',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuSubContent>
</template>
