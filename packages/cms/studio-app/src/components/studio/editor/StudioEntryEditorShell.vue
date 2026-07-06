<script setup lang="ts">
import { useStudioActionRailController } from '../../../composables/useStudioActionRailController'

const { collapsed } = useStudioActionRailController()
</script>

<template>
  <StudioWorkspace :rail="true" :rail-collapsed="collapsed" class="ginko:h-full">
    <template #header>
      <slot name="top" />
    </template>
    <template v-if="$slots.toolbar" #toolbar>
      <slot name="toolbar" />
    </template>
    <div class="studio-entry-editor-shell__main">
      <ScrollArea class="ginko:min-h-0 ginko:flex-1">
        <div class="studio-entry-editor-shell__canvas">
          <slot />
        </div>
      </ScrollArea>
    </div>
    <template #rail>
      <StudioActionRail
        sheet-description="Status, public URL, translations, and available actions."
        sheet-title="Entry details"
        title="Details"
      >
        <slot name="rail" />
        <template v-if="$slots['rail-actions']" #actions>
          <slot name="rail-actions" />
        </template>
        <template v-if="$slots['rail-collapsed']" #collapsed>
          <slot name="rail-collapsed" />
        </template>
      </StudioActionRail>
    </template>
  </StudioWorkspace>
</template>

<style scoped>
.studio-entry-editor-shell__canvas {
  display: grid;
  gap: var(--space-xl);
  padding: var(--space-xl) var(--space-xl) var(--space-3xl);
}

.studio-entry-editor-shell__canvas > * {
  width: min(100%, var(--studio-editor-canvas-max-width, var(--studio-canvas-max-width)));
  min-width: 0;
  margin-inline: auto;
}

.studio-entry-editor-shell__canvas > .studio-page-content--wide {
  width: min(100%, var(--studio-canvas-wide-max-width));
}

.studio-entry-editor-shell__canvas > .studio-page-content--bleed {
  width: 100%;
}

.studio-entry-editor-shell__main {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
}
</style>
