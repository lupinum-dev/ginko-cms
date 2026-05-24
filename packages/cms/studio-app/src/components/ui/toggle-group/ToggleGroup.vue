<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { ToggleGroupRootEmits, ToggleGroupRootProps } from 'reka-ui'
import { ToggleGroupRoot, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { provideToggleGroupContext } from '.'
import type { ToggleVariants } from '../toggle'
import { cn } from '../utils'

const props = defineProps<
  ToggleGroupRootProps & {
    class?: HTMLAttributes['class']
    variant?: ToggleVariants['variant']
    size?: ToggleVariants['size']
  }
>()
const emits = defineEmits<ToggleGroupRootEmits>()

provideToggleGroupContext({ variant: props.variant, size: props.size })

const delegatedProps = reactiveOmit(props, 'class', 'variant', 'size')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <ToggleGroupRoot
    data-slot="toggle-group"
    :data-variant="variant"
    :data-size="size"
    v-bind="forwarded"
    :class="
      cn(
        'ginko:group/toggle-group ginko:inline-flex ginko:w-fit ginko:items-center ginko:rounded-md',
        props.class,
      )
    "
  >
    <slot />
  </ToggleGroupRoot>
</template>
