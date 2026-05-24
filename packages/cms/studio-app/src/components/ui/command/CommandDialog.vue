<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from 'reka-ui'
import { useForwardPropsEmits } from 'reka-ui'

import Dialog from '../dialog/Dialog.vue'
import DialogContent from '../dialog/DialogContent.vue'
import DialogDescription from '../dialog/DialogDescription.vue'
import DialogTitle from '../dialog/DialogTitle.vue'

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
      <DialogTitle class="ginko:sr-only">{{ title }}</DialogTitle>
      <DialogDescription class="ginko:sr-only">{{ description }}</DialogDescription>
      <div
        class="ginko:[&_[data-slot=command-input-wrapper]_svg]:size-4 ginko:[&_[data-slot=command-input]]:h-12 ginko:[&_[data-slot=command-input-wrapper]]:h-12 ginko:[&_[data-slot=command-group]_[data-slot=command-item]]:px-2 ginko:[&_[data-slot=command-item]]:py-3"
      >
        <slot />
      </div>
    </DialogContent>
  </Dialog>
</template>
