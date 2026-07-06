<script setup lang="ts">
import { AlertCircle, CheckCircle2, ExternalLink, Globe, Loader2 } from 'lucide-vue-next'
import { computed } from 'vue'

import { api } from '../../../boundary/api'
import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useCmsStudioQuery } from '../../../composables/useCmsStudioQuery'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'
import { derivePublishConfirmationState } from '../../../lib/publicWorkflow'
import type { StudioPublicVisibilityState, StudioPublishReviewState } from './studioWorkflowTypes'

const props = defineProps<{
  publicVisibility?: StudioPublicVisibilityState
  publishImpactRequested?: boolean
  publishReview?: StudioPublishReviewState
}>()

const editor = useStudioEntryEditorContext()
const advancedEditor = useStudioAdvancedEditor()

const diffArgs = computed(() => {
  if (!editor.publishing.showPublishDialog) return null
  return { entryId: editor.loader.entryId }
})
const diffQuery = useCmsStudioQuery(api.ginkoCms.editor.getDraftVsPublishedDiff, diffArgs)
const diff = computed(() => diffQuery.data?.value ?? null)
const entry = computed(() => {
  const value = editor.loader.entry
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value
  }
  return value
})

const isFirstPublish = computed(() => entry.value?.status === 'draft' && !entry.value?.publishedAt)

const publishLabel = computed(() => {
  if (editor.publishing.publishMode === 'all') {
    return editor.loader.t('ginkoCms.common.publishAll')
  }
  const locale = editor.loader.currentLocale
  return editor.loader.locales.length > 1
    ? `${editor.loader.t('ginkoCms.common.publish')} (${locale.toUpperCase()})`
    : editor.loader.t('ginkoCms.common.publish')
})

const publishConfirmation = computed(() =>
  derivePublishConfirmationState({
    readinessState: editor.publishing.publishReadiness.state,
    confirmationToken: editor.publishing.publishReadiness.confirmationToken,
    confirmationExpiresAt: editor.publishing.publishReadiness.confirmationExpiresAt,
  }),
)

const publishScopeLabel = computed(() =>
  editor.publishing.publishMode === 'all'
    ? `All locales (${editor.loader.localeVariants.map((variant: { locale: string }) => variant.locale.toUpperCase()).join(', ')})`
    : `Current locale (${editor.loader.currentLocale.toUpperCase()})`,
)

const safePublicVisibility = computed<StudioPublicVisibilityState>(
  () =>
    props.publicVisibility ?? {
      error: null,
      errorMessage: '',
      globalDiagnostics: [],
      hiddenGlobalDiagnosticCount: 0,
      isRouteBacked: false,
      localeRows: [],
      pending: false,
      publishedLocales: [],
      status: '',
    },
)

const safePublishReview = computed<StudioPublishReviewState>(
  () =>
    props.publishReview ?? {
      blocked: false,
      failed: false,
      label: '',
      locales: [],
      message: '',
      previewHash: null,
      stale: false,
      state: '',
    },
)

const currentRoute = computed(
  () =>
    safePublicVisibility.value.localeRows.find((row) => row.current) ??
    safePublicVisibility.value.localeRows.find(
      (row) => row.locale === editor.loader.currentLocale,
    ) ??
    null,
)

const publicUrl = computed(
  () =>
    currentRoute.value?.href ||
    currentRoute.value?.publishedPath ||
    currentRoute.value?.path ||
    editor.draft?.computedPath ||
    '',
)

const issueLabel = computed(() => {
  if (editor.publishing.publishReadiness.state === 'blocked') {
    return editor.publishing.publishReadiness.message || 'Publishing is blocked.'
  }
  if (safePublishReview.value.blocked) return safePublishReview.value.message
  return 'No blocking issues'
})

const changedFields = computed(() => diff.value?.changes ?? [])
const showAdvancedDetails = computed(
  () =>
    advancedEditor.value ||
    editor.publishing.publishReadiness.state === 'blocked' ||
    editor.publishing.publishReadiness.state === 'stale' ||
    editor.publishing.publishReadiness.state === 'failed',
)
</script>

<template>
  <Dialog
    :open="editor.publishing.showPublishDialog"
    @update:open="editor.publishing.showPublishDialog = $event"
  >
    <DialogContent class="ginko:sm:max-w-lg">
      <DialogHeader>
        <DialogTitle> {{ publishLabel }}? </DialogTitle>
        <DialogDescription>
          Review readiness, website changes, affected locales, and public-output refresh before this
          goes live.
        </DialogDescription>
      </DialogHeader>

      <div class="ginko:space-y-4">
        <div
          class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3"
        >
          <div class="ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground">
            Published website content
          </div>
          <div class="ginko:mt-1 ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <div class="ginko:min-w-0 ginko:truncate ginko:font-mono ginko:text-sm">
              {{ publicUrl || 'No public URL yet' }}
            </div>
            <Button v-if="publicUrl" variant="ghost" size="icon-sm" as-child>
              <a :href="publicUrl" target="_blank" rel="noreferrer" aria-label="Open public URL">
                <ExternalLink class="ginko:size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3 ginko:space-y-2">
          <div v-if="isFirstPublish" class="ginko:text-xs ginko:text-muted-foreground">
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.publishDialogFirstPublish') }}
          </div>
          <div v-else-if="changedFields.length > 0" class="ginko:space-y-1.5">
            <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
              {{
                editor.loader.t('ginkoCms.studio.collectionEditor.publishDialogChangedFields', {
                  count: changedFields.length,
                })
              }}
            </div>
            <div class="ginko:flex ginko:flex-wrap ginko:gap-1">
              <span
                v-for="change in changedFields.slice(0, 8)"
                :key="change.field"
                class="ginko:text-xs ginko:font-mono ginko:bg-muted ginko:px-1.5 ginko:py-0.5 ginko:rounded"
                >{{ change.field }}</span
              >
              <span
                v-if="changedFields.length > 8"
                class="ginko:text-xs ginko:text-muted-foreground ginko:px-1"
                >+{{ changedFields.length - 8 }}
                {{
                  editor.loader.t('ginkoCms.studio.collectionEditor.publishDialogMoreFields')
                }}</span
              >
            </div>
          </div>
          <div
            v-else-if="diff && diff.changes.length === 0"
            class="ginko:text-xs ginko:text-muted-foreground"
          >
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.publishDialogNoChanges') }}
          </div>
          <div
            v-else
            class="ginko:flex ginko:items-center ginko:gap-1.5 ginko:text-xs ginko:text-muted-foreground"
          >
            <Loader2 class="ginko:size-3 ginko:animate-spin" />
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.loading') }}
          </div>
        </div>

        <div
          class="ginko:flex ginko:items-start ginko:gap-2 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3 ginko:text-sm"
          :class="
            editor.publishing.publishReadiness.state === 'blocked'
              ? 'ginko:border-destructive/40 ginko:text-destructive-fg'
              : 'ginko:border-success/40 ginko:text-success-fg'
          "
        >
          <AlertCircle
            v-if="editor.publishing.publishReadiness.state === 'blocked'"
            class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
          />
          <CheckCircle2 v-else class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0" />
          <div>
            <div class="ginko:font-medium">{{ issueLabel }}</div>
            <div
              v-if="publishConfirmation.disabledReason"
              class="ginko:mt-1 ginko:text-xs"
              :class="
                editor.publishing.publishReadiness.state === 'blocked'
                  ? 'ginko:text-destructive'
                  : 'ginko:text-muted-foreground'
              "
            >
              {{ publishConfirmation.disabledReason }}
            </div>
          </div>
        </div>

        <div class="ginko:space-y-2">
          <Label for="publish-message" class="ginko:text-xs ginko:text-muted-foreground">
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.publishMessageLabel') }}
          </Label>
          <Textarea
            id="publish-message"
            v-model="editor.publishing.publishMessage"
            :placeholder="
              editor.loader.t('ginkoCms.studio.collectionEditor.publishMessagePlaceholder')
            "
            class="ginko:min-h-[60px] ginko:text-sm"
          />
        </div>

        <div
          v-if="showAdvancedDetails"
          class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3 ginko:text-xs"
        >
          <div class="ginko:font-medium ginko:text-foreground">Developer diagnostics</div>
          <dl class="ginko:mt-3 ginko:grid ginko:grid-cols-2 ginko:gap-2">
            <div class="ginko:rounded ginko:bg-muted/40 ginko:px-2 ginko:py-1.5">
              <dt class="ginko:text-xs ginko:uppercase ginko:text-muted-foreground">Scope</dt>
              <dd class="ginko:mt-0.5 ginko:text-foreground">{{ publishScopeLabel }}</dd>
            </div>
            <div class="ginko:rounded ginko:bg-muted/40 ginko:px-2 ginko:py-1.5">
              <dt class="ginko:text-xs ginko:uppercase ginko:text-muted-foreground">
                Draft version
              </dt>
              <dd class="ginko:mt-0.5 ginko:font-mono ginko:text-foreground">
                {{ entry?.draftVersion ?? 'loading' }}
              </dd>
            </div>
          </dl>
          <div
            v-if="editor.publishing.publishReadiness.previewHash"
            class="ginko:mt-2 ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
          >
            Preview {{ editor.publishing.publishReadiness.previewHash.slice(0, 24) }}
          </div>
          <div v-if="publishImpactRequested" class="ginko:mt-2 ginko:text-muted-foreground">
            {{ safePublishReview.message }}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="editor.publishing.showPublishDialog = false">
          {{ editor.loader.t('ginkoCms.studio.confirmDialog.cancel') }}
        </Button>
        <Button
          :disabled="!publishConfirmation.canConfirm"
          @click="editor.publishing.confirmPublish()"
        >
          <Globe class="ginko:size-3.5 ginko:mr-1.5" />
          {{ publishLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
