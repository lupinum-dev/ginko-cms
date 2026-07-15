<script setup lang="ts">
// The editor detail surface (status / workflow / history) moved to the
// right-sidebar details panel (StudioEntryDetailsPanel), so the shell no longer
// owns an action rail — the main column is fields + TipTap + top bar (RFC Phase 5
// step 3). The right sidebar is provided by the layout and toggled from the
// header, not from this shell.
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
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
