<script setup lang="ts">
import { ChevronUp } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import type { SelectScrollUpButtonProps } from 'reka-ui'
import { SelectScrollUpButton, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<SelectScrollUpButtonProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectScrollUpButton
    data-slot="select-scroll-up-button"
    v-bind="forwardedProps"
    :class="
      cn(
        'ginko:flex ginko:cursor-default ginko:items-center ginko:justify-center ginko:py-1',
        props.class,
      )
    "
  >
    <slot>
      <ChevronUp class="ginko:size-4" />
    </slot>
  </SelectScrollUpButton>
</template>
