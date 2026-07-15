<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useSlots } from 'vue'

import { cn } from '../ui/utils'

// Page workspace grid: header / optional toolbar / main. Detail surfaces live
// in the shell's right sidebar (useRightSidebarPanel) since Phase L retired
// the in-card action rail.
defineProps<{
  class?: HTMLAttributes['class']
}>()

const slots = useSlots()
</script>

<template>
  <section
    :class="
      cn(
        'studio-workspace ginko:min-h-0 ginko:flex-1 ginko:overflow-hidden ginko:bg-transparent',
        'ginko:w-full ginko:min-w-0 ginko:max-w-full',
        slots.toolbar && 'studio-workspace--with-toolbar',
        $props.class,
      )
    "
  >
    <div v-if="slots.header" class="studio-workspace__header">
      <slot name="header" />
    </div>
    <div v-if="slots.toolbar" class="studio-workspace__toolbar">
      <slot name="toolbar" />
    </div>
    <main class="studio-workspace__main">
      <slot />
    </main>
  </section>
</template>

<style scoped>
.studio-workspace {
  display: grid;
  grid-template-areas:
    'header'
    'main';
  grid-template-rows: auto minmax(0, 1fr);
  box-shadow: none;
}

.studio-workspace--with-toolbar {
  grid-template-areas:
    'header'
    'toolbar'
    'main';
  grid-template-rows: auto auto minmax(0, 1fr);
}

.studio-workspace__header {
  grid-area: header;
  min-width: 0;
}

.studio-workspace__toolbar {
  grid-area: toolbar;
  min-width: 0;
}

.studio-workspace__main {
  grid-area: main;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
