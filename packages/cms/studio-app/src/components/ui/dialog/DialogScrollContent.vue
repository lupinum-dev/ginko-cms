<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { X } from '@lucide/vue'
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '../utils'
import DialogPortal from './DialogPortal.vue'

const props = defineProps<
  DialogContentProps & { class?: HTMLAttributes['class'] }
>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="ginko:fixed ginko:inset-0 ginko:z-50 ginko:grid ginko:place-items-center ginko:overflow-y-auto ginko:bg-black/80 ginko:data-[state=open]:animate-in ginko:data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    >
      <DialogContent
        :class="
          cn(
            'ginko:relative ginko:z-50 ginko:grid ginko:w-full ginko:max-w-lg ginko:my-8 ginko:gap-4 ginko:border ginko:border-border ginko:bg-background ginko:p-6 ginko:shadow-lg ginko:duration-200 ginko:sm:rounded-lg ginko:md:w-full',
            props.class,
          )
        "
        v-bind="forwarded"
        @pointer-down-outside="
          (event) => {
            const originalEvent = event.detail.originalEvent
            const target = originalEvent.target as HTMLElement
            if (
              originalEvent.offsetX > target.clientWidth ||
              originalEvent.offsetY > target.clientHeight
            ) {
              event.preventDefault()
            }
          }
        "
      >
        <slot />

        <DialogClose
          class="ginko:absolute ginko:top-4 ginko:right-4 ginko:p-0.5 ginko:transition-colors ginko:rounded-md ginko:hover:bg-secondary"
        >
          <X class="ginko:w-4 ginko:h-4" />
          <span class="ginko:sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
