<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { ToggleGroupItemProps } from 'reka-ui'
import { ToggleGroupItem, useForwardProps } from 'reka-ui'
import { computed } from 'vue'
import type { HTMLAttributes } from 'vue'

import { useToggleGroupContext } from '.'
import type { ToggleVariants } from '../toggle'
import { toggleVariants } from '../toggle'
import { cn } from '../utils'

const props = defineProps<
  ToggleGroupItemProps & {
    class?: HTMLAttributes['class']
    variant?: ToggleVariants['variant']
    size?: ToggleVariants['size']
  }
>()

const context = useToggleGroupContext()
const variant = computed(() => props.variant ?? context.variant)
const size = computed(() => props.size ?? context.size)

const delegatedProps = reactiveOmit(props, 'class', 'variant', 'size')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <ToggleGroupItem
    data-slot="toggle-group-item"
    :data-variant="variant"
    :data-size="size"
    v-bind="forwarded"
    :class="
      cn(
        toggleVariants({ variant: variant, size: size }),
        'ginko:min-w-0 ginko:flex-1 ginko:shrink-0 ginko:rounded-none ginko:shadow-none ginko:first:rounded-l-md ginko:last:rounded-r-md ginko:focus:z-10 ginko:focus-visible:z-10 ginko:data-[variant=outline]:border-l-0 ginko:data-[variant=outline]:first:border-l',
        props.class,
      )
    "
  >
    <slot />
  </ToggleGroupItem>
</template>
