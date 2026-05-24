<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { SelectContentEmits, SelectContentProps } from 'reka-ui'
import { SelectContent, SelectPortal, SelectViewport, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { SelectScrollDownButton, SelectScrollUpButton } from '.'
import { cn } from '../utils'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<SelectContentProps & { class?: HTMLAttributes['class'] }>(),
  {
    position: 'popper',
  },
)
const emits = defineEmits<SelectContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SelectPortal to="#ginko-cms-studio">
    <SelectContent
      data-slot="select-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'ginko-cms ginko:bg-popover ginko:text-popover-foreground ginko:data-[state=open]:animate-in ginko:data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ginko:relative ginko:z-50 ginko:max-h-(--reka-select-content-available-height) ginko:min-w-[8rem] ginko:overflow-x-hidden ginko:overflow-y-auto ginko:rounded-md ginko:border ginko:shadow-md',
          position === 'popper' &&
            'ginko:data-[side=bottom]:translate-y-1 ginko:data-[side=left]:-translate-x-1 ginko:data-[side=right]:translate-x-1 ginko:data-[side=top]:-translate-y-1',
          props.class,
        )
      "
    >
      <SelectScrollUpButton />
      <SelectViewport
        :class="
          cn(
            'ginko:p-1',
            position === 'popper' &&
              'ginko:h-[var(--reka-select-trigger-height)] ginko:w-full ginko:min-w-[var(--reka-select-trigger-width)] ginko:scroll-my-1',
          )
        "
      >
        <slot />
      </SelectViewport>
      <SelectScrollDownButton />
    </SelectContent>
  </SelectPortal>
</template>
