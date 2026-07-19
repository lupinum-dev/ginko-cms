<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { computed } from 'vue'

import {
  provideStudioEntryEditorContext,
  type StudioEntryEditorContext,
} from '../../../composables/internal/studioEntryEditorContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'

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
const advancedEditor = useStudioAdvancedEditor()
const { t } = useCmsI18n()

// Gate on entry presence, not raw pending: background refreshes (post-save)
// set pending while data is retained, and the panel must not flicker then.
const ready = computed(() => Boolean(editor.loader.entry))
const canPreview = computed(() => Boolean(workflow.value.currentReadinessView?.canPreview))
</script>

<template>
  <div v-if="!ready" class="ginko:py-8 ginko:text-center ginko:text-sm ginko:text-muted-foreground">
    {{ editor.loader.t('ginkoCms.studio.collectionEditor.entryNotFound') }}
  </div>

  <div v-else class="studio-entry-details-panel ginko:flex ginko:flex-col ginko:gap-1">
    <!-- Status: entry status, publishing-flow steps, track-live / route status. -->
    <Collapsible
      :default-open="true"
      class="ginko:border-b ginko:border-border ginko:last:border-b-0"
    >
      <CollapsibleTrigger
        class="studio-entry-details-panel__trigger ginko:group ginko:flex ginko:w-full ginko:items-center ginko:justify-between ginko:gap-2 ginko:py-3 ginko:text-left"
      >
        <span
          class="studio-text-eyebrow ginko:font-semibold ginko:uppercase ginko:tracking-wide ginko:text-muted-foreground"
        >
          {{ t('ginkoCms.studio.entryDetails.status') }}
        </span>
        <ChevronDown
          class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground ginko:transition-transform ginko:group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <StudioEntryStatusRail
          :readiness-detail="workflow.readinessDetail"
          :readiness-pending="workflow.readinessPending"
          :publish-impact-requested="workflow.publishSession.impactRequested"
          :publish-impact="workflow.publishImpact"
          :publish-review="workflow.publishReview"
          :public-visibility="workflow.publicVisibility"
          :request-review-pending="workflow.requestReviewPending"
        />
      </CollapsibleContent>
    </Collapsible>

    <!-- Workflow: publish actions + public-workflow / translation-readiness detail. -->
    <Collapsible
      :default-open="true"
      class="ginko:border-b ginko:border-border ginko:last:border-b-0"
    >
      <CollapsibleTrigger
        class="studio-entry-details-panel__trigger ginko:group ginko:flex ginko:w-full ginko:items-center ginko:justify-between ginko:gap-2 ginko:py-3 ginko:text-left"
      >
        <span
          class="studio-text-eyebrow ginko:font-semibold ginko:uppercase ginko:tracking-wide ginko:text-muted-foreground"
        >
          {{ t('ginkoCms.studio.entryDetails.workflow') }}
        </span>
        <ChevronDown
          class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground ginko:transition-transform ginko:group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent class="ginko:pb-4">
        <!-- One primary action per screen (DESIGN principle 1): the canonical
             Publish CTA lives in StudioEntryTopBar. The rail only offers the
             supporting review actions. -->
        <div class="ginko:grid ginko:gap-2">
          <Button
            variant="outline"
            size="sm"
            class="ginko:w-full"
            :disabled="editor.loader.pending || editor.draft.saving || !canPreview"
            @click="workflow.previewPublishImpact(editor.loader.currentLocale)"
          >
            {{ t('ginkoCms.studio.entryDetails.previewChanges') }}
          </Button>
        </div>

        <StudioPublishOutcomeCard
          v-if="editor.publishing.publishSession.outcome"
          class="ginko:mt-4"
          :outcome="editor.publishing.publishSession.outcome"
          :public-visibility="workflow.publicVisibility"
          :publish-impact="workflow.publishImpact"
        />
        <div
          v-else-if="workflow.publishSession.impactRequested"
          class="ginko:mt-4 ginko:grid ginko:gap-2"
        >
          <div class="ginko:px-1">
            <h3 class="studio-text-title ginko:text-foreground">
              {{ t('ginkoCms.studio.entryDetails.websiteChangesTitle') }}
            </h3>
            <p class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.entryDetails.websiteChangesDescription') }}
            </p>
          </div>
          <StudioPublishImpactSummary
            preview-scope="publish"
            :publish-impact="workflow.publishImpact"
            :publish-review="workflow.publishReview"
            :selected-publish-impact-locale="workflow.publishSession.impactLocale"
          />
        </div>

        <div v-if="advancedEditor" class="ginko:mt-4 ginko:grid ginko:gap-4">
          <StudioEntryPublicWorkflowPanel
            :public-visibility="workflow.publicVisibility"
            :publish-impact-requested="workflow.publishSession.impactRequested"
            :publish-impact="workflow.publishImpact"
            preview-scope="publish"
            :publish-review="workflow.publishReview"
            :selected-publish-impact-locale="workflow.publishSession.impactLocale"
            :show-publish-impact-summary="false"
            @preview-publish-impact="workflow.previewPublishImpact(editor.loader.currentLocale)"
          />
          <StudioEntryTranslationReadinessPanel
            :current-locale="editor.loader.currentLocale"
            :items="workflow.translationReadiness"
            :saving="editor.draft.saving"
            @review="workflow.reviewTranslationReadiness"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>

    <!-- History: version history + checkpoint (restore) controls. -->
    <Collapsible
      :default-open="false"
      class="ginko:border-b ginko:border-border ginko:last:border-b-0"
    >
      <CollapsibleTrigger
        class="studio-entry-details-panel__trigger ginko:group ginko:flex ginko:w-full ginko:items-center ginko:justify-between ginko:gap-2 ginko:py-3 ginko:text-left"
      >
        <span
          class="studio-text-eyebrow ginko:font-semibold ginko:uppercase ginko:tracking-wide ginko:text-muted-foreground"
        >
          {{ t('ginkoCms.studio.entryDetails.history') }}
        </span>
        <ChevronDown
          class="ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground ginko:transition-transform ginko:group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent class="ginko:pb-4">
        <StudioVersionHistoryCard />
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
