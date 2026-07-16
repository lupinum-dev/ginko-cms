<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { VariantProps } from 'class-variance-authority'
import type { ToggleGroupItemProps } from 'reka-ui'
import { ToggleGroupItem, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { inject } from 'vue'

import { toggleVariants } from '../toggle'
import { cn } from '../utils'

type ToggleGroupVariants = VariantProps<typeof toggleVariants>

const props = defineProps<
  ToggleGroupItemProps & {
    class?: HTMLAttributes['class']
    variant?: ToggleGroupVariants['variant']
    size?: ToggleGroupVariants['size']
  }
>()

const context = inject<ToggleGroupVariants>('toggleGroup')

const delegatedProps = reactiveOmit(props, 'class', 'size', 'variant')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ToggleGroupItem
    v-slot="slotProps"
    data-slot="toggle-group-item"
    :data-variant="context?.variant || variant"
    :data-size="context?.size || size"
    v-bind="forwardedProps"
    :class="
      cn(
        toggleVariants({
          variant: context?.variant || variant,
          size: context?.size || size,
        }),
        'ginko:min-w-0 ginko:flex-1 ginko:shrink-0 ginko:rounded-none ginko:shadow-none ginko:first:!rounded-l-md ginko:last:!rounded-r-md ginko:focus:z-10 ginko:focus-visible:z-10 ginko:data-[variant=outline]:border-l-0 ginko:data-[variant=outline]:first:border-l',
        props.class,
      )
    "
  >
    <slot v-bind="slotProps" />
  </ToggleGroupItem>
</template>
