<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { Check, Minus } from 'lucide-vue-next'
import type { CheckboxRootEmits, CheckboxRootProps } from 'reka-ui'
import { CheckboxIndicator, CheckboxRoot, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

interface Props extends CheckboxRootProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
const emits = defineEmits<CheckboxRootEmits>()
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <CheckboxRoot
    data-slot="checkbox"
    v-bind="forwarded"
    :class="
      cn(
        'ginko:border-input ginko:dark:bg-input/30 ginko:data-[state=checked]:bg-primary ginko:data-[state=checked]:text-primary-foreground ginko:data-[state=checked]:border-primary ginko:aria-invalid:border-destructive ginko:aria-invalid:ring-destructive/20 ginko:dark:aria-invalid:ring-destructive/40 ginko:dark:aria-invalid:border-destructive/50 ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:peer ginko:relative ginko:flex ginko:size-4 ginko:shrink-0 ginko:items-center ginko:justify-center ginko:rounded-[4px] ginko:border ginko:outline-none ginko:transition-colors ginko:focus-visible:ring-[3px] ginko:disabled:cursor-not-allowed ginko:disabled:opacity-50 ginko:after:absolute ginko:after:-inset-x-3 ginko:after:-inset-y-2',
        props.class,
      )
    "
  >
    <CheckboxIndicator data-slot="checkbox-indicator" class="ginko:grid ginko:place-content-center">
      <Minus v-if="modelValue === 'indeterminate'" class="ginko:size-3.5" />
      <Check v-else class="ginko:size-3.5" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
