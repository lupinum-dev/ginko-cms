<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { DropdownMenuItemProps } from 'reka-ui'
import { DropdownMenuItem, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = withDefaults(
  defineProps<
    DropdownMenuItemProps & {
      class?: HTMLAttributes['class']
      inset?: boolean
      variant?: 'default' | 'destructive'
    }
  >(),
  {
    variant: 'default',
  },
)

const delegatedProps = reactiveOmit(props, 'inset', 'variant', 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuItem
    data-slot="dropdown-menu-item"
    :data-inset="inset ? '' : undefined"
    :data-variant="variant"
    v-bind="forwardedProps"
    :class="
      cn(
        'ginko:focus:bg-accent ginko:focus:text-accent-foreground ginko:data-[variant=destructive]:text-destructive-foreground ginko:data-[variant=destructive]:focus:bg-destructive/10 ginko:dark:data-[variant=destructive]:focus:bg-destructive/40 ginko:data-[variant=destructive]:focus:text-destructive-foreground ginko:data-[variant=destructive]:*:[svg]:!text-destructive-foreground ginko:[&_svg:not([class*=\'text-\'])]:text-muted-foreground ginko:relative ginko:flex ginko:cursor-default ginko:items-center ginko:gap-2 ginko:rounded-sm ginko:px-2 ginko:py-1.5 ginko:text-sm ginko:outline-hidden ginko:select-none ginko:data-[disabled]:pointer-events-none ginko:data-[disabled]:opacity-50 ginko:data-[inset]:pl-8 ginko:[&_svg]:pointer-events-none ginko:[&_svg]:shrink-0 ginko:[&_svg:not([class*=\'size-\'])]:size-4',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
