<script setup lang="ts">
import { Check } from 'lucide-vue-next'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'

const editor = useStudioEntryEditorContext()
</script>

<template>
  <StudioInspectorSection title="Validation summary">
    <ol class="ginko:space-y-3 ginko:text-sm">
      <li class="ginko:flex ginko:items-start ginko:gap-3">
        <span
          class="ginko:grid ginko:size-6 ginko:place-items-center ginko:rounded-full ginko:bg-primary ginko:text-primary-foreground"
        >
          <Check class="ginko:size-3.5" />
        </span>
        <div>
          <div class="ginko:font-medium">
            {{ editor.draft.isDirty ? 'Draft changed' : 'Draft saved' }}
          </div>
          <div class="ginko:text-xs ginko:text-muted-foreground">Current editable state</div>
        </div>
      </li>
      <li class="ginko:flex ginko:items-start ginko:gap-3">
        <span
          class="ginko:grid ginko:size-6 ginko:place-items-center ginko:rounded-full ginko:bg-muted ginko:text-xs ginko:font-medium"
          >2</span
        >
        <div>
          <div class="ginko:font-medium">In translation</div>
          <div class="ginko:text-xs ginko:text-muted-foreground">Compare and complete locales</div>
        </div>
      </li>
      <li class="ginko:flex ginko:items-start ginko:gap-3 ginko:text-muted-foreground">
        <span
          class="ginko:grid ginko:size-6 ginko:place-items-center ginko:rounded-full ginko:border ginko:text-xs ginko:font-medium"
          >3</span
        >
        <div>
          <div class="ginko:font-medium">Review</div>
          <div class="ginko:text-xs">Validate routes and content</div>
        </div>
      </li>
      <li class="ginko:flex ginko:items-start ginko:gap-3 ginko:text-muted-foreground">
        <span
          class="ginko:grid ginko:size-6 ginko:place-items-center ginko:rounded-full ginko:border ginko:text-xs ginko:font-medium"
          >4</span
        >
        <div>
          <div class="ginko:font-medium">Publish</div>
          <div class="ginko:text-xs">Refresh website output</div>
        </div>
      </li>
    </ol>
  </StudioInspectorSection>
</template>
