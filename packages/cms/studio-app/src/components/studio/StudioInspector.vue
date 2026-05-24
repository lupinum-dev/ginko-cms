<script setup lang="ts">
import { PanelRight } from 'lucide-vue-next'
import { ref, watch } from 'vue'

import { Button } from '../ui/button'

const props = defineProps<{
  open: boolean
}>()
const inspectorOpen = ref(false)
watch(
  () => props.open,
  (value: boolean) => {
    if (!value) {
      inspectorOpen.value = false
    }
  },
)
</script>

<template>
  <div class="ginko:relative ginko:flex ginko:min-h-0 ginko:flex-1">
    <div class="ginko:min-h-0 ginko:min-w-0 ginko:flex-1">
      <slot />
    </div>

    <Button
      v-if="open"
      variant="outline"
      size="icon-sm"
      class="ginko:fixed ginko:right-3 ginko:top-3 ginko:z-50 ginko:lg:hidden"
      aria-label="Toggle inspector"
      @click="inspectorOpen = !inspectorOpen"
    >
      <PanelRight class="ginko:size-4" />
    </Button>

    <div
      v-if="inspectorOpen"
      class="ginko:fixed ginko:inset-0 ginko:z-40 ginko:bg-background/80 ginko:backdrop-blur-sm ginko:lg:hidden"
      @click="inspectorOpen = false"
    />

    <aside
      v-if="open"
      class="ginko:fixed ginko:inset-y-0 ginko:right-0 ginko:z-50 ginko:w-80 ginko:max-w-[88vw] ginko:border-l ginko:bg-muted/20 ginko:transition-transform ginko:lg:static ginko:lg:z-auto ginko:lg:w-72 ginko:lg:pl-3"
      :class="
        inspectorOpen ? 'ginko:translate-x-0' : 'ginko:translate-x-full ginko:lg:translate-x-0'
      "
    >
      <slot name="inspector" />
    </aside>
  </div>
</template>
