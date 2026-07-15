<script setup lang="ts">
import { AlertCircle, Check, Circle, Clock } from '@lucide/vue'
import { computed } from 'vue'

import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import {
  mapEntryReadinessDetail,
  readinessActionLabel,
  readinessIssueMessage,
} from '../../../lib/publicWorkflow'
import { studioWorkflowLabel } from '../../../lib/studioWorkflowSpine'
import type {
  StudioEntryReadinessDetail,
  StudioPublishImpactState,
  StudioPublishReviewState,
  StudioRouteValidationState,
} from './studioWorkflowTypes'

const props = defineProps<{
  readinessDetail?: StudioEntryReadinessDetail | null
  readinessPending?: boolean
  routeValidationRequested?: boolean
  routeValidationState?: StudioRouteValidationState
  publishImpactRequested?: boolean
  publishImpact?: StudioPublishImpactState
  publishReview?: StudioPublishReviewState
  requestReviewPending?: boolean
}>()

type WorkflowStepState = 'done' | 'current' | 'blocked' | 'waiting'

type WorkflowStep = {
  key: string
  title: string
  description: string
  state: WorkflowStepState
  status: string
}

const editor = useStudioEntryEditorContext()

const t = (key: string, params?: Record<string, unknown>): string =>
  editor.loader.t(`ginkoCms.studio.entryDetails.${key}`, params)

const entry = computed(() => editor.loader.entry)

const readinessView = computed(() =>
  mapEntryReadinessDetail({
    readinessDetail: props.readinessDetail,
    currentLocale: editor.loader.currentLocale,
    t: editor.loader.t,
    publishMode: 'single',
  }),
)

const currentLocaleReadiness = computed(() => readinessView.value.currentLocale)

const routeHasBlocker = computed(
  () =>
    Boolean(props.routeValidationRequested) &&
    Boolean(
      props.routeValidationState?.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    ),
)

const firstBlockerMessage = computed(() => {
  const blocker = readinessView.value.blockers[0]
  if (blocker) return readinessIssueMessage(editor.loader.t, blocker)
  if (routeHasBlocker.value) return t('routeBlockerFound')
  return null
})

const previewReady = computed(
  () =>
    Boolean(props.publishImpactRequested) &&
    props.publishReview?.state === 'ready' &&
    !props.publishReview?.blocked &&
    !props.publishReview?.failed &&
    !props.publishReview?.stale,
)

const previewBlocked = computed(
  () =>
    Boolean(props.publishImpactRequested) &&
    (props.publishReview?.blocked ||
      props.publishReview?.failed ||
      props.publishReview?.stale ||
      props.publishImpact?.state === 'blocked' ||
      props.publishImpact?.state === 'failed' ||
      props.publishImpact?.state === 'stale'),
)

const previewPending = computed(
  () => props.publishReview?.state === 'pending' || props.publishImpact?.pending === true,
)

const reviewRequested = computed(
  () =>
    currentLocaleReadiness.value?.state === 'in_review' ||
    Boolean(currentLocaleReadiness.value?.reviewRequestId),
)

const currentLocaleIsLive = computed(
  () =>
    currentLocaleReadiness.value?.state === 'live' &&
    !currentLocaleReadiness.value.hasUnpublishedChanges,
)

const liveWithChanges = computed(() => currentLocaleReadiness.value?.state === 'live_with_changes')

const workflowSteps = computed<WorkflowStep[]>(() => {
  const writeDone = !editor.draft.isDirty && Boolean(currentLocaleReadiness.value?.draftExists)
  const checkDone =
    !props.readinessPending &&
    !firstBlockerMessage.value &&
    Boolean(
      readinessView.value.canPreview ||
      readinessView.value.canRequestReview ||
      readinessView.value.canPublish ||
      currentLocaleReadiness.value?.state === 'ready' ||
      currentLocaleReadiness.value?.state === 'in_review' ||
      currentLocaleReadiness.value?.state === 'live' ||
      currentLocaleReadiness.value?.state === 'live_with_changes',
    )
  const canReview = Boolean(
    readinessView.value.canRequestReview || readinessView.value.canPublish || previewReady.value,
  )
  const publishAvailable = Boolean(readinessView.value.canPublish && previewReady.value)
  const liveUrl = readinessView.value.publicUrl || readinessView.value.draftUrl

  return [
    {
      key: 'write',
      title: studioWorkflowLabel('write'),
      description: editor.draft.isDirty ? t('stepWriteDirty') : t('stepWriteSaved'),
      state: editor.draft.isDirty ? 'current' : writeDone ? 'done' : 'waiting',
      status: editor.draft.isDirty ? t('stepEditing') : t('stepSaved'),
    },
    {
      key: 'check',
      title: studioWorkflowLabel('check'),
      description: props.readinessPending
        ? t('stepCheckPending')
        : firstBlockerMessage.value ||
          (checkDone
            ? t('stepCheckDone')
            : readinessView.value.nextAction
              ? readinessActionLabel(editor.loader.t, readinessView.value.nextAction.kind)
              : t('stepCheckFallback')),
      state: props.readinessPending
        ? 'current'
        : firstBlockerMessage.value
          ? 'blocked'
          : checkDone
            ? 'done'
            : 'current',
      status: props.readinessPending
        ? t('statusChecking')
        : firstBlockerMessage.value
          ? t('statusNeedsWork')
          : checkDone
            ? t('statusReady')
            : t('stepNext'),
    },
    {
      key: 'preview',
      title: studioWorkflowLabel('preview'),
      description: previewPending.value
        ? t('stepPreviewPending')
        : previewReady.value
          ? props.publishReview?.message || t('stepPreviewReady')
          : previewBlocked.value
            ? props.publishReview?.message || props.publishImpact?.message || t('stepPreviewBlocked')
            : readinessView.value.canPreview
              ? t('stepPreviewAvailable')
              : t('stepPreviewWaiting'),
      state: previewPending.value
        ? 'current'
        : previewReady.value
          ? 'done'
          : previewBlocked.value
            ? 'blocked'
            : readinessView.value.canPreview
              ? 'current'
              : 'waiting',
      status: previewPending.value
        ? t('stepPreviewing')
        : previewReady.value
          ? t('stepPrepared')
          : previewBlocked.value
            ? t('stepNeedsPreview')
            : t('statusWaiting'),
    },
    {
      key: 'review',
      title: studioWorkflowLabel('review'),
      description: props.requestReviewPending
        ? t('stepReviewPending')
        : reviewRequested.value
          ? t('stepReviewRequested')
          : readinessView.value.canPublish && previewReady.value
            ? t('stepReviewReady')
            : canReview
              ? t('stepReviewAvailable')
              : t('stepReviewWaiting'),
      state:
        props.requestReviewPending || reviewRequested.value
          ? 'current'
          : readinessView.value.canPublish && previewReady.value
            ? 'done'
            : canReview
              ? 'current'
              : 'waiting',
      status: props.requestReviewPending
        ? t('stepSending')
        : reviewRequested.value
          ? t('stepInReview')
          : readinessView.value.canPublish && previewReady.value
            ? t('stepReviewed')
            : canReview
              ? t('statusReady')
              : t('statusWaiting'),
    },
    {
      key: 'publish',
      title: studioWorkflowLabel('publish'),
      description: currentLocaleIsLive.value
        ? t('stepPublishLive')
        : liveWithChanges.value
          ? t('stepPublishChanges')
          : publishAvailable
            ? t('stepPublishAvailable')
            : firstBlockerMessage.value
              ? t('stepPublishBlocked')
              : t('stepPublishWaiting'),
      state: currentLocaleIsLive.value
        ? 'done'
        : firstBlockerMessage.value
          ? 'blocked'
          : publishAvailable
            ? 'current'
            : 'waiting',
      status: currentLocaleIsLive.value
        ? t('statusLive')
        : liveWithChanges.value
          ? t('stepDraftChanges')
          : publishAvailable
            ? t('statusReady')
            : firstBlockerMessage.value
              ? t('stepBlocked')
              : t('statusWaiting'),
    },
    {
      key: 'track',
      title: studioWorkflowLabel('track'),
      description: entry.value?.publishedAt
        ? liveWithChanges.value
          ? t('stepTrackChanges')
          : liveUrl
            ? t('stepTrackLive')
            : t('stepTrackPublished')
        : t('stepTrackWaiting'),
      state: entry.value?.publishedAt ? 'done' : 'waiting',
      status: entry.value?.publishedAt ? t('stepAlreadyLive') : t('statusWaiting'),
    },
  ]
})

function stepTone(state: WorkflowStepState) {
  if (state === 'done') return 'success'
  if (state === 'blocked') return 'danger'
  if (state === 'current') return 'warning'
  return 'neutral'
}

function markerClass(state: WorkflowStepState) {
  if (state === 'done') return 'ginko:bg-success/12 ginko:text-success-fg ginko:ring-success/30'
  if (state === 'blocked') {
    return 'ginko:bg-destructive/10 ginko:text-destructive-fg ginko:ring-destructive/25'
  }
  if (state === 'current') return 'ginko:bg-warning/15 ginko:text-warning-fg ginko:ring-warning/30'
  return 'ginko:bg-muted ginko:text-muted-foreground ginko:ring-border/80'
}
</script>

<template>
  <StudioInspectorSection :title="t('publishingFlow')">
    <ol class="ginko:space-y-3">
      <li
        v-for="step in workflowSteps"
        :key="step.key"
        class="ginko:grid ginko:grid-cols-[1.75rem_minmax(0,1fr)] ginko:gap-3"
      >
        <span
          class="ginko:mt-0.5 ginko:grid ginko:size-6 ginko:place-items-center ginko:rounded-full ginko:ring-1"
          :class="markerClass(step.state)"
        >
          <Check v-if="step.state === 'done'" class="ginko:size-3.5" />
          <AlertCircle v-else-if="step.state === 'blocked'" class="ginko:size-3.5" />
          <Clock v-else-if="step.state === 'current'" class="ginko:size-3.5" />
          <Circle v-else class="ginko:size-3" />
        </span>
        <div class="ginko:min-w-0">
          <div
            class="ginko:flex ginko:min-w-0 ginko:items-center ginko:justify-between ginko:gap-2"
          >
            <div class="ginko:truncate ginko:text-sm ginko:font-medium ginko:text-foreground">
              {{ step.title }}
            </div>
            <StudioStatusPill :label="step.status" :tone="stepTone(step.state)" />
          </div>
          <p class="ginko:mt-0.5 ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground">
            {{ step.description }}
          </p>
        </div>
      </li>
    </ol>
  </StudioInspectorSection>
</template>
