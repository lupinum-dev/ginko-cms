<script setup lang="ts">
import { AlertCircle, CheckCircle2, ExternalLink, Eye, Globe } from '@lucide/vue'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useCmsConfig } from '../../../composables/useCmsConfig'
import { useStudioAdvancedEditor } from '../../../composables/useStudioAdvancedEditor'
import { contentLanguageLabel } from '../../../lib/contentLanguageLabel'
import {
  derivePublishConfirmationState,
  draftPreviewPath,
  mapEntryReadinessDetail,
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

function languageLabel(locale: string) {
  return contentLanguageLabel(locale, editor.loader.locales, editor.loader.dateLocale)
}
const publishImpactLocales = computed(() => props.publishImpact?.locales ?? [])
const publishImpactReady = computed(
  () =>
    Boolean(props.publishImpactRequested) &&
    editor.publishing.publishSession.readiness.state === 'ready' &&
    props.publishImpact?.state === 'ready' &&
    publishImpactLocales.value.length > 0,
)

const publishLabel = computed(() => {
  if (editor.publishing.publishSession.mode === 'all') {
    return editor.loader.t('ginkoCms.common.publishAll')
  }
  return collectionEditorT('publishLanguage', {
    language: languageLabel(editor.loader.currentLocale),
  })
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
          .map((variant: { locale: string }) => languageLabel(variant.locale))
          .join(', '),
      })
    : collectionEditorT('publishDialogCurrentLanguage', {
        locale: languageLabel(editor.loader.currentLocale),
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

// A planned route is not evidence that a public page already exists.
const publicUrl = computed(() =>
  readinessView.value.currentLocale?.locale === editor.loader.currentLocale &&
  readinessView.value.currentLocale.published
    ? readinessView.value.publicUrl || ''
    : '',
)
const pageAddress = computed(() => {
  if (!publishImpactReady.value) return ''
  const impact = publishImpactLocales.value.find(
    (item) => item.locale === editor.loader.currentLocale,
  )
  return impact?.nextHref || impact?.nextPath || ''
})
const importantRouteImpact = computed(() =>
  publishImpactLocales.value.filter(
    (impact) =>
      Boolean(
        (impact.currentHref || impact.currentPath) &&
        (impact.currentHref || impact.currentPath) !== (impact.nextHref || impact.nextPath),
      ) || (impact.routeImpact?.listed ?? 0) > 0,
  ),
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
  return (
    editor.publishing.publishSession.preview?.blockers[0]?.message ||
    collectionEditorT('publishDialogBlocked')
  )
})

const visibleWarnings = computed(() => [
  ...new Set([
    ...readinessView.value.warnings.map((warning) =>
      readinessIssueMessage(editor.loader.t, warning),
    ),
    ...(editor.publishing.publishSession.preview?.warnings ?? []).map((warning) => warning.message),
  ]),
])
const additionalBlockers = computed(() =>
  [
    ...new Set([
      ...readinessView.value.blockers.map((blocker) =>
        readinessIssueMessage(editor.loader.t, blocker),
      ),
      ...(editor.publishing.publishSession.preview?.blockers ?? []).map(
        (blocker) => blocker.message,
      ),
    ]),
  ].filter((message) => message !== issueLabel.value),
)

const showAdvancedDetails = computed(() => advancedEditor.value)

const isBlocked = computed(
  () =>
    readinessView.value.blockers.length > 0 ||
    (editor.publishing.publishSession.preview?.blockers.length ?? 0) > 0 ||
    editor.publishing.publishSession.readiness.state === 'blocked',
)

// Preview preparation failed (e.g. the entry changed in another session). The
// dialog must never claim "Ready to publish" next to a failed preview.
const previewFailed = computed(() => editor.publishing.publishSession.readiness.state === 'failed')
const checkingReview = computed(
  () =>
    editor.loader.pending ||
    editor.publishing.publishSession.readiness.state === 'pending' ||
    editor.publishing.publishSession.readiness.state === 'not_previewed',
)

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
          :role="isBlocked || previewFailed ? 'alert' : 'status'"
          class="ginko:flex ginko:items-start ginko:gap-2 ginko:rounded-lg ginko:border ginko:p-3 ginko:text-sm"
          :class="
            isBlocked || previewFailed
              ? 'ginko:border-destructive/40 ginko:text-destructive-fg'
              : publishConfirmation.canConfirm
                ? 'ginko:border-success/40 ginko:text-success-fg'
                : 'ginko:border-border/60 ginko:text-muted-foreground'
          "
        >
          <AlertCircle
            v-if="isBlocked || previewFailed"
            class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
          />
          <CheckCircle2
            v-else-if="publishConfirmation.canConfirm"
            class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
          />
          <Eye v-else class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0" />
          <div class="ginko:min-w-0">
            <div
              class="ginko:mb-1 ginko:text-xs ginko:font-medium ginko:uppercase"
              :class="
                isBlocked || previewFailed
                  ? 'ginko:text-destructive'
                  : publishConfirmation.canConfirm
                    ? 'ginko:text-success-fg'
                    : 'ginko:text-muted-foreground'
              "
            >
              {{
                isBlocked
                  ? collectionEditorT('publishDialogIssuesBlocking')
                  : previewFailed
                    ? collectionEditorT('publishDialogPreviewFailed')
                    : checkingReview
                      ? editor.loader.t('ginkoCms.common.loading')
                      : publishConfirmation.canConfirm
                        ? collectionEditorT('publishDialogReadyToPublish')
                        : collectionEditorT('publishDialogPreviewFailed')
              }}
            </div>
            <div v-if="isBlocked || previewFailed" class="ginko:font-medium">
              {{ !isBlocked && previewFailed ? previewFailureMessage : issueLabel }}
            </div>
            <ul v-if="additionalBlockers.length" class="ginko:mt-1 ginko:space-y-1">
              <li v-for="message in additionalBlockers" :key="message">{{ message }}</li>
            </ul>
            <div
              v-if="publishConfirmation.disabledReason && !previewFailed"
              class="ginko:mt-1 ginko:text-xs"
              :class="isBlocked ? 'ginko:text-destructive' : 'ginko:text-muted-foreground'"
            >
              {{ publishConfirmation.disabledReason }}
            </div>
            <!-- Refresh the shared draft and prepare a new version-bound review. -->
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
            {{ collectionEditorT('publishDialogDestination') }}
          </div>
          <div class="ginko:mt-1 ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
            <div class="ginko:min-w-0 ginko:break-all ginko:font-mono ginko:text-sm">
              {{
                pageAddress ||
                (publishImpactReady
                  ? collectionEditorT('publishDialogNoPageUrlPlanned')
                  : checkingReview
                    ? editor.loader.t('ginkoCms.common.loading')
                    : collectionEditorT('publishDialogPreviewRequired'))
              }}
            </div>
            <Button v-if="publicUrl" variant="ghost" size="sm" as-child>
              <a
                :href="publicUrl"
                target="_blank"
                rel="noreferrer"
                :aria-label="collectionEditorT('publishDialogOpenLiveUrl')"
              >
                {{ collectionEditorT('publishDialogOpenLiveUrl') }}
                <ExternalLink class="ginko:ml-1.5 ginko:size-3.5" />
              </a>
            </Button>
          </div>
        </div>

        <div
          v-if="editor.publishing.publishSession.mode === 'all'"
          class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3"
        >
          <div class="ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground">
            {{ collectionEditorT('publishDialogLanguages') }}
          </div>
          <div class="ginko:mt-1 ginko:text-sm">{{ publishScopeLabel }}</div>
        </div>

        <div class="ginko:space-y-3">
          <div v-if="publishImpactReady" class="ginko:space-y-3">
            <div
              v-if="draftPreviewOpened"
              class="ginko:flex ginko:items-start ginko:gap-2 ginko:text-xs ginko:text-muted-foreground"
            >
              <CheckCircle2
                class="ginko:mt-0.5 ginko:size-3.5 ginko:shrink-0 ginko:text-success-fg"
              />
              <span>
                {{ collectionEditorT('publishDialogPreviewReviewed') }}
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
              v-for="impact in importantRouteImpact"
              :key="`route-impact:${impact.locale}`"
              class="ginko:rounded-lg ginko:border ginko:border-warning/30 ginko:bg-warning/5 ginko:p-3 ginko:text-sm"
            >
              <p
                v-if="
                  (impact.currentHref || impact.currentPath) !==
                  (impact.nextHref || impact.nextPath)
                "
                class="ginko:break-words"
              >
                {{
                  collectionEditorT('publishDialogAddressChanges', {
                    language: languageLabel(impact.locale),
                    before: impact.currentHref || impact.currentPath,
                    after: displayAddress(
                      impact.nextHref || impact.nextPath,
                      'publishDialogNoPageUrlPlanned',
                    ),
                  })
                }}
              </p>
              <p v-if="(impact.routeImpact?.listed ?? 0) > 0">
                {{
                  collectionEditorT('publishImpactDescendantRoutesAffected', {
                    total: formatBoundedCount(
                      impact.routeImpact?.total ?? impact.routeImpact?.listed ?? 0,
                      impact.routeImpact?.total === null,
                    ),
                  })
                }}
              </p>
            </div>
            <details class="ginko:rounded-lg ginko:border ginko:border-border/40 ginko:p-3">
              <summary class="ginko:cursor-pointer ginko:text-sm ginko:font-medium">
                {{ collectionEditorT('publishDialogDeliveryDetails') }}
              </summary>
              <div
                class="ginko:divide-y ginko:divide-border/60 ginko:border-y ginko:border-border/60"
              >
                <div
                  v-for="localeImpact in publishImpactLocales"
                  :key="`publish-dialog-impact:${localeImpact.locale}`"
                  class="ginko:grid ginko:gap-2 ginko:py-2 ginko:text-xs"
                >
                  <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
                    <span
                      v-if="publishImpactLocales.length > 1"
                      class="ginko:font-medium ginko:text-foreground"
                    >
                      {{ languageLabel(localeImpact.locale) }}
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
                      <div
                        class="ginko:mt-0.5 ginko:truncate ginko:font-mono ginko:text-foreground"
                      >
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
            </details>
          </div>
          <div v-else class="ginko:text-xs ginko:text-muted-foreground">
            {{ publishImpactMessage }}
          </div>
        </div>

        <div
          v-if="visibleWarnings.length"
          class="ginko:rounded-lg ginko:border ginko:border-warning/30 ginko:bg-warning/10 ginko:dark:bg-warning/15 ginko:p-3 ginko:text-sm ginko:text-warning-fg"
        >
          <div class="ginko:text-xs ginko:font-medium ginko:uppercase">
            {{ collectionEditorT('publishDialogWarnings') }}
          </div>
          <ul class="ginko:mt-1 ginko:space-y-1">
            <li v-for="warning in visibleWarnings" :key="warning">
              {{ warning }}
            </li>
          </ul>
        </div>

        <details class="ginko:space-y-2">
          <summary class="ginko:cursor-pointer ginko:text-sm ginko:text-muted-foreground">
            {{ collectionEditorT('publishDialogAddNote') }}
          </summary>
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
        </details>

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
          v-if="!publishConfirmation.canConfirm"
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
