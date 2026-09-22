<script setup lang="ts">
import { computed } from 'vue'

import {
  provideStudioEntryEditorContext,
  type StudioEntryEditorContext,
} from '../../../composables/internal/studioEntryEditorContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'

const props = defineProps<{
  editor: StudioEntryEditorContext
}>()

// The panel renders in the LAYOUT tree (RightSidebar), not the page subtree, so
// the page's `provideStudioEntryEditorContext` never reaches here. Re-provide the
// same context object from the prop at the panel root so every existing child
// card keeps its `inject()` unchanged (RFC Phase 5 step 2 / D3). The context
// arrives through the `props: () => ({ editor })` getter the page registers with.
provideStudioEntryEditorContext(props.editor)

const editor = props.editor
const workflow = computed(() => props.editor.workflow)
const { t } = useCmsI18n()

// Gate on entry presence, not raw pending: background refreshes (post-save)
// set pending while data is retained, and the panel must not flicker then.
const ready = computed(() => Boolean(editor.loader.entry))
const canPreview = computed(() => Boolean(workflow.value.currentReadinessView?.canPreview))
</script>

<template>
  <div v-if="!ready" class="ginko:py-8 ginko:text-center ginko:text-sm ginko:text-muted-foreground">
    {{
      editor.loader.pending
        ? t('ginkoCms.common.loading')
        : t('ginkoCms.studio.collectionEditor.entryNotFound')
    }}
  </div>
  <div v-else class="studio-entry-details-panel">
    <details
      v-if="editor.loader.locales.length > 1"
      open
      class="studio-entry-details-panel__section"
    >
      <summary>{{ t('ginkoCms.studio.entryDetails.translations') }}</summary>
      <div class="studio-entry-details-panel__content">
        <StudioEntryStatusRail
          :readiness-detail="workflow.readinessDetail"
          :readiness-pending="workflow.readinessPending"
        />
        <StudioTranslationReview
          v-if="editor.locales.currentLocaleDraftExists"
          :entry-id="editor.loader.entryId"
          :target-locale="editor.loader.currentLocale"
          :locale-options="editor.loader.locales"
          :fields="editor.loader.fields"
          :flush-pending="editor.draft.handleSaveDraft"
        />
      </div>
    </details>
    <details class="studio-entry-details-panel__section">
      <summary>{{ t('ginkoCms.studio.entryDetails.history') }}</summary>
      <div class="studio-entry-details-panel__content"><StudioVersionHistoryCard /></div>
    </details>
    <details class="studio-entry-details-panel__section">
      <summary>{{ t('ginkoCms.studio.entryDetails.deliveryDetails') }}</summary>
      <div class="studio-entry-details-panel__content">
        <p class="ginko:text-xs ginko:text-muted-foreground">
          {{ t('ginkoCms.studio.entryDetails.deliveryDetailsHint') }}
        </p>
        <Button
          variant="outline"
          size="sm"
          :disabled="editor.loader.pending || editor.draft.saving || !canPreview"
          @click="workflow.previewPublishImpact(editor.loader.currentLocale)"
        >
          {{ t('ginkoCms.studio.entryDetails.previewChanges') }}
        </Button>
        <StudioPublishOutcomeCard
          v-if="editor.publishing.publishSession.outcome"
          :outcome="editor.publishing.publishSession.outcome"
          :public-visibility="workflow.publicVisibility"
          :publish-impact="workflow.publishImpact"
        />
        <StudioWorkflowCard
          :readiness-detail="workflow.readinessDetail"
          :readiness-pending="workflow.readinessPending"
          :publish-impact-requested="workflow.publishSession.impactRequested"
          :publish-impact="workflow.publishImpact"
          :publish-review="workflow.publishReview"
          :request-review-pending="workflow.requestReviewPending"
        />
        <StudioEntryTrackCard
          :public-visibility="workflow.publicVisibility"
          :readiness-detail="workflow.readinessDetail"
          :readiness-pending="workflow.readinessPending"
        />
        <StudioEntryPublicWorkflowPanel
          :public-visibility="workflow.publicVisibility"
          :publish-impact-requested="workflow.publishSession.impactRequested"
          :publish-impact="workflow.publishImpact"
          preview-scope="publish"
          :publish-review="workflow.publishReview"
          :selected-publish-impact-locale="workflow.publishSession.impactLocale"
          :show-publish-impact-summary="true"
          @preview-publish-impact="workflow.previewPublishImpact(editor.loader.currentLocale)"
        />
        <StudioEntryTranslationReadinessPanel
          :current-locale="editor.loader.currentLocale"
          :items="workflow.translationReadiness"
          :saving="editor.draft.saving"
          @review="workflow.reviewTranslationReadiness"
        />
      </div>
    </details>
  </div>
</template>

<style scoped>
.studio-entry-details-panel__section {
  border-bottom: 1px solid var(--border);
}
.studio-entry-details-panel__section > summary {
  cursor: pointer;
  padding: 1rem 0;
  font-size: 0.875rem;
  font-weight: 600;
}
.studio-entry-details-panel__section > summary:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: 0.25rem;
}
.studio-entry-details-panel__content {
  display: grid;
  gap: 1rem;
  padding-bottom: 1rem;
  min-width: 0;
}
</style>
