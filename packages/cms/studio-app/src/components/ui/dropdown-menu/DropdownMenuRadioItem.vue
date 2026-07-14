<script setup lang="ts">
import type {
  DropdownMenuRadioItemEmits,
  DropdownMenuRadioItemProps,
} from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { Circle } from '@lucide/vue'
import {
  DropdownMenuItemIndicator,
  DropdownMenuRadioItem,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '../utils'

const props = defineProps<
  DropdownMenuRadioItemProps & { class?: HTMLAttributes['class'] }
>()

const emits = defineEmits<DropdownMenuRadioItemEmits>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuRadioItem
    data-slot="dropdown-menu-radio-item"
    v-bind="forwarded"
    :class="
      cn(
        'ginko:focus:bg-accent ginko:focus:text-accent-foreground ginko:relative ginko:flex ginko:cursor-default ginko:items-center ginko:gap-2 ginko:rounded-sm ginko:py-1.5 ginko:pr-2 ginko:pl-8 ginko:text-sm ginko:outline-hidden ginko:select-none ginko:data-[disabled]:pointer-events-none ginko:data-[disabled]:opacity-50 ginko:[&_svg]:pointer-events-none ginko:[&_svg]:shrink-0 ginko:[&_svg:not([class*=\'size-\'])]:size-4',
        props.class,
      )
    "
  >
    <span
      class="ginko:pointer-events-none ginko:absolute ginko:left-2 ginko:flex ginko:size-3.5 ginko:items-center ginko:justify-center"
    >
      <DropdownMenuItemIndicator>
        <slot name="indicator-icon">
          <Circle class="ginko:size-2 ginko:fill-current" aria-hidden="true" />
        </slot>
      </DropdownMenuItemIndicator>
    </span>
    <slot />
  </DropdownMenuRadioItem>
</template>
