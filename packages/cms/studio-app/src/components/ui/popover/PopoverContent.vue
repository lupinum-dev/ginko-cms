<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { PopoverContentEmits, PopoverContentProps } from 'reka-ui'
import { PopoverContent, PopoverPortal, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<PopoverContentProps & { class?: HTMLAttributes['class'] }>(),
  {
    align: 'center',
    sideOffset: 4,
  },
)
const emits = defineEmits<PopoverContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <PopoverPortal to="#ginko-cms-studio">
    <PopoverContent
      data-slot="popover-content"
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'ginko-cms ginko:bg-popover ginko:text-popover-foreground ginko:data-[state=open]:animate-in ginko:data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ginko:z-50 ginko:w-72 ginko:rounded-md ginko:border ginko:p-4 ginko:shadow-md ginko:origin-(--reka-popover-content-transform-origin) ginko:outline-hidden',
          props.class,
        )
      "
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
