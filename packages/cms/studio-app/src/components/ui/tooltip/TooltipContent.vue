<script setup lang="ts">
import type { TooltipContentEmits, TooltipContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import {
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '../utils'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<TooltipContentProps & { class?: HTMLAttributes['class'] }>(),
  {
    sideOffset: 4,
  },
)

const emits = defineEmits<TooltipContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <TooltipPortal to="#ginko-cms-studio">
    <TooltipContent
      data-slot="tooltip-content"
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'ginko-cms ginko:bg-primary ginko:text-primary-foreground ginko:animate-in fade-in-0 zoom-in-95 ginko:data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ginko:z-50 ginko:w-fit ginko:rounded-md ginko:px-3 ginko:py-1.5 ginko:text-xs ginko:text-balance',
          props.class,
        )
      "
    >
      <slot />

      <TooltipArrow
        class="ginko:bg-primary ginko:fill-primary ginko:z-50 ginko:size-2.5 ginko:translate-y-[calc(-50%-2px)] ginko:rotate-45 ginko:rounded-[2px]"
      />
    </TooltipContent>
  </TooltipPortal>
</template>
