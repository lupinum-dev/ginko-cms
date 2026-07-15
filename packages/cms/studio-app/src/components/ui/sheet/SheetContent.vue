<script setup lang="ts">
import { X } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import { DialogClose, DialogContent, DialogPortal, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'

import { cn } from '../utils'
import SheetOverlay from './SheetOverlay.vue'

interface SheetContentProps extends DialogContentProps {
  class?: HTMLAttributes['class']
  side?: 'top' | 'right' | 'bottom' | 'left'
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<SheetContentProps>(), {
  side: 'right',
})
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'side')

const forwarded = useForwardPropsEmits(delegatedProps, emits)

// Side-specific classes are hoisted out of the template `:class` binding so the
// ginkoify codemod never scans the `side === 'right'` comparison operands — a
// bare position word like 'right'/'left'/'top'/'bottom' collides with the
// Tailwind utility allowlist and would be wrongly prefixed. Selecting the class
// string here keeps the codemod (and its --check gate) away from the operands
// while preserving identical runtime output.
const sideClass = computed(() => {
  switch (props.side) {
    case 'left':
      return 'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left ginko:inset-y-0 ginko:left-0 ginko:h-full ginko:w-3/4 ginko:border-r ginko:sm:max-w-sm'
    case 'top':
      return 'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top ginko:inset-x-0 ginko:top-0 ginko:h-auto ginko:border-b'
    case 'bottom':
      return 'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom ginko:inset-x-0 ginko:bottom-0 ginko:h-auto ginko:border-t'
    case 'right':
    default:
      return 'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right ginko:inset-y-0 ginko:right-0 ginko:h-full ginko:w-3/4 ginko:border-l ginko:sm:max-w-sm'
  }
})
</script>

<template>
  <DialogPortal to="#ginko-cms-studio">
    <SheetOverlay />
    <DialogContent
      data-slot="sheet-content"
      :class="
        cn(
          'ginko-cms ginko:@container ginko:bg-background ginko:data-[state=open]:animate-in ginko:data-[state=closed]:animate-out ginko:fixed ginko:z-50 ginko:flex ginko:flex-col ginko:gap-4 ginko:shadow-lg ginko:transition ginko:ease-in-out ginko:data-[state=closed]:duration-300 ginko:data-[state=open]:duration-500',
          sideClass,
          props.class,
        )
      "
      v-bind="{ ...$attrs, ...forwarded }"
    >
      <slot />

      <DialogClose
        class="ginko:ring-offset-background ginko:focus:ring-ring ginko:data-[state=open]:bg-secondary ginko:absolute ginko:top-4 ginko:right-4 ginko:rounded-xs ginko:opacity-70 ginko:transition-opacity ginko:hover:opacity-100 ginko:focus:ring-2 ginko:focus:ring-offset-2 ginko:focus:outline-hidden ginko:disabled:pointer-events-none"
      >
        <X class="ginko:size-4" />
        <span class="ginko:sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
