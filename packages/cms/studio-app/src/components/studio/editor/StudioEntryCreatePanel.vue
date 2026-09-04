<script setup lang="ts">
import { useCmsI18n } from '../../../composables/useCmsI18n'

// Right-sidebar panel for the entry CREATE page (Phase L). Restores the
// "Draft setup" guidance and live route preview that had been passed to the
// editor shell's removed #rail slot (dead since Phase 5). Create actions stay
// canonical in StudioEntryTopBar (D8) — this panel is informational only.

defineProps<{
  computedPath: string | null
}>()

const { t } = useCmsI18n()
</script>

<template>
  <div class="ginko:flex ginko:flex-col ginko:gap-6">
    <StudioInspectorSection :title="t('ginkoCms.studio.collectionEditor.draftSetup')">
      <p class="ginko:mt-3 studio-text-body ginko:text-muted-foreground">
        {{ t('ginkoCms.studio.collectionEditor.draftSetupDescription') }}
      </p>
    </StudioInspectorSection>
    <StudioInspectorSection :title="t('ginkoCms.studio.collectionEditor.routePreview')">
      <div
        class="ginko:mt-3 ginko:truncate ginko:font-mono ginko:text-sm ginko:text-muted-foreground"
      >
        {{ computedPath || t('ginkoCms.studio.collectionEditor.noRouteYet') }}
      </div>
    </StudioInspectorSection>
  </div>
</template>
