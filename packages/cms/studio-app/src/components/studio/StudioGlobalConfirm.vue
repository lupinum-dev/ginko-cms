<script setup lang="ts">
import { computed } from 'vue'

import { useStudioConfirmState } from '../../composables/internal/useStudioConfirm'
import StudioConfirmDialog from './StudioConfirmDialog.vue'

const { activeRequest, confirm, cancel } = useStudioConfirmState()
const open = computed(() => activeRequest.value !== null)

function onUpdateOpen(value: boolean) {
  if (!value) cancel()
}
</script>

<template>
  <StudioConfirmDialog
    v-if="activeRequest"
    :open="open"
    :title="activeRequest.title"
    :description="activeRequest.description"
    :confirm-label="activeRequest.confirmLabel"
    :cancel-label="activeRequest.cancelLabel"
    :confirm-variant="activeRequest.confirmVariant"
    @update:open="onUpdateOpen"
    @confirm="confirm"
  />
</template>
