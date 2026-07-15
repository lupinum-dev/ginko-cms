<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  EyeOff,
  Flag,
  Globe,
  Loader2,
  MoreHorizontal,
  Save,
} from '@lucide/vue'
import { resolveEntryTitle } from '@lupinum/ginko-cms-contract/shared/fields/title.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { computed, onMounted, ref, unref } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { mapEntryReadinessDetail } from '../../../lib/publicWorkflow'
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
const mounted = ref(false)

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

const publishAllReadinessView = computed(() =>
  editor
    ? mapEntryReadinessDetail({
        readinessDetail: props.readinessDetail,
        currentLocale: editor.loader.currentLocale,
        t: editor.loader.t,
        publishMode: 'all',
      })
    : null,
)

// The primary action keeps a stable verb (design review S2): a status like
// "Needs work" never masquerades as the CTA. When publishing is blocked the
// button still opens the shared dialog, which explains the blockers and gates
// the confirm — the action is always reachable, the outcome is guarded.
const publishLabel = computed(() => {
  if (!editor) return 'Publish'
  const locale = editor.loader.currentLocale.toUpperCase()
  return `${editor.loader.t('ginkoCms.common.publish')} ${locale}`
})

const publishDisabled = computed(
  () =>
    !editor || editor.draft.saving || editor.publishing.publishReadiness.state === 'pending',
)

const publishAllDisabled = computed(
  () =>
    !editor || editor.draft.saving || editor.publishing.publishReadiness.state === 'pending',
)

const canRequestReview = computed(
  () =>
    !!editor &&
    editor.loader.canEditEntries &&
    !editor.loader.canPublishEntries &&
    Boolean(currentReadinessView.value?.canRequestReview),
)

const statusTone = computed<'success' | 'warning' | 'danger' | 'neutral'>(() => {
  if (entry.value?.status === 'published') return 'success'
  if (entry.value?.status === 'archived') return 'danger'
  if (entry.value?.status === 'draft') return 'warning'
  return 'neutral'
})

const statusLabel = computed(() => {
  const status = entry.value?.status
  if (!status || !editor) return status ?? ''
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
const lastSaved = computed(() => (editor ? unref(editor.draft.lastSaved) : null))
const saveIndicatorTone = computed(() => {
  if (saveState.value === 'conflict') return 'ginko:text-destructive'
  if (saveState.value === 'offline-pending') return 'ginko:text-warning-fg'
  if (saveState.value === 'dirty') return 'ginko:text-muted-foreground'
  return 'ginko:text-muted-foreground/80'
})
const saveIndicatorLabel = computed(() => {
  if (!editor) return ''
  if (saveState.value === 'saving')
    return editor.loader.t('ginkoCms.studio.collectionEditor.saving')
  if (saveState.value === 'dirty')
    return editor.loader.t('ginkoCms.studio.collectionEditor.saveStateDirty')
  if (saveState.value === 'conflict')
    return editor.loader.t('ginkoCms.studio.collectionEditor.saveStateConflict')
  if (saveState.value === 'offline-pending')
    return editor.loader.t('ginkoCms.studio.collectionEditor.saveStateOffline')
  if (!lastSaved.value) return editor.loader.t('ginkoCms.studio.collectionEditor.saveStateSaved')
  const formatted = new Intl.DateTimeFormat(editor.loader.dateLocale || undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(lastSaved.value)
  return editor.loader.t('ginkoCms.studio.collectionEditor.saveStateSavedAt', {
    time: formatted,
  })
})

const showEntryActions = computed(
  () =>
    !!editor &&
    (editor.loader.canEditEntries ||
      editor.loader.canPublishEntries ||
      editor.loader.canArchiveEntries),
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
</script>

<template>
  <header
    class="studio-entry-topbar ginko:shrink-0 ginko:border-b ginko:border-border ginko:bg-card"
  >
    <div
      class="studio-page-content studio-entry-topbar__inner ginko:flex ginko:h-14 ginko:items-center ginko:gap-3 ginko:px-6"
    >
      <!-- The shell header breadcrumb already names collection + entry; the
           top bar carries STATE on the left (status pill + save indicator)
           instead of repeating identity (design review S2, principle 2). -->
      <div class="ginko:flex ginko:min-w-0 ginko:flex-1 ginko:items-center ginko:gap-2">
        <template v-if="mode !== 'new' && editor">
          <StudioStatusPill v-if="entry" :label="statusLabel" :tone="statusTone" />
          <span
            class="studio-entry-topbar__save-indicator studio-text-caption ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-1.5"
            :class="saveIndicatorTone"
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
                    : saveState === 'offline-pending'
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
          v-if="editor.loader.canEditEntries"
          variant="outline"
          size="sm"
          :disabled="editor.draft.saving"
          @click="editor.draft.handleSaveDraft()"
        >
          <span class="studio-entry-topbar__label-full">
            {{ editor.loader.t('ginkoCms.common.saveDraft') }}
          </span>
          <span class="studio-entry-topbar__label-short">Save</span>
        </Button>
        <div
          v-if="editor.loader.canPublishEntries"
          class="studio-entry-topbar__publish-action ginko:inline-flex ginko:min-w-0 ginko:items-stretch ginko:overflow-hidden ginko:rounded-lg"
        >
          <Button
            size="sm"
            class="ginko:min-w-0 ginko:rounded-r-none"
            :disabled="publishDisabled"
            @click="openPublishDialog"
          >
            <span class="ginko:truncate">{{ publishLabel }}</span>
          </Button>
          <DropdownMenu v-if="editor.loader.localeVariants.length > 1">
            <DropdownMenuTrigger as-child>
              <Button
                size="sm"
                class="ginko:rounded-l-none ginko:border-l ginko:border-primary-foreground/20 ginko:px-2"
                :disabled="publishAllDisabled"
                aria-label="More publish options"
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
          <span class="studio-entry-topbar__label-full">Request review</span>
          <span class="studio-entry-topbar__label-short">Review</span>
        </Button>
        <DropdownMenu v-if="showEntryActions">
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Entry actions for ${renderedTitle}`"
            >
              <MoreHorizontal class="ginko:size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="ginko:w-52">
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
              v-if="entry?.status !== 'archived' && editor.loader.canArchiveEntries"
              :disabled="editor.draft.saving || !editor.loader.canArchiveEntries"
              @click="editor.publishing.handleArchive()"
            >
              <Archive class="ginko:mr-2 ginko:size-3.5" />
              {{ editor.loader.t('ginkoCms.common.archive') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="entry?.status === 'archived' && editor.loader.canArchiveEntries"
              :disabled="editor.draft.saving || !editor.loader.canArchiveEntries"
              @click="editor.publishing.handleRestore()"
            >
              <ArchiveRestore class="ginko:mr-2 ginko:size-3.5" />
              {{ editor.loader.t('ginkoCms.common.restoreDraft') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </header>
</template>

<style scoped>
.studio-entry-topbar,
.studio-entry-topbar__inner {
  box-shadow: none;
}

.studio-entry-topbar__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
}

.studio-entry-topbar__label-short {
  display: none;
}

@media (max-width: 639px) {
  .studio-entry-topbar__label-full {
    display: none;
  }

  .studio-entry-topbar__label-short {
    display: inline;
  }
}
</style>
