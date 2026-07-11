<script setup lang="ts">
import { X } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { cva, type VariantProps } from 'class-variance-authority'
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import { DialogClose, DialogContent, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'
import DialogOverlay from './DialogOverlay.vue'
import DialogPortal from './DialogPortal.vue'

const dialogContentVariants = cva(
  'ginko-cms ginko:fixed ginko:top-[50%] ginko:left-[50%] ginko:z-50 ginko:grid ginko:translate-x-[-50%] ginko:translate-y-[-50%] ginko:gap-4 ginko:rounded-xl ginko:border ginko:border-border ginko:bg-background ginko:p-6 ginko:shadow-2xl ginko:duration-200 ginko:data-[state=open]:animate-in ginko:data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
  {
    variants: {
      size: {
        sm: 'ginko:w-[min(calc(100vw-2rem),24rem)]',
        default: 'ginko:w-[min(calc(100vw-2rem),32rem)]',
        lg: 'ginko:w-[min(calc(100vw-2rem),48rem)]',
        xl: 'ginko:w-[min(calc(100vw-2rem),64rem)]',
        full: 'ginko:w-[calc(100vw-2rem)]',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
)

type DialogContentVariants = VariantProps<typeof dialogContentVariants>

interface Props extends DialogContentProps {
  class?: HTMLAttributes['class']
  showClose?: boolean
  size?: DialogContentVariants['size']
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<Props>(), {
  showClose: true,
})
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'showClose', 'size')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      data-slot="dialog-content"
      :class="cn(dialogContentVariants({ size: props.size }), props.class)"
      v-bind="{ ...$attrs, ...forwarded }"
    >
      <slot />

      <DialogClose
        v-if="showClose"
        class="ginko:absolute ginko:top-4 ginko:right-4 ginko:inline-flex ginko:size-8 ginko:items-center ginko:justify-center ginko:rounded-md ginko:text-muted-foreground ginko:transition-colors ginko:hover:bg-muted ginko:hover:text-foreground ginko:focus-visible:border-ring ginko:focus-visible:ring-ring/50 ginko:focus-visible:ring-[3px] ginko:outline-none"
      >
        <X class="ginko:size-4" aria-hidden="true" />
        <span class="ginko:sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
