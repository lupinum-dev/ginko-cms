<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { ToggleEmits, ToggleProps } from 'reka-ui'
import { Toggle, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import type { ToggleVariants } from '.'
import { toggleVariants } from '.'
import { cn } from '../utils'

const props = defineProps<
  ToggleProps & {
    class?: HTMLAttributes['class']
    variant?: ToggleVariants['variant']
    size?: ToggleVariants['size']
  }
>()
const emits = defineEmits<ToggleEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'variant', 'size')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <Toggle
    data-slot="toggle"
    v-bind="forwarded"
    :class="cn(toggleVariants({ variant, size }), props.class)"
  >
    <slot />
  </Toggle>
</template>
