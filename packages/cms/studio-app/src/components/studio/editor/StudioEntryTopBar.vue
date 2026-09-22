<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Flag,
  Globe,
  Loader2,
  MoreHorizontal,
  Save,
  Trash2,
} from '@lucide/vue'
import { resolveEntryTitle } from '@lupinum/ginko-cms-contract/shared/fields/title.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { computed, onMounted, ref, unref } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useCmsConfig } from '../../../composables/useCmsConfig'
import { contentLanguageLabel } from '../../../lib/contentLanguageLabel'
import { draftPreviewPath, mapEntryReadinessDetail } from '../../../lib/publicWorkflow'
import type { StudioEntryReadinessDetail } from './studioWorkflowTypes'

const props = defineProps<{
  mode?: 'edit' | 'new'
  title?: string
  saving?: boolean
  canPublish?: boolean
  readinessDetail?: StudioEntryReadinessDetail | null
  requestReviewPending?: boolean
}>()

const emit = defineEmits<{
  createDraft: []
  createPublish: []
  previewPublishImpact: [locale?: string]
  requestPublishReview: [locale?: string]
}>()

const editor = props.mode === 'new' ? null : useStudioEntryEditorContext()
const cmsConfig = useCmsConfig()
const previewing = ref(false)
const draftPreviewUrl = computed(() =>
  editor
    ? draftPreviewPath({
        previewRoute: cmsConfig.preview?.route,
        collection: editor.loader.collection,
        entryId: editor.loader.entryId,
        locale: editor.loader.currentLocale,
      })
    : null,
)
async function openPreview() {
  if (!editor || !draftPreviewUrl.value || previewing.value) return
  previewing.value = true
  try {
    if (!(await editor.draft.handleSaveDraft())) return
    window.location.assign(draftPreviewUrl.value)
  } finally {
    previewing.value = false
  }
}
const mounted = ref(false)
const showDuplicateDialog = ref(false)

const displayTitle = computed(() => {
  if (props.mode === 'new') return props.title || 'New content'
  if (!editor) return props.title || ''
  return resolveEntryTitle(
    editor.draft.dataFields as JsonMap,
    editor.loader.fields,
    editor.loader.collectionConfig?.settings ?? null,
  )
})

const renderedTitle = computed(() => {
  if (props.mode === 'new') return props.title || 'New content'
  if (!mounted.value) return editor?.loader.t('ginkoCms.common.untitled') ?? 'Untitled'
  return displayTitle.value || editor?.loader.t('ginkoCms.common.untitled') || 'Untitled'
})

const entry = computed(() => {
  return editor?.loader.entry ?? null
})

const currentReadinessView = computed(() =>
  editor
    ? mapEntryReadinessDetail({
        readinessDetail: props.readinessDetail,
        currentLocale: editor.loader.currentLocale,
        t: editor.loader.t,
        publishMode: 'single',
      })
    : null,
)

// The primary action keeps a stable verb (design review S2): a status like
// "Needs work" never masquerades as the CTA. When publishing is blocked the
// button still opens the shared dialog, which explains the blockers and gates
// the confirm — the action is always reachable, the outcome is guarded.
const publishLabel = computed(() => {
  if (!editor) return 'Publish'
  const locale = contentLanguageLabel(
    editor.loader.currentLocale,
    editor.loader.locales,
    editor.loader.dateLocale,
  )
  return editor.loader.t('ginkoCms.studio.collectionEditor.publishLanguage', { language: locale })
})

const publishDisabled = computed(
  () =>
    !editor ||
    !entry.value ||
    editor.draft.saving ||
    editor.publishing.publishSession.readiness.state === 'pending',
)

// Archived entries cannot publish (the banner says so); the primary action
// becomes the banner's own verb, Restore draft.
const isArchived = computed(() => entry.value?.status === 'archived')
const isSingleton = computed(
  () =>
    editor?.loader.collectionConfig?.routing?.singleton === true ||
    editor?.loader.collectionConfig?.singleton === true,
)
const publishedLocaleCount = computed(
  () =>
    editor?.loader.localeVariants.filter((variant) => variant.publishedPath !== null).length ?? 0,
)

const publishAllDisabled = computed(
  () =>
    !editor ||
    !entry.value ||
    editor.draft.saving ||
    editor.publishing.publishSession.readiness.state === 'pending',
)

const canRequestReview = computed(
  () =>
    !!editor &&
    editor.loader.canEditEntries &&
    !editor.loader.canPublishEntries &&
    Boolean(currentReadinessView.value?.canRequestReview),
)

const statusTone = computed<'success' | 'warning' | 'danger' | 'neutral'>(() => {
  if (currentReadinessView.value?.currentLocale?.hasUnpublishedChanges) return 'warning'
  if (entry.value?.status === 'published') return 'success'
  if (entry.value?.status === 'archived') return 'danger'
  if (entry.value?.status === 'draft') return 'warning'
  return 'neutral'
})

const statusLabel = computed(() => {
  const status = entry.value?.status
  if (!status || !editor) return status ?? ''
  if (status !== 'archived' && currentReadinessView.value?.currentLocale?.hasUnpublishedChanges)
    return editor.loader.t('ginkoCms.studio.workflow.states.live_with_changes')
  const key =
    status === 'published'
      ? 'ginkoCms.common.publishedStatus'
      : status === 'archived'
        ? 'ginkoCms.common.archived'
        : status === 'draft'
          ? 'ginkoCms.common.draft'
          : null
  return key ? editor.loader.t(key) : status
})

const saveState = computed(() => (editor ? unref(editor.draft.saveState) : 'saved'))
const saveNeedsRetry = computed(() => saveState.value === 'error')
const saveIndicatorTone = computed(() => {
  if (saveState.value === 'conflict' || saveState.value === 'error') return 'ginko:text-destructive'
  if (saveState.value === 'dirty') return 'ginko:text-muted-foreground'
  return 'ginko:text-muted-foreground'
})
const saveIndicatorLabel = computed(() => {
  if (!editor) return ''
  if (saveState.value === 'saving')
    return editor.loader.t('ginkoCms.studio.collectionEditor.saving')
  if (saveState.value === 'dirty')
    return editor.loader.t('ginkoCms.studio.collectionEditor.saveStateDirty')
  if (saveState.value === 'conflict')
    return editor.loader.t('ginkoCms.studio.collectionEditor.saveStateConflict')
  if (saveNeedsRetry.value)
    return editor.loader.t('ginkoCms.studio.collectionEditor.saveStateOffline')
  return editor.loader.t('ginkoCms.studio.collectionEditor.saveStateSaved')
})

const showEntryActions = computed(
  () =>
    !!editor &&
    (editor.loader.canEditEntries ||
      editor.loader.canPublishEntries ||
      editor.loader.canArchiveEntries ||
      editor.loader.canDeleteEntries),
)

onMounted(() => {
  mounted.value = true
})

function openPublishDialog() {
  if (!editor) return
  if (editor.publishing.handlePublish()) {
    emit('previewPublishImpact', editor.loader.currentLocale)
  }
}

function openPublishAllDialog() {
  if (!editor) return
  if (editor.publishing.handlePublishAll()) {
    emit('previewPublishImpact')
  }
}

function requestReview() {
  if (!editor || !canRequestReview.value) return
  emit('requestPublishReview', editor.loader.currentLocale)
}

async function openDuplicateDialog() {
  if (!editor || isSingleton.value) return
  if (unref(editor.draft.isDirty)) {
    const saved = await editor.draft.handleSaveDraft()
    if (!saved) return
    await editor.loader.refreshEntry()
  }
  showDuplicateDialog.value = true
}
</script>

<template>
  <header
    class="studio-entry-topbar ginko:shrink-0 ginko:border-b ginko:border-border ginko:bg-card"
  >
    <div
      class="studio-page-content studio-entry-topbar__inner ginko:flex ginko:min-h-14 ginko:flex-wrap ginko:items-center ginko:gap-3 ginko:px-6"
    >
      <!-- The shell header breadcrumb already names collection + entry; the
           top bar carries STATE on the left (status pill + save indicator)
           instead of repeating identity (design review S2, principle 2). -->
      <div class="ginko:flex ginko:min-w-0 ginko:flex-1 ginko:items-center ginko:gap-2">
        <template v-if="mode !== 'new' && editor && entry">
          <StudioStatusPill v-if="entry" :label="statusLabel" :tone="statusTone" />
          <span
            class="studio-entry-topbar__save-indicator studio-text-caption ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-1.5"
            :class="saveIndicatorTone"
            :data-save-state="saveState"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <Loader2 v-if="saveState === 'saving'" class="ginko:size-3 ginko:animate-spin" />
            <span
              v-else
              class="ginko:size-1.5 ginko:shrink-0 ginko:rounded-full"
              :class="
                saveState === 'dirty'
                  ? 'ginko:bg-muted-foreground/70'
                  : saveState === 'conflict'
                    ? 'ginko:bg-destructive'
                    : saveNeedsRetry
                      ? 'ginko:bg-warning-fg'
                      : 'ginko:bg-success-fg/70'
              "
            />
            <span class="ginko:truncate">{{ saveIndicatorLabel }}</span>
          </span>
        </template>
      </div>

      <div v-if="mode === 'new'" class="studio-entry-topbar__actions">
        <Button variant="outline" size="sm" :disabled="saving" @click="emit('createDraft')">
          <Save class="ginko:size-4" />
          <span class="studio-entry-topbar__label-full">Create draft</span>
          <span class="studio-entry-topbar__label-short">Draft</span>
        </Button>
      </div>

      <div v-else-if="editor" class="studio-entry-topbar__actions">
        <Button
          v-if="editor.loader.canEditEntries && saveNeedsRetry"
          variant="outline"
          size="sm"
          :disabled="editor.draft.saving"
          @click="editor.draft.handleSaveDraft()"
        >
          <span class="studio-entry-topbar__label-full">
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.retrySave') }}
          </span>
          <span class="studio-entry-topbar__label-short">{{
            editor.loader.t('ginkoCms.studio.collectionEditor.retrySave')
          }}</span>
        </Button>
        <Button
          v-if="draftPreviewUrl"
          variant="outline"
          size="sm"
          :disabled="!entry || editor.loader.pending || previewing || saveState === 'conflict'"
          @click="openPreview"
        >
          <Loader2 v-if="previewing" class="ginko:size-4 ginko:animate-spin" />
          <Eye v-else class="ginko:size-4" />
          {{ editor.loader.t('ginkoCms.studio.collectionEditor.previewWorking') }}
        </Button>
        <Button
          v-if="isArchived && editor.loader.canArchiveEntries"
          size="sm"
          :disabled="editor.draft.saving"
          @click="editor.publishing.handleRestore()"
        >
          <ArchiveRestore class="ginko:size-4" />
          {{ editor.loader.t('ginkoCms.common.restoreDraft') }}
        </Button>
        <div
          v-else-if="editor.loader.canPublishEntries && !isArchived"
          class="studio-entry-topbar__publish-action ginko:inline-flex ginko:min-w-0 ginko:items-stretch ginko:overflow-hidden ginko:rounded-lg"
        >
          <Button
            size="sm"
            class="ginko:min-w-0 ginko:rounded-r-none"
            :disabled="publishDisabled"
            :aria-label="publishLabel"
            @click="openPublishDialog"
          >
            <span class="studio-entry-topbar__label-full ginko:truncate">{{ publishLabel }}</span>
            <span class="studio-entry-topbar__label-short">{{
              editor.loader.t('ginkoCms.common.publish')
            }}</span>
          </Button>
          <DropdownMenu v-if="editor.loader.localeVariants.length > 1">
            <DropdownMenuTrigger as-child>
              <Button
                size="sm"
                class="ginko:rounded-l-none ginko:border-l ginko:border-primary-foreground/20 ginko:px-2"
                :disabled="publishAllDisabled"
                :aria-label="editor.loader.t('ginkoCms.studio.collectionEditor.morePublishOptions')"
              >
                <ChevronDown class="ginko:size-3.5 ginko:opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="ginko:w-48">
              <DropdownMenuItem @click="openPublishAllDialog">
                <Globe class="ginko:mr-2 ginko:size-3.5" />
                {{ editor.loader.t('ginkoCms.common.publishAll') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          v-else-if="canRequestReview"
          variant="outline"
          size="sm"
          :disabled="editor.draft.saving || requestReviewPending"
          @click="requestReview"
        >
          <Loader2 v-if="requestReviewPending" class="ginko:size-4 ginko:animate-spin" />
          <span>{{ editor.loader.t('ginkoCms.studio.collectionEditor.requestReviewAction') }}</span>
        </Button>
        <DropdownMenu v-if="showEntryActions">
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="
                editor.loader.t('ginkoCms.studio.collectionEditor.entryActions', {
                  title: renderedTitle,
                })
              "
            >
              <MoreHorizontal class="ginko:size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="ginko:w-52">
            <DropdownMenuItem
              v-if="editor.loader.canEditEntries"
              :disabled="editor.draft.saving || isSingleton"
              :title="
                isSingleton
                  ? editor.loader.t('ginkoCms.studio.collectionEditor.duplicateSingletonBlocked')
                  : undefined
              "
              @click="openDuplicateDialog"
            >
              <Copy class="ginko:mr-2 ginko:size-3.5" />
              {{ editor.loader.t('ginkoCms.studio.collectionEditor.duplicateAction') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="editor.loader.canEditEntries"
              :disabled="editor.draft.saving || !editor.loader.canEditEntries"
              @click="editor.history.showCheckpointDialog = true"
            >
              <Flag class="ginko:mr-2 ginko:size-3.5" />
              {{ editor.loader.t('ginkoCms.studio.collectionEditor.createCheckpoint') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="entry?.status === 'published' && editor.loader.canPublishEntries"
              :disabled="editor.draft.saving || !editor.loader.canPublishEntries"
              @click="editor.publishing.handleUnpublish()"
            >
              <EyeOff class="ginko:mr-2 ginko:size-3.5" />
              {{ editor.loader.t('ginkoCms.common.unpublish') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="publishedLocaleCount > 1 && editor.loader.canPublishEntries"
              :disabled="editor.draft.saving || !editor.loader.canPublishEntries"
              @click="editor.publishing.handleUnpublishAll()"
            >
              <EyeOff class="ginko:mr-2 ginko:size-3.5" />
              {{ editor.loader.t('ginkoCms.common.unpublishAll') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="entry?.status !== 'archived' && editor.loader.canArchiveEntries"
              :disabled="editor.draft.saving || !editor.loader.canArchiveEntries"
              @click="editor.publishing.handleArchive()"
            >
              <Archive class="ginko:mr-2 ginko:size-3.5" />
              {{ editor.loader.t('ginkoCms.common.archive') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator
              v-if="entry?.status === 'archived' && editor.loader.canDeleteEntries"
            />
            <DropdownMenuItem
              v-if="entry?.status === 'archived' && editor.loader.canDeleteEntries"
              :disabled="editor.draft.saving || !editor.loader.canDeleteEntries"
              class="ginko:text-destructive ginko:focus:text-destructive"
              @click="editor.publishing.handlePermanentDelete()"
            >
              <Trash2 class="ginko:mr-2 ginko:size-3.5" />
              {{ editor.loader.t('ginkoCms.studio.collectionEditor.permanentDeleteAction') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <!-- Recovery keeps both values until the editor chooses a value per field. -->
    <div
      v-if="mode !== 'new' && editor && saveState === 'conflict'"
      class="studio-page-content ginko:px-6 ginko:pb-3"
    >
      <StudioDraftConflicts
        v-if="editor.draft.conflicts.length"
        :conflicts="editor.draft.conflicts"
        :fields="editor.loader.fields"
        @resolve="editor.draft.resolveConflict"
      />
      <StudioNotice
        v-else
        tone="danger"
        :description="editor.loader.t('ginkoCms.studio.collectionEditor.saveConflictNotice')"
      />
    </div>
  </header>
  <StudioDuplicateEntryDialog v-if="mode !== 'new' && editor" v-model:open="showDuplicateDialog" />
</template>

<style scoped>
.studio-entry-topbar,
.studio-entry-topbar__inner {
  box-shadow: none;
}

.studio-entry-topbar__inner > :first-child {
  flex: 1 1 20rem;
}
.studio-entry-topbar__save-indicator {
  flex-shrink: 0;
}

.studio-entry-topbar__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.studio-entry-topbar__label-short {
  display: none;
}

@media (max-width: 639px) {
  .studio-entry-topbar__inner {
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }
  .studio-entry-topbar__inner > :first-child {
    flex-basis: 100%;
  }
  .studio-entry-topbar__actions {
    width: 100%;
  }
  .studio-entry-topbar__label-full {
    display: none;
  }

  .studio-entry-topbar__label-short {
    display: inline;
  }
}
</style>
