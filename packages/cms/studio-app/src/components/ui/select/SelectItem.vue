<script setup lang="ts">
import type { SelectItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { Check } from '@lucide/vue'
import {
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  useForwardProps,
} from 'reka-ui'
import { cn } from '../utils'

const props = defineProps<
  SelectItemProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectItem
    data-slot="select-item"
    v-bind="forwardedProps"
    :class="
      cn(
        'ginko:focus:bg-accent ginko:focus:text-accent-foreground ginko:[&_svg:not([class*=\'text-\'])]:text-muted-foreground ginko:relative ginko:flex ginko:w-full ginko:cursor-default ginko:items-center ginko:gap-2 ginko:rounded-sm ginko:py-1.5 ginko:pr-8 ginko:pl-2 ginko:text-sm ginko:outline-hidden ginko:select-none ginko:data-[disabled]:pointer-events-none ginko:data-[disabled]:opacity-50 ginko:[&_svg]:pointer-events-none ginko:[&_svg]:shrink-0 ginko:[&_svg:not([class*=\'size-\'])]:size-4 ginko:*:[span]:last:flex ginko:*:[span]:last:items-center ginko:*:[span]:last:gap-2',
        props.class,
      )
    "
  >
    <span class="ginko:absolute ginko:right-2 ginko:flex ginko:size-3.5 ginko:items-center ginko:justify-center">
      <SelectItemIndicator>
        <slot name="indicator-icon">
          <Check class="ginko:size-4" />
        </slot>
      </SelectItemIndicator>
    </span>

    <SelectItemText>
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
