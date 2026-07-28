<script setup lang="ts">
import { AlertCircle, CheckCircle2, ExternalLink, Eye, Globe } from '@lucide/vue'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useCmsConfig } from '../../../composables/useCmsConfig'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'
import {
  derivePublishConfirmationState,
  draftPreviewPath,
  mapEntryReadinessDetail,
  readinessActionLabel,
  readinessIssueMessage,
} from '../../../lib/publicWorkflow'
import { formatBoundedCount } from '../../../lib/websiteChangePresenter'
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
const cmsConfig = useCmsConfig()

const entry = computed(() => editor.loader.entry)

// EDT-10: "Preview reviewed" may only be claimed when the editor actually
// opened the rendered draft preview for the current draft state. Optional
// chaining: dialog tests mount with a partial editor context.
const draftPreviewOpened = computed(() => editor.publishing.publishSession.draftPreviewOpened)
const draftPreviewUrl = computed(() =>
  draftPreviewPath({
    previewRoute: cmsConfig.preview?.route,
    collection: editor.loader.collection,
    entryId: editor.loader.entryId,
    locale: editor.loader.currentLocale,
  }),
)

const isFirstPublish = computed(() => entry.value?.status === 'draft' && !entry.value?.publishedAt)
const publishImpactLocales = computed(() => props.publishImpact?.locales ?? [])
const publishImpactReady = computed(
  () =>
    Boolean(props.publishImpactRequested) &&
    props.publishImpact?.state === 'ready' &&
    publishImpactLocales.value.length > 0,
)

const publishLabel = computed(() => {
  if (editor.publishing.publishSession.mode === 'all') {
    return editor.loader.t('ginkoCms.common.publishAll')
  }
  const locale = editor.loader.currentLocale
  return editor.loader.locales.length > 1
    ? `${editor.loader.t('ginkoCms.common.publish')} (${locale.toUpperCase()})`
    : editor.loader.t('ginkoCms.common.publish')
})

const publishConfirmation = computed(() =>
  derivePublishConfirmationState({
    readinessState: editor.publishing.publishSession.readiness.state,
    t: editor.loader.t,
    confirmationToken: editor.publishing.publishSession.readiness.confirmationToken,
    confirmationExpiresAt: editor.publishing.publishSession.readiness.confirmationExpiresAt,
  }),
)

const publishScopeLabel = computed(() =>
  editor.publishing.publishSession.mode === 'all'
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
    publishMode: editor.publishing.publishSession.mode,
  }),
)

const publicUrl = computed(
  () => readinessView.value.publicUrl || readinessView.value.draftUrl || '',
)

const issueLabel = computed(() => {
  const blocker = readinessView.value.blockers[0]
  if (blocker) return readinessIssueMessage(editor.loader.t, blocker)
  if (editor.publishing.publishSession.readiness.state === 'blocked') {
    return (
      editor.publishing.publishSession.readiness.message ||
      collectionEditorT('publishDialogBlocked')
    )
  }
  if (readinessView.value.canPublish) return collectionEditorT('publishDialogNoBlockingIssues')
  return readinessView.value.nextAction
    ? readinessActionLabel(editor.loader.t, readinessView.value.nextAction.kind)
    : collectionEditorT('publishDialogNoBlockingIssues')
})

const showAdvancedDetails = computed(() => advancedEditor.value)

const isBlocked = computed(
  () =>
    readinessView.value.blockers.length > 0 ||
    !readinessView.value.canPublish ||
    editor.publishing.publishSession.readiness.state === 'blocked',
)

// Preview preparation failed (e.g. the entry changed in another session). The
// dialog must never claim "Ready to publish" next to a failed preview.
const previewFailed = computed(() => editor.publishing.publishSession.readiness.state === 'failed')
const previewConcurrentEdit = computed(
  () => previewFailed.value && editor.publishing.publishSession.concurrentEdit,
)
const previewFailureMessage = computed(
  () =>
    editor.publishing.publishSession.readiness.message ||
    editor.loader.t('ginkoCms.studio.workflow.preview.failed'),
)

function reloadLatestDraft() {
  void editor.workflow?.reloadLatestDraftAndPreview()
}

const hasMultipleLocales = computed(() => editor.loader.locales.length > 1)

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
  const counts = new Map<string, { count: number; isLowerBound: boolean }>()
  const addCount = (label: string, count: number, isLowerBound = false) => {
    const current = counts.get(label)
    counts.set(label, {
      count: (current?.count ?? 0) + count,
      isLowerBound: Boolean(current?.isLowerBound || isLowerBound),
    })
  }
  for (const localeImpact of publishImpactLocales.value) {
    for (const change of localeImpact.changes.filter((item) => item.scope !== 'descendant')) {
      addCount(changeKindLabel(change), 1)
    }
    if ((localeImpact.routeImpact?.listed ?? 0) > 0) {
      addCount(
        collectionEditorT('publishDialogPageAddress'),
        localeImpact.routeImpact?.listed ?? 0,
        localeImpact.routeImpact?.total === null,
      )
    }
  }
  return Array.from(counts.entries()).map(([label, value]) => ({
    key: label,
    label,
    ...value,
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
    :open="editor.publishing.publishSession.open"
    @update:open="editor.publishing.publishSession.open = $event"
  >
    <DialogContent class="ginko:sm:max-w-lg">
      <DialogHeader>
        <DialogTitle> {{ publishLabel }}? </DialogTitle>
        <DialogDescription>
          {{ collectionEditorT('publishDialogDescription') }}
        </DialogDescription>
      </DialogHeader>

      <div class="ginko:space-y-4">
        <!-- Blockers lead (design review S2): the first thing the dialog answers
             is "can this go live, and if not, why". -->
        <div
          class="ginko:flex ginko:items-start ginko:gap-2 ginko:rounded-lg ginko:border ginko:p-3 ginko:text-sm"
          :class="
            isBlocked || previewFailed
              ? 'ginko:border-destructive/40 ginko:text-destructive-fg'
              : 'ginko:border-success/40 ginko:text-success-fg'
          "
        >
          <AlertCircle
            v-if="isBlocked || previewFailed"
            class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
          />
          <CheckCircle2 v-else class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0" />
          <div class="ginko:min-w-0">
            <div
              class="ginko:mb-1 ginko:text-xs ginko:font-medium ginko:uppercase"
              :class="
                isBlocked || previewFailed ? 'ginko:text-destructive' : 'ginko:text-success-fg'
              "
            >
              {{
                isBlocked
                  ? collectionEditorT('publishDialogIssuesBlocking')
                  : previewFailed
                    ? collectionEditorT('publishDialogPreviewFailed')
                    : collectionEditorT('publishDialogReadyToPublish')
              }}
            </div>
            <div class="ginko:font-medium">
              {{ !isBlocked && previewFailed ? previewFailureMessage : issueLabel }}
            </div>
            <div
              v-if="publishConfirmation.disabledReason && !previewFailed"
              class="ginko:mt-1 ginko:text-xs"
              :class="isBlocked ? 'ginko:text-destructive' : 'ginko:text-muted-foreground'"
            >
              {{ publishConfirmation.disabledReason }}
            </div>
            <!-- Same recovery the top bar's conflict notice offers: reload the
                 other session's draft, then re-run the preview. -->
            <Button
              v-if="previewConcurrentEdit"
              variant="outline"
              size="sm"
              class="ginko:mt-2"
              @click="reloadLatestDraft"
            >
              {{ collectionEditorT('saveConflictReload') }}
            </Button>
          </div>
        </div>

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
              <a
                :href="publicUrl"
                target="_blank"
                rel="noreferrer"
                :aria-label="collectionEditorT('publishDialogOpenLiveUrl')"
              >
                <ExternalLink class="ginko:size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div
          v-if="hasMultipleLocales"
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
              v-if="isFirstPublish || draftPreviewOpened"
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
            <!-- Honest state (EDT-10): the rendered draft preview was not
                 opened, so no "reviewed" claim — offer the preview instead. -->
            <div
              v-else
              class="ginko:flex ginko:items-start ginko:gap-2 ginko:text-xs ginko:text-muted-foreground"
            >
              <Eye class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0" />
              <span>
                {{ collectionEditorT('publishDialogPreviewNotOpened') }}
                <a
                  v-if="draftPreviewUrl"
                  :href="draftPreviewUrl"
                  target="_blank"
                  rel="noreferrer"
                  class="ginko:underline ginko:underline-offset-2 ginko:text-foreground"
                  @click="editor.workflow?.markDraftPreviewOpened()"
                >
                  {{ collectionEditorT('publishImpactOpenDraftPreview') }}
                </a>
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
                  class="ginko:grid ginko:gap-2 ginko:text-muted-foreground ginko:@2xl:grid-cols-2"
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
                <div class="ginko:text-muted-foreground">
                  {{ collectionEditorT('publishDialogSitemap') }}:
                  {{ displayInclusion(localeImpact.sitemap.after).toLowerCase() }} ·
                  {{ collectionEditorT('publishDialogSearch') }}:
                  {{ displayInclusion(localeImpact.search.after).toLowerCase() }} ·
                  {{ collectionEditorT('publishDialogNavigation') }}:
                  {{ displayInclusion(localeImpact.nav.after).toLowerCase() }}
                </div>
                <div
                  v-if="(localeImpact.routeImpact?.listed ?? 0) > 0"
                  class="ginko:text-muted-foreground"
                >
                  {{
                    collectionEditorT('publishImpactDescendantRoutesAffected', {
                      total: formatBoundedCount(
                        localeImpact.routeImpact?.total ?? localeImpact.routeImpact?.listed ?? 0,
                        localeImpact.routeImpact?.total === null,
                      ),
                    })
                  }}
                </div>
              </div>
            </div>

            <div
              v-if="showAdvancedDetails && changeKindSummary.length"
              class="ginko:flex ginko:flex-wrap ginko:gap-1"
            >
              <Badge
                v-for="summary in changeKindSummary"
                :key="summary.key"
                variant="outline"
                class="ginko:text-xs"
              >
                {{ summary.label }}
                {{ formatBoundedCount(summary.count, summary.isLowerBound) }}
              </Badge>
            </div>
          </div>
          <div
            v-else-if="isFirstPublish && !previewFailed"
            class="ginko:text-xs ginko:text-muted-foreground"
          >
            {{ editor.loader.t('ginkoCms.studio.collectionEditor.publishDialogFirstPublish') }}
          </div>
          <div v-else class="ginko:text-xs ginko:text-muted-foreground">
            {{ publishImpactMessage }}
          </div>
        </div>

        <div
          v-if="readinessView.warnings.length"
          class="ginko:rounded-lg ginko:border ginko:border-warning/30 ginko:bg-warning/10 ginko:dark:bg-warning/15 ginko:p-3 ginko:text-sm ginko:text-warning-fg"
        >
          <div class="ginko:text-xs ginko:font-medium ginko:uppercase">
            {{ collectionEditorT('publishDialogWarnings') }}
          </div>
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
            v-model="editor.publishing.publishSession.message"
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
        <Button
          variant="outline"
          :disabled="
            editor.loader.pending || editor.publishing.publishSession.readiness.state === 'pending'
          "
          @click="editor.workflow?.previewPublishImpact(editor.loader.currentLocale)"
        >
          <Eye class="ginko:size-3.5 ginko:mr-1.5" />
          {{ editor.loader.t('ginkoCms.studio.entryDetails.previewChanges') }}
        </Button>
        <Button variant="outline" @click="editor.publishing.publishSession.open = false">
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
