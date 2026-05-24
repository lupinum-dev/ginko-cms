<script setup lang="ts">
import type { DialogPortalProps } from 'reka-ui'
import { DialogPortal } from 'reka-ui'

const props = withDefaults(defineProps<DialogPortalProps>(), {
  to: '#ginko-cms-studio',
})
</script>

<template>
  <DialogPortal data-slot="dialog-portal" v-bind="props">
    <slot />
  </DialogPortal>
</template>
