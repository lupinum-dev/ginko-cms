<script setup lang="ts">
import { computed } from 'vue'

import { api } from '../../../boundary/api'
import { useStudioEntryEditorContext } from '../../../composables/internal/studioEntryEditorContext'
import { useCmsStudioQuery } from '../../../composables/useCmsStudioQuery'
import type { StudioReviewOutcome } from '../../../lib/studioReviewRequests'
import type { StudioEntryReadinessDetail } from './studioWorkflowTypes'

// PUB-06: when a publisher returns a review request, the feedback must appear
// where the editor resumes work. This shows a calm "Changes requested" notice
// for the most recent rejection of THIS entry — but only while it is still the
// newest signal: a draft save after the rejection or a newer pending review
// request hides it again ('In review' → editable transition).
const props = defineProps<{
  readinessDetail?: StudioEntryReadinessDetail | null
}>()

const editor = useStudioEntryEditorContext()

const t = (key: string, params?: Record<string, unknown>): string =>
  editor.loader.t(`ginkoCms.studio.entryDetails.${key}`, params)

const outcomesQuery = useCmsStudioQuery(
  api.ginkoCms.reviewRequests.listRecentReviewOutcomesForEntry,
  computed(() =>
    editor.loader.entryId ? { entryId: editor.loader.entryId, limit: 1 } : ('skip' as const),
  ),
  { keepPreviousData: true },
)

const latestOutcome = computed<StudioReviewOutcome | null>(
  () => outcomesQuery.data.value?.[0] ?? null,
)

// Draft saves bump the entry's updatedAt, so it doubles as "last saved".
const entrySavedAt = computed(() => {
  const entry = editor.loader.entry as { updatedAt?: number } | null
  return typeof entry?.updatedAt === 'number' ? entry.updatedAt : null
})

// A pending review request (any language) is a newer signal than the rejection.
const hasPendingReviewRequest = computed(() =>
  (props.readinessDetail?.locales ?? []).some((row) => row.reviewRequestId != null),
)

const rejection = computed<(StudioReviewOutcome & { reviewedAt: number }) | null>(() => {
  const outcome = latestOutcome.value
  if (!outcome || outcome.status !== 'rejected' || outcome.reviewedAt == null) return null
  if (entrySavedAt.value == null || outcome.reviewedAt <= entrySavedAt.value) return null
  if (hasPendingReviewRequest.value) return null
  return { ...outcome, reviewedAt: outcome.reviewedAt }
})

const canRequestReviewAgain = computed(() =>
  Boolean(
    props.readinessDetail?.locales.find((row) => row.locale === editor.loader.currentLocale)
      ?.canRequestReview,
  ),
)
</script>

<template>
  <StudioNotice
    v-if="rejection"
    tone="warning"
    :title="t('changesRequestedTitle')"
    class="ginko:mt-3"
  >
    <p class="ginko:text-sm">
      {{ rejection.reviewFeedback || t('changesRequestedNoFeedback') }}
    </p>
    <p class="ginko:mt-1.5 ginko:text-xs ginko:opacity-80">
      {{
        rejection.reviewedByLabel
          ? t('changesRequestedMetaBy', { name: rejection.reviewedByLabel })
          : t('changesRequestedMeta')
      }}
      <NuxtTime
        :datetime="rejection.reviewedAt"
        :locale="editor.loader.dateLocale"
        month="short"
        day="numeric"
        hour="2-digit"
        minute="2-digit"
      />
    </p>
    <!-- One next action: request review again once the draft allows it;
         until then the notice itself is the cue to continue editing. -->
    <template #action>
      <Button
        v-if="canRequestReviewAgain"
        variant="outline"
        size="sm"
        :disabled="editor.workflow.requestReviewPending"
        @click="editor.workflow.requestPublishReview()"
      >
        {{ t('changesRequestedRequestAgain') }}
      </Button>
      <span v-else class="ginko:text-xs ginko:opacity-80">
        {{ t('changesRequestedContinueEditing') }}
      </span>
    </template>
  </StudioNotice>
</template>
