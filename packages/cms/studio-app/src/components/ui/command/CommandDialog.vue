<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from 'reka-ui'
import { useForwardPropsEmits } from 'reka-ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../dialog'
import Command from './Command.vue'

const props = withDefaults(
  defineProps<
    DialogRootProps & {
      title?: string
      description?: string
      class?: string
    }
  >(),
  {
    title: 'Command Palette',
    description: 'Search for commands and navigation',
  },
)
const emits = defineEmits<DialogRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <Dialog v-bind="forwarded">
    <DialogContent class="ginko:overflow-hidden ginko:p-0" :class="props.class" :show-close="false">
      <DialogHeader class="ginko:sr-only">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <Command>
        <slot />
      </Command>
    </DialogContent>
  </Dialog>
</template>
