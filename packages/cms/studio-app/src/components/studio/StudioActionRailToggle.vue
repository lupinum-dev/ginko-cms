<script setup lang="ts">
import { PanelRightClose, PanelRightOpen } from 'lucide-vue-next'

import { useStudioActionRailController } from '../../composables/useStudioActionRailController'

const { open, railAsColumn, toggle, toggleLabel } = useStudioActionRailController()
</script>

<template>
  <Button
    variant="ghost"
    size="icon-sm"
    :aria-label="toggleLabel"
    :title="toggleLabel"
    @click="toggle"
  >
    <PanelRightClose v-if="railAsColumn && open" class="ginko:size-4" />
    <PanelRightOpen v-else class="ginko:size-4" />
  </Button>
</template>
