<script setup lang="ts">
import { AlertCircle } from '@lucide/vue'
import { resolveEntryTitle } from '@lupinum/ginko-cms-contract/shared/fields/title.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { computed } from 'vue'

import StudioEntryDetailsPanel from '../../components/studio/editor/StudioEntryDetailsPanel.vue'
import { provideStudioEntryEditorContext } from '../../composables/internal/studioEntryEditorContext'
import { useStudioEntryEditor } from '../../composables/internal/useStudioEntryEditor'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useRightSidebarPanel } from '../../composables/useRightSidebar'

const editor = useStudioEntryEditor()
provideStudioEntryEditorContext(editor)
// All public-workflow state (readiness, visibility, publish-impact preview,
// translation readiness, route validation) now lives on `editor.workflow` so it
// is a single source of truth shared by the top bar, the shared publish dialog,
// and the right-sidebar details panel (RFC Phase 5 / D8).
const workflow = editor.workflow

const { t } = useCmsI18n()

const entryTitle = computed(() =>
  resolveEntryTitle(
    editor.draft.dataFields as JsonMap,
    editor.loader.fields,
    editor.loader.collectionConfig?.settings ?? null,
  ),
)
const collectionLabel = computed(() => {
  const label = editor.loader.collectionConfig?.label
  if (typeof label === 'string' && label) return label
  return editor.loader.collection ?? ''
})

// Register the entry-details panel in the right sidebar (RFC Phase 5 step 2).
// The editor context crosses the layout/page provide boundary through the props
// getter; the panel re-provides it so the moved cards keep their inject() intact.
// The reactive title also feeds StudioHeader's last breadcrumb on this route.
useRightSidebarPanel({
  title: () => entryTitle.value || t('ginkoCms.studio.layout.entry'),
  description: () => collectionLabel.value || undefined,
  component: StudioEntryDetailsPanel,
  props: () => ({ editor }),
  defaultOpen: true,
})
</script>

<template>
  <StudioEntryEditorShell>
    <template #top>
      <StudioEntryTopBar
        :readiness-detail="workflow.readinessDetail"
        :request-review-pending="workflow.requestReviewPending"
        @preview-publish-impact="(locale?: string) => workflow.previewPublishImpact(locale)"
        @request-publish-review="(locale?: string) => workflow.requestPublishReview(locale)"
      />
    </template>

    <template #toolbar>
      <StudioEntryCompareToolbar />
    </template>

    <div
      v-if="editor.draft.error"
      class="ginko:rounded-lg ginko:bg-destructive/10 ginko:p-3 ginko:text-sm ginko:text-destructive-fg"
    >
      <div class="ginko:flex ginko:items-start ginko:gap-2">
        <AlertCircle class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0" />
        <div>
          <template v-if="editor.draft.error.includes(';')">
            <ul class="ginko:list-inside ginko:list-disc ginko:space-y-0.5">
              <li v-for="(msg, i) in editor.draft.error.split('; ')" :key="i">
                {{ msg }}
              </li>
            </ul>
          </template>
          <template v-else>
            {{ editor.draft.error }}
          </template>
        </div>
      </div>
    </div>

    <div v-if="editor.loader.pending" class="ginko:space-y-5">
      <div
        class="ginko:space-y-4 ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card ginko:p-5 ginko:shadow-sm"
      >
        <Skeleton
          v-for="i in 5"
          :key="`skeleton-field-${i}`"
          class="ginko:h-10 ginko:w-full ginko:rounded-md"
        />
      </div>
    </div>

    <template v-else-if="editor.loader.entry">
      <div class="ginko:grid ginko:gap-5">
        <div>
          <StudioSharedFieldsPanel />
        </div>

        <div
          class="studio-entry-locale-panels ginko:grid ginko:grid-cols-1 ginko:items-start ginko:gap-5"
          :class="
            workflow.isCompareMode
              ? 'studio-page-content--bleed studio-entry-locale-panels--compare'
              : ''
          "
        >
          <StudioLocaleEditorPanel side="primary" :status="workflow.primaryLocaleStatus" />
          <StudioLocaleEditorPanel
            v-if="workflow.isCompareMode"
            side="secondary"
            :status="workflow.secondaryLocaleStatus"
            :missing-fields="workflow.secondaryLocaleMissingFields"
          />
        </div>
      </div>
    </template>

    <div v-else class="ginko:py-16 ginko:text-center ginko:text-muted-foreground">
      {{ editor.loader.t('ginkoCms.studio.collectionEditor.entryNotFound') }}
    </div>
  </StudioEntryEditorShell>

  <StudioCheckpointDialog />
  <StudioPublishDialog
    :readiness-detail="workflow.readinessDetail"
    :publish-impact="workflow.publishImpact"
    :publish-impact-requested="workflow.publishImpactRequested"
    :publish-review="workflow.publishReview"
  />
</template>

<style scoped>
.studio-entry-locale-panels {
  min-width: 0;
}

.studio-entry-locale-panels > * {
  min-width: 0;
}

@media (min-width: 1600px) {
  .studio-entry-locale-panels--compare {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
