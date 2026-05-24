<script setup lang="ts">
import { Ellipsis, Flag } from 'lucide-vue-next'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'

const editor = useStudioEntryEditorContext()
</script>

<template>
  <StudioInspectorSection title="Versions">
    <template #action>
      <Button
        variant="ghost"
        size="sm"
        class="ginko:h-7 ginko:gap-2 ginko:px-2"
        @click="editor.history.showCheckpointDialog = true"
      >
        <Flag class="ginko:size-3.5" />
        Checkpoint
      </Button>
    </template>
    <div
      v-if="editor.history.versions.length === 0"
      class="ginko:mt-4 ginko:text-[12px] ginko:text-muted-foreground"
    >
      No versions yet.
    </div>
    <div
      v-else
      class="ginko:mt-4 ginko:overflow-hidden ginko:rounded-md ginko:border ginko:border-border/40"
    >
      <StudioRow
        v-for="(version, idx) in editor.history.versions.slice(0, 3)"
        :key="version._id"
        density="compact"
        :class="[Number(idx) > 0 && 'ginko:border-t ginko:border-border/30']"
      >
        <template #title>
          v{{ version.version }}
          <span v-if="version.isCurrentPublished" class="ginko:ml-1 ginko:text-success-fg"
            >Live</span
          >
        </template>
        <template #description>
          <NuxtTime
            :datetime="version.createdAt"
            :locale="editor.loader.dateLocale"
            month="short"
            day="numeric"
            hour="2-digit"
            minute="2-digit"
          />
        </template>
        <template #actions>
          <Button
            variant="ghost"
            size="icon"
            class="ginko:size-7"
            @click="editor.history.toggleVersionPreview(version._id)"
          >
            <Ellipsis class="ginko:size-4" />
          </Button>
        </template>
      </StudioRow>
    </div>
  </StudioInspectorSection>
</template>
