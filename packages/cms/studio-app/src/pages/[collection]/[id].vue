<script setup lang="ts">
import { resolveEntryTitle } from '@lupinum/ginko-cms-contract/shared/fields/title.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { computed } from 'vue'

import StudioCreateTranslationDialog from '../../components/studio/editor/StudioCreateTranslationDialog.vue'
import StudioEntryDetailsPanel from '../../components/studio/editor/StudioEntryDetailsPanel.vue'
import StudioEntryHeroFields from '../../components/studio/editor/StudioEntryHeroFields.vue'
import StudioMissingLocalePanel from '../../components/studio/editor/StudioMissingLocalePanel.vue'
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

// Shared hero fields render once above the locale panels; localized ones
// render inside each panel (see StudioLocaleEditorPanel).
const sharedHeroTitleField = computed(() =>
  editor.loader.heroTitleField && !editor.loader.heroTitleField.localized
    ? editor.loader.heroTitleField
    : null,
)
const sharedHeroDescriptionField = computed(() =>
  editor.loader.heroDescriptionField && !editor.loader.heroDescriptionField.localized
    ? editor.loader.heroDescriptionField
    : null,
)

// Register the entry-details panel in the right sidebar (RFC Phase 5 step 2).
// The editor context crosses the layout/page provide boundary through the props
// getter; the panel re-provides it so the moved cards keep their inject() intact.
// The reactive title also feeds StudioHeader's last breadcrumb on this route.
useRightSidebarPanel({
  // Locale without a title yet → the slug still identifies the entry far
  // better than a generic "Entry" (W1 walkthrough finding).
  title: () => entryTitle.value || editor.loader.entry?.slug || t('ginkoCms.studio.layout.entry'),
  description: () => collectionLabel.value || undefined,
  component: StudioEntryDetailsPanel,
  props: () => ({ editor }),
  defaultOpen: true,
  // The content being edited wins the space fight (design review S2): the
  // details panel opens at the 320px metadata width even on laptop viewports.
  // Users can still drag it wider; the preference persists.
  compact: true,
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

    <StudioNotice v-if="editor.draft.error" tone="danger">
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
    </StudioNotice>

    <!-- The skeleton covers the FIRST load of a route only. `pending` also
         flips during the background refreshEntry after every autosave; routing
         that through the skeleton unmounted the whole form, which destroyed
         the focused TipTap instance mid-typing (focus loss, dropped
         keystrokes, undo history reset). `initialized` resets on entry/locale
         navigation and turns true once the draft has hydrated, so it
         distinguishes first load from background refresh. -->
    <div
      v-if="editor.loader.pending && (!editor.loader.initialized || !editor.loader.entry)"
      class="ginko:space-y-5"
    >
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
        <!-- Archived is otherwise only visible as a pill; the form reads as
             broken without an explicit explanation (design review S2). -->
        <StudioNotice
          v-if="editor.loader.entry.status === 'archived'"
          tone="warning"
          :title="t('ginkoCms.studio.collectionEditor.archivedNoticeTitle')"
          :description="t('ginkoCms.studio.collectionEditor.archivedNoticeDescription')"
        >
          <template v-if="editor.loader.canArchiveEntries" #action>
            <Button
              variant="outline"
              size="sm"
              :disabled="editor.draft.saving"
              @click="editor.publishing.handleRestore()"
            >
              {{ t('ginkoCms.common.restoreDraft') }}
            </Button>
          </template>
        </StudioNotice>
        <!-- Writing surface (content-first order): a SHARED title/description
             renders once as the page hero; locale panels carry their own hero
             when the title is localized. Shared metadata moves BELOW. -->
        <StudioEntryHeroFields
          v-if="sharedHeroTitleField"
          :title-field="sharedHeroTitleField"
          :description-field="sharedHeroDescriptionField"
          :values="editor.draft.dataFields"
          :disabled="!editor.loader.canEditEntries"
          show-validation
          class="ginko:px-1"
          @update="(key, value) => (editor.draft.dataFields[key] = value)"
        />

        <div
          class="studio-entry-locale-panels ginko:grid ginko:grid-cols-1 ginko:items-start ginko:gap-5"
          :class="
            workflow.isCompareMode
              ? 'studio-page-content--bleed studio-entry-locale-panels--compare'
              : ''
          "
        >
          <StudioLocaleEditorPanel
            v-if="editor.locales.currentLocaleDraftExists"
            side="primary"
            :status="workflow.primaryLocaleStatus"
            :state="workflow.primaryLocaleState"
            :blocked="workflow.primaryLocaleBlocked"
          />
          <StudioMissingLocalePanel
            v-else
            side="primary"
            :locale="editor.loader.currentLocale"
            :can-edit="editor.loader.canEditEntries"
            @add="editor.locales.beginLocaleCreation(editor.loader.currentLocale)"
          />
          <StudioLocaleEditorPanel
            v-if="workflow.isCompareMode && editor.locales.secondaryLocaleDraftExists"
            side="secondary"
            :status="workflow.secondaryLocaleStatus"
            :state="workflow.secondaryLocaleState"
            :blocked="workflow.secondaryLocaleBlocked"
            :missing-fields="workflow.secondaryLocaleMissingFields"
          />
          <StudioMissingLocalePanel
            v-else-if="workflow.isCompareMode"
            side="secondary"
            :locale="editor.locales.secondaryLocale"
            :can-edit="editor.loader.canEditEntries"
            @add="editor.locales.beginLocaleCreation(editor.locales.secondaryLocale)"
          />
        </div>

        <!-- Shared metadata reads as details, not headline — it hides itself
             when the hero absorbed everything it had to offer. -->
        <StudioSharedFieldsPanel />
      </div>
    </template>

    <StudioEmptyState
      v-else
      :title="editor.loader.t('ginkoCms.studio.collectionEditor.entryNotFound')"
    />

    <!-- Inside the shell (not template siblings): App.vue wraps pages in
         <Transition mode="out-in">, which needs a single-element root. With a
         fragment root the leave never completes and the next page never
         mounts — navigating out of the editor left a permanently blank
         canvas. Both dialogs portal to <body> when open and render nothing
         inline, so their placement in the canvas slot is inert. -->
    <StudioCheckpointDialog />
    <StudioCreateTranslationDialog
      :open="editor.locales.localeCreationOpen"
      :target-locale="editor.locales.localeCreationTarget"
      :source-locales="editor.locales.existingLocaleOptions"
      :busy="editor.draft.saving"
      @update:open="editor.locales.setLocaleCreationOpen"
      @confirm="editor.locales.confirmLocaleCreation"
    />
    <StudioPublishDialog
      :readiness-detail="workflow.readinessDetail"
      :publish-impact="workflow.publishImpact"
      :publish-impact-requested="workflow.publishSession.impactRequested"
      :publish-review="workflow.publishReview"
    />
  </StudioEntryEditorShell>
</template>

<style scoped>
.studio-entry-locale-panels {
  min-width: 0;
}

.studio-entry-locale-panels > * {
  min-width: 0;
}

/* Container query, not viewport (DESIGN.md principle 8): the panes split as
 * soon as the CANVAS is wide enough — e.g. on a laptop with the details
 * panel collapsed — instead of waiting for a 1600px window. */
@container (min-width: 72rem) {
  .studio-entry-locale-panels--compare {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
