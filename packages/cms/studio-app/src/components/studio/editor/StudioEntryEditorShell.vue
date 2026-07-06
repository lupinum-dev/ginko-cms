<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

import { useStudioInspectorVisible } from '../../../composables/useStudioInspectorVisible'

const inspectorVisible = useStudioInspectorVisible()
const railAsColumn = useMediaQuery('(min-width: 1280px)')
const showRailColumn = computed(() => inspectorVisible.value && railAsColumn.value)
const showRailSheet = computed(() => inspectorVisible.value && !railAsColumn.value)

function setInspectorOpen(open: boolean) {
  inspectorVisible.value = open
}
</script>

<template>
  <StudioWorkspace :rail="showRailColumn" class="ginko:h-full">
    <template #header>
      <slot name="top" />
    </template>
    <div class="studio-entry-editor-shell__main">
      <slot name="toolbar" />
      <ScrollArea class="ginko:min-h-0 ginko:flex-1">
        <div class="studio-entry-editor-shell__canvas">
          <slot />
        </div>
      </ScrollArea>
    </div>
    <template #rail>
      <div class="studio-entry-editor-shell__rail">
        <div class="studio-entry-editor-shell__rail-header">
          <div class="studio-text-eyebrow ginko:text-muted-foreground/70">Action rail</div>
        </div>
        <ScrollArea class="ginko:min-h-0 ginko:flex-1">
          <div class="studio-entry-editor-shell__rail-body">
            <slot name="rail" />
          </div>
        </ScrollArea>
      </div>
    </template>
  </StudioWorkspace>

  <Sheet :open="showRailSheet" @update:open="setInspectorOpen">
    <SheetContent
      class="ginko:w-[min(calc(100vw_-_1rem),22rem)] ginko:gap-0 ginko:overflow-hidden ginko:bg-muted/30 ginko:p-0 ginko:sm:max-w-md"
      side="right"
    >
      <SheetHeader class="ginko:sr-only">
        <SheetTitle>Inspector</SheetTitle>
        <SheetDescription
          >Entry status, public URL, translations, and diagnostics.</SheetDescription
        >
      </SheetHeader>
      <div class="studio-entry-editor-shell__rail">
        <div class="studio-entry-editor-shell__rail-header">
          <div class="studio-text-eyebrow ginko:text-muted-foreground/70">Action rail</div>
        </div>
        <ScrollArea class="ginko:min-h-0 ginko:flex-1">
          <div class="studio-entry-editor-shell__rail-body">
            <slot name="rail" />
          </div>
        </ScrollArea>
      </div>
    </SheetContent>
  </Sheet>
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

.studio-entry-editor-shell__rail {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
}

.studio-entry-editor-shell__rail-header {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--studio-divider);
  padding: var(--space-md) var(--space-xl);
}

.studio-entry-editor-shell__rail-body {
  min-width: 0;
  padding-inline: var(--space-xl);
}
</style>
