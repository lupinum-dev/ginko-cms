<script setup lang="ts">
import { AlertCircle, CheckCircle2, ExternalLink, Globe } from '@lucide/vue'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'
import {
  derivePublishConfirmationState,
  mapEntryReadinessDetail,
  readinessActionLabel,
  readinessIssueMessage,
} from '../../../lib/publicWorkflow'
import type {
  StudioEntryReadinessDetail,
  StudioPublishImpactLocale,
  StudioPublishImpactState,
  StudioPublishReviewState,
} from './studioWorkflowTypes'

const props = defineProps<{
  readinessDetail?: StudioEntryReadinessDetail | null
  publishImpact?: StudioPublishImpactState
  publishImpactRequested?: boolean
  publishReview?: StudioPublishReviewState
}>()

const editor = useStudioEntryEditorContext()
const advancedEditor = useStudioAdvancedEditor()

const entry = computed(() => {
  const value = editor.loader.entry
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value
  }
  return value
})

const isFirstPublish = computed(() => entry.value?.status === 'draft' && !entry.value?.publishedAt)
const publishImpactLocales = computed(() => props.publishImpact?.locales ?? [])
const publishImpactReady = computed(
  () =>
    Boolean(props.publishImpactRequested) &&
    props.publishImpact?.state === 'ready' &&
    publishImpactLocales.value.length > 0,
)

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
    t: editor.loader.t,
    confirmationToken: editor.publishing.publishReadiness.confirmationToken,
    confirmationExpiresAt: editor.publishing.publishReadiness.confirmationExpiresAt,
  }),
)

const publishScopeLabel = computed(() =>
  editor.publishing.publishMode === 'all'
    ? collectionEditorT('publishDialogAllLanguages', {
        locales: editor.loader.localeVariants
          .map((variant: { locale: string }) => variant.locale.toUpperCase())
          .join(', '),
      })
    : collectionEditorT('publishDialogCurrentLanguage', {
        locale: editor.loader.currentLocale.toUpperCase(),
      }),
)

const readinessView = computed(() =>
  mapEntryReadinessDetail({
    readinessDetail: props.readinessDetail,
    currentLocale: editor.loader.currentLocale,
    t: editor.loader.t,
    publishMode: editor.publishing.publishMode,
  }),
)

const publicUrl = computed(
  () => readinessView.value.publicUrl || readinessView.value.draftUrl || '',
)

const issueLabel = computed(() => {
  const blocker = readinessView.value.blockers[0]
  if (blocker) return readinessIssueMessage(editor.loader.t, blocker)
  if (editor.publishing.publishReadiness.state === 'blocked') {
    return editor.publishing.publishReadiness.message || 'Publishing is blocked.'
  }
  if (readinessView.value.canPublish) return 'No blocking issues'
  return readinessView.value.nextAction
    ? readinessActionLabel(editor.loader.t, readinessView.value.nextAction.kind)
    : 'No blocking issues'
})

const showAdvancedDetails = computed(() => advancedEditor.value)

function collectionEditorT(key: string, params?: Record<string, unknown>): string {
  return editor.loader.t(`ginkoCms.studio.collectionEditor.${key}`, params)
}

function displayAddress(value: string | null | undefined, fallbackKey: string): string {
  const trimmed = value?.trim()
  return trimmed || collectionEditorT(fallbackKey)
}

function displayInclusion(value: boolean): string {
  return collectionEditorT(value ? 'publishDialogIncluded' : 'publishDialogExcluded')
}

function changeKindLabel(change: StudioPublishImpactLocale['changes'][number]): string {
  if (change.kind === 'route' || change.kind === 'redirect') {
    return collectionEditorT('publishDialogPageAddress')
  }
  if (change.kind === 'seo') return collectionEditorT('publishDialogSearchPreview')
  if (change.kind === 'sitemap' || change.kind === 'search' || change.kind === 'nav') {
    return collectionEditorT('publishDialogWebsiteVisibility')
  }
  return collectionEditorT('publishDialogWebsiteContent')
}

const changeKindSummary = computed(() => {
  const counts = new Map<string, number>()
  for (const localeImpact of publishImpactLocales.value) {
    for (const change of localeImpact.changes) {
      const label = changeKindLabel(change)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries()).map(([label, count]) => ({
    key: label,
    label,
    count,
  }))
})

const publishImpactMessage = computed(
  () =>
    props.publishImpact?.message ||
    props.publishReview?.message ||
    collectionEditorT('publishDialogPreviewRequired'),
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
          Review what will change on the website before this goes live.
        </DialogDescription>
      </DialogHeader>

      <div class="ginko:space-y-4">
        <div
          class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3"
        >
          <div class="ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground">
            {{ collectionEditorT('publishDialogLivePage') }}
          </div>
          <div class="ginko:mt-1 ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <div class="ginko:min-w-0 ginko:truncate ginko:font-mono ginko:text-sm">
              {{ publicUrl || collectionEditorT('publishDialogNoLiveUrl') }}
            </div>
            <Button v-if="publicUrl" variant="ghost" size="icon-sm" as-child>
              <a :href="publicUrl" target="_blank" rel="noreferrer" aria-label="Open live URL">
                <ExternalLink class="ginko:size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div
          class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3"
        >
          <div class="ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground">
            {{ collectionEditorT('publishDialogLanguages') }}
          </div>
          <div class="ginko:mt-1 ginko:text-sm">{{ publishScopeLabel }}</div>
        </div>

        <div class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3 ginko:space-y-3">
          <div class="ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground">
            {{ collectionEditorT('publishDialogWebsiteChanges') }}
          </div>
          <div v-if="publishImpactReady" class="ginko:space-y-3">
            <div
              class="ginko:flex ginko:items-start ginko:gap-2 ginko:text-xs ginko:text-muted-foreground"
            >
              <CheckCircle2
                class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0 ginko:text-success-fg"
              />
              <span>
                {{
                  isFirstPublish
                    ? editor.loader.t('ginkoCms.studio.collectionEditor.publishDialogFirstPublish')
                    : collectionEditorT('publishDialogPreviewReviewed')
                }}
              </span>
            </div>

            <div
              class="ginko:divide-y ginko:divide-border/60 ginko:border-y ginko:border-border/60"
            >
              <div
                v-for="localeImpact in publishImpactLocales"
                :key="`publish-dialog-impact:${localeImpact.locale}`"
                class="ginko:grid ginko:gap-2 ginko:py-2 ginko:text-xs"
              >
                <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
                  <Badge variant="outline" class="ginko:font-mono">
                    {{ localeImpact.locale.toUpperCase() }}
                  </Badge>
                  <span class="ginko:font-medium ginko:text-foreground">
                    {{ localeImpact.label }}
                  </span>
                </div>
                <div
                  class="ginko:grid ginko:gap-2 ginko:text-muted-foreground ginko:sm:grid-cols-2"
                >
                  <div class="ginko:min-w-0">
                    <div class="ginko:font-medium">
                      {{ collectionEditorT('publishDialogCurrentLivePage') }}
                    </div>
                    <div class="ginko:mt-0.5 ginko:truncate ginko:font-mono">
                      {{
                        displayAddress(
                          localeImpact.currentHref || localeImpact.currentPath,
                          'publishDialogNotLiveYet',
                        )
                      }}
                    </div>
                  </div>
                  <div class="ginko:min-w-0">
                    <div class="ginko:font-medium">
                      {{ collectionEditorT('publishDialogAfterPublish') }}
                    </div>
                    <div class="ginko:mt-0.5 ginko:truncate ginko:font-mono ginko:text-foreground">
                      {{
                        displayAddress(
                          localeImpact.nextHref || localeImpact.nextPath,
                          'publishDialogNoPageUrlPlanned',
                        )
                      }}
                    </div>
                  </div>
                </div>
                <div class="ginko:flex ginko:flex-wrap ginko:gap-1">
                  <Badge variant="outline" class="ginko:text-xs">
                    {{ collectionEditorT('publishDialogSitemap') }}
                    {{ displayInclusion(localeImpact.sitemap.after) }}
                  </Badge>
                  <Badge variant="outline" class="ginko:text-xs">
                    {{ collectionEditorT('publishDialogSearch') }}
                    {{ displayInclusion(localeImpact.search.after) }}
                  </Badge>
                  <Badge variant="outline" class="ginko:text-xs">
                    {{ collectionEditorT('publishDialogNavigation') }}
                    {{ displayInclusion(localeImpact.nav.after) }}
                  </Badge>
                </div>
              </div>
            </div>

            <div v-if="changeKindSummary.length" class="ginko:flex ginko:flex-wrap ginko:gap-1">
              <Badge
                v-for="summary in changeKindSummary"
                :key="summary.key"
                variant="outline"
                class="ginko:text-xs"
              >
                {{ summary.label }} {{ summary.count }}
              </Badge>
            </div>
          </div>
          <div v-else-if="isFirstPublish" class="ginko:text-xs ginko:text-muted-foreground">
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.publishDialogFirstPublish') }}
          </div>
          <div v-else class="ginko:text-xs ginko:text-muted-foreground">
            {{ publishImpactMessage }}
          </div>
        </div>

        <div
          class="ginko:flex ginko:items-start ginko:gap-2 ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3 ginko:text-sm"
          :class="
            readinessView.blockers.length ||
            !readinessView.canPublish ||
            editor.publishing.publishReadiness.state === 'blocked'
              ? 'ginko:border-destructive/40 ginko:text-destructive-fg'
              : 'ginko:border-success/40 ginko:text-success-fg'
          "
        >
          <AlertCircle
            v-if="
              readinessView.blockers.length ||
              !readinessView.canPublish ||
              editor.publishing.publishReadiness.state === 'blocked'
            "
            class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
          />
          <CheckCircle2 v-else class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0" />
          <div>
            <div
              class="ginko:mb-1 ginko:text-xs ginko:font-medium ginko:uppercase"
              :class="
                readinessView.blockers.length ||
                !readinessView.canPublish ||
                editor.publishing.publishReadiness.state === 'blocked'
                  ? 'ginko:text-destructive'
                  : 'ginko:text-success-fg'
              "
            >
              {{
                readinessView.blockers.length ||
                !readinessView.canPublish ||
                editor.publishing.publishReadiness.state === 'blocked'
                  ? 'Issues blocking publish'
                  : 'Ready to publish'
              }}
            </div>
            <div class="ginko:font-medium">{{ issueLabel }}</div>
            <div
              v-if="publishConfirmation.disabledReason"
              class="ginko:mt-1 ginko:text-xs"
              :class="
                readinessView.blockers.length ||
                !readinessView.canPublish ||
                editor.publishing.publishReadiness.state === 'blocked'
                  ? 'ginko:text-destructive'
                  : 'ginko:text-muted-foreground'
              "
            >
              {{ publishConfirmation.disabledReason }}
            </div>
          </div>
        </div>

        <div
          v-if="readinessView.warnings.length"
          class="ginko:rounded-lg ginko:border ginko:border-warning/30 ginko:bg-warning/10 ginko:p-3 ginko:text-sm ginko:text-warning-fg"
        >
          <div class="ginko:text-xs ginko:font-medium ginko:uppercase">Warnings</div>
          <div class="ginko:mt-1">
            {{ readinessIssueMessage(editor.loader.t, readinessView.warnings[0]) }}
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
          <div class="ginko:font-medium ginko:text-foreground">
            {{ collectionEditorT('publishDialogReceipt') }}
          </div>
          <dl class="ginko:mt-3 ginko:grid ginko:grid-cols-2 ginko:gap-2">
            <div class="ginko:rounded ginko:bg-muted/40 ginko:px-2 ginko:py-1.5">
              <dt class="ginko:text-xs ginko:uppercase ginko:text-muted-foreground">
                {{ collectionEditorT('publishDialogScope') }}
              </dt>
              <dd class="ginko:mt-0.5 ginko:text-foreground">{{ publishScopeLabel }}</dd>
            </div>
            <div class="ginko:rounded ginko:bg-muted/40 ginko:px-2 ginko:py-1.5">
              <dt class="ginko:text-xs ginko:uppercase ginko:text-muted-foreground">
                {{ collectionEditorT('publishDialogSavedDraftState') }}
              </dt>
              <dd class="ginko:mt-0.5 ginko:font-mono ginko:text-foreground">
                {{ entry?.draftVersion ?? 'loading' }}
              </dd>
            </div>
          </dl>
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
