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
  if (routeHasBlocker.value) return 'Website URL check found a blocking issue.'
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
      description: editor.draft.isDirty ? 'Draft has unsaved changes.' : 'Draft is saved.',
      state: editor.draft.isDirty ? 'current' : writeDone ? 'done' : 'waiting',
      status: editor.draft.isDirty ? 'Editing' : 'Saved',
    },
    {
      key: 'check',
      title: studioWorkflowLabel('check'),
      description: props.readinessPending
        ? 'Checking content, language, and URL readiness.'
        : firstBlockerMessage.value ||
          (checkDone
            ? 'Content, language, and URL checks have no blockers.'
            : readinessView.value.nextAction
              ? readinessActionLabel(editor.loader.t, readinessView.value.nextAction.kind)
              : 'Run readiness checks before previewing.'),
      state: props.readinessPending
        ? 'current'
        : firstBlockerMessage.value
          ? 'blocked'
          : checkDone
            ? 'done'
            : 'current',
      status: props.readinessPending
        ? 'Checking'
        : firstBlockerMessage.value
          ? 'Needs work'
          : checkDone
            ? 'Ready'
            : 'Next',
    },
    {
      key: 'preview',
      title: studioWorkflowLabel('preview'),
      description: previewPending.value
        ? 'Preparing website changes.'
        : previewReady.value
          ? props.publishReview?.message || 'Website changes are ready to review.'
          : previewBlocked.value
            ? props.publishReview?.message || props.publishImpact?.message || 'Preview needs work.'
            : readinessView.value.canPreview
              ? 'Preview what will change on the website.'
              : 'Finish checks before previewing website changes.',
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
        ? 'Previewing'
        : previewReady.value
          ? 'Prepared'
          : previewBlocked.value
            ? 'Needs preview'
            : 'Waiting',
    },
    {
      key: 'review',
      title: studioWorkflowLabel('review'),
      description: props.requestReviewPending
        ? 'Sending this for review.'
        : reviewRequested.value
          ? 'A publishing review is waiting for a decision.'
          : readinessView.value.canPublish && previewReady.value
            ? 'Review what will change before publishing.'
            : canReview
              ? 'Request or complete a publishing review.'
              : 'Review starts after preview is ready.',
      state:
        props.requestReviewPending || reviewRequested.value
          ? 'current'
          : readinessView.value.canPublish && previewReady.value
            ? 'done'
            : canReview
              ? 'current'
              : 'waiting',
      status: props.requestReviewPending
        ? 'Sending'
        : reviewRequested.value
          ? 'In review'
          : readinessView.value.canPublish && previewReady.value
            ? 'Reviewed'
            : canReview
              ? 'Ready'
              : 'Waiting',
    },
    {
      key: 'publish',
      title: studioWorkflowLabel('publish'),
      description: currentLocaleIsLive.value
        ? 'This language is already live.'
        : liveWithChanges.value
          ? 'A live version exists; draft changes are not live yet.'
          : publishAvailable
            ? 'Publish the approved website changes.'
            : firstBlockerMessage.value
              ? 'Resolve blockers before publishing.'
              : 'Publishing unlocks after preview and review.',
      state: currentLocaleIsLive.value
        ? 'done'
        : firstBlockerMessage.value
          ? 'blocked'
          : publishAvailable
            ? 'current'
            : 'waiting',
      status: currentLocaleIsLive.value
        ? 'Live'
        : liveWithChanges.value
          ? 'Draft changes'
          : publishAvailable
            ? 'Ready'
            : firstBlockerMessage.value
              ? 'Blocked'
              : 'Waiting',
    },
    {
      key: 'track',
      title: studioWorkflowLabel('track'),
      description: entry.value?.publishedAt
        ? liveWithChanges.value
          ? 'Track the live version while draft changes continue.'
          : liveUrl
            ? 'Already live on the website.'
            : 'Published; website status is available in details.'
        : 'Track live status after publishing.',
      state: entry.value?.publishedAt ? 'done' : 'waiting',
      status: entry.value?.publishedAt ? 'Already live' : 'Waiting',
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
  <StudioInspectorSection title="Publishing flow">
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
