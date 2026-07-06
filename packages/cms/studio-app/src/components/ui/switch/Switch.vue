<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { SwitchRootEmits, SwitchRootProps } from 'reka-ui'
import { SwitchRoot, SwitchThumb, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

interface Props extends SwitchRootProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
const emits = defineEmits<SwitchRootEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits) as unknown as Record<string, unknown>
</script>

<template>
  <SwitchRoot
    data-slot="switch"
    v-bind="forwarded"
    :class="
      cn(
        'ginko:peer ginko:inline-flex ginko:h-5 ginko:w-9 ginko:shrink-0 ginko:cursor-pointer ginko:items-center ginko:rounded-full ginko:border ginko:border-transparent ginko:transition-colors ginko:focus-visible:outline-none ginko:focus-visible:ring-[3px] ginko:focus-visible:ring-ring/50 ginko:disabled:cursor-not-allowed ginko:disabled:opacity-50 ginko:data-[state=checked]:bg-primary ginko:data-[state=unchecked]:bg-input',
        props.class,
      )
    "
  >
    <SwitchThumb
      data-slot="switch-thumb"
      :class="
        cn(
          'ginko:pointer-events-none ginko:block ginko:size-4 ginko:rounded-full ginko:bg-background ginko:ring-0 ginko:transition-transform ginko:data-[state=checked]:translate-x-4 ginko:data-[state=unchecked]:translate-x-0',
        )
      "
    />
  </SwitchRoot>
</template>
