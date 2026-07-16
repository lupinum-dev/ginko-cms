<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { SwitchRootEmits, SwitchRootProps } from 'reka-ui'
import { SwitchRoot, SwitchThumb, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<SwitchRootProps & { class?: HTMLAttributes['class'] }>()

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
        'ginko:peer ginko:data-[state=checked]:bg-primary ginko:data-[state=unchecked]:bg-input ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:aria-invalid:border-destructive ginko:aria-invalid:ring-destructive/20 ginko:dark:aria-invalid:ring-destructive/40 ginko:dark:data-[state=unchecked]:bg-input/80 ginko:inline-flex ginko:h-[1.15rem] ginko:w-8 ginko:shrink-0 ginko:items-center ginko:rounded-full ginko:border ginko:border-transparent ginko:shadow-xs ginko:transition-all ginko:outline-none ginko:focus-visible:ring-[3px] ginko:disabled:cursor-not-allowed ginko:disabled:opacity-50',
        props.class,
      )
    "
  >
    <SwitchThumb
      data-slot="switch-thumb"
      :class="
        cn(
          'ginko:bg-background ginko:dark:data-[state=unchecked]:bg-foreground ginko:dark:data-[state=checked]:bg-primary-foreground ginko:pointer-events-none ginko:block ginko:size-4 ginko:rounded-full ginko:ring-0 ginko:transition-transform ginko:data-[state=checked]:translate-x-[calc(100%-2px)] ginko:data-[state=unchecked]:translate-x-0',
        )
      "
    >
      <slot name="thumb" />
    </SwitchThumb>
  </SwitchRoot>
</template>
