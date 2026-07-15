<script setup lang="ts">
import { computed } from 'vue'

import type { StudioAssetContext } from '../../composables/internal/types'
import StudioAssetMetadataForm from './StudioAssetMetadataForm.vue'

// Picker-context wrapper: keeps the dialog chrome the asset picker relies on and
// delegates the body/save to the shared StudioAssetMetadataForm so the dialog and
// the right-sidebar details panel never diverge (RFC Phase 5 step 5 / D4).
const props = defineProps<{
  assetContext?: StudioAssetContext
  assetId: string | null
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const open = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})
</script>

<template>
  <Dialog :open="open" @update:open="open = $event">
    <DialogContent size="sm" class="ginko:gap-0 ginko:overflow-hidden ginko:p-0">
      <DialogHeader class="ginko:border-b ginko:px-5 ginko:py-4 ginko:pr-12">
        <DialogTitle>Edit image details</DialogTitle>
        <DialogDescription>
          Update image text used by editors. Live pages keep their current image details until they
          are published again.
        </DialogDescription>
      </DialogHeader>

      <StudioAssetMetadataForm
        :asset-context="assetContext"
        :asset-id="assetId"
        show-cancel
        @saved="open = false"
        @cancel="open = false"
      />
    </DialogContent>
  </Dialog>
</template>
