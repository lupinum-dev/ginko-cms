<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import type { DialogOverlayProps } from 'reka-ui'
import { DialogOverlay } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<DialogOverlayProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <DialogOverlay
    data-slot="dialog-overlay"
    v-bind="delegatedProps"
    :class="
      cn(
        'ginko:data-[state=open]:animate-in ginko:data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ginko:fixed ginko:inset-0 ginko:z-50 ginko:bg-black/45 ginko:backdrop-blur-sm',
        props.class,
      )
    "
  >
    <slot />
  </DialogOverlay>
</template>
