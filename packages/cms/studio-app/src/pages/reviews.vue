<script setup lang="ts">
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { AlertCircle, Bot, Check, Inbox, Loader2, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { api } from '../boundary/api'
import StudioReviewWebsiteChanges from '../components/studio/reviews/StudioReviewWebsiteChanges.vue'
import { cmsPermissionKeys } from '../composables/permissions'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioQuery } from '../composables/useCmsStudioQuery'
import { useConvexMutation } from '../composables/useStudioConvex'
import { readinessIssueLabel } from '../lib/publicWorkflow'
import type { StudioReviewRequest } from '../lib/studioReviewRequests'

type ReviewRequest = StudioReviewRequest

type ReviewCheckItem = {
  message: string
  tone: 'danger' | 'neutral' | 'success' | 'warning'
}

type ReviewPreparationItem = {
  message: string
  tone: 'danger' | 'neutral' | 'success' | 'warning'
}

const { t, dateLocale } = useCmsI18n()
const { can } = useCmsStudioAccess()
const canPublishEntries = can(cmsPermissionKeys.publishEntries)
const reviewsQuery = useCmsStudioQuery(
  api.ginkoCms.reviewRequests.listPendingReviews,
  { limit: 50 },
  { requiredCapability: cmsPermissionKeys.publishEntries },
)
const approveReview = useConvexMutation(api.ginkoCms.reviewRequests.approveReview)
const rejectReview = useConvexMutation(api.ginkoCms.reviewRequests.rejectReview)
const decidingId = ref<string | null>(null)
const decisionError = ref('')
const approvalCandidate = ref<ReviewRequest | null>(null)

const reviews = computed<ReviewRequest[]>(() => (reviewsQuery.data.value ?? []) as ReviewRequest[])
const isLoading = computed(() => reviewsQuery.data.value === null && reviewsQuery.pending.value)
const pageError = computed(() =>
  reviewsQuery.error.value
    ? getCmsErrorMessage(reviewsQuery.error.value, t('ginkoCms.studio.reviewsPage.loadError'))
    : '',
)

function formatJson(value: StudioReviewRequest['preview']): string {
  return JSON.stringify(value, null, 2)
}

function countMessage(count: number, oneKey: string, otherKey: string): string {
  return t(count === 1 ? oneKey : otherKey, { count })
}

function statusLabel(status: string) {
  if (status === 'ready') return t('ginkoCms.studio.reviewsPage.reviewStatusReady')
  if (status === 'no_changes') return t('ginkoCms.studio.reviewsPage.reviewStatusNoChanges')
  if (status === 'blocked') return t('ginkoCms.studio.reviewsPage.reviewStatusBlocked')
  if (status === 'not_publishable')
    return t('ginkoCms.studio.reviewsPage.reviewStatusNotPublishable')
  return t('ginkoCms.studio.reviewsPage.reviewStatusUnknown')
}

function reviewSummaryText(summary: StudioReviewRequest['reviewSummary']): string {
  const parts = [statusLabel(summary.status)]
  if (summary.changeCount)
    parts.push(
      countMessage(
        summary.changeCount,
        'ginkoCms.studio.reviewsPage.previewChangesOne',
        'ginkoCms.studio.reviewsPage.previewChangesOther',
      ),
    )
  if (summary.blockerCount)
    parts.push(
      countMessage(
        summary.blockerCount,
        'ginkoCms.studio.reviewsPage.previewBlockersOne',
        'ginkoCms.studio.reviewsPage.previewBlockersOther',
      ),
    )
  if (summary.warningCount)
    parts.push(
      countMessage(
        summary.warningCount,
        'ginkoCms.studio.reviewsPage.previewWarningsOne',
        'ginkoCms.studio.reviewsPage.previewWarningsOther',
      ),
    )
  return parts.join(' · ')
}

function requestSourceLabel(request: ReviewRequest): string {
  return request.requestSource === 'agent'
    ? t('ginkoCms.studio.reviewsPage.requestSourceAgent')
    : t('ginkoCms.studio.reviewsPage.requestSourceHuman')
}

function sourcePanelTitle(request: ReviewRequest): string {
  return request.requestSource === 'agent'
    ? t('ginkoCms.studio.reviewsPage.aiPreparedTitle')
    : t('ginkoCms.studio.reviewsPage.humanPreparedTitle')
}

function sourceSummaryLabel(request: ReviewRequest): string {
  return request.requestSource === 'agent'
    ? t('ginkoCms.studio.reviewsPage.assistantSummary')
    : t('ginkoCms.studio.reviewsPage.requestSummary')
}

function preparationListTitle(request: ReviewRequest): string {
  return request.requestSource === 'agent'
    ? t('ginkoCms.studio.reviewsPage.assistantPreparedList')
    : t('ginkoCms.studio.reviewsPage.requestPreparedList')
}

function formatLocaleList(locales: string[]): string {
  return locales.length
    ? locales.join(', ').toUpperCase()
    : t('ginkoCms.studio.reviewsPage.noLanguagesSelected')
}

function approvalStatusText(request: ReviewRequest): string {
  if (request.isStale) {
    return request.staleReason || t('ginkoCms.studio.reviewsPage.staleCheck')
  }
  if (request.reviewSummary.blockerCount) {
    return t('ginkoCms.studio.reviewsPage.publishDecisionBlockers', {
      count: countMessage(
        request.reviewSummary.blockerCount,
        'ginkoCms.studio.reviewsPage.previewBlockersOne',
        'ginkoCms.studio.reviewsPage.previewBlockersOther',
      ),
    })
  }
  if (request.reviewSummary.warningCount) {
    return t('ginkoCms.studio.reviewsPage.publishDecisionWarnings', {
      count: countMessage(
        request.reviewSummary.warningCount,
        'ginkoCms.studio.reviewsPage.previewWarningsOne',
        'ginkoCms.studio.reviewsPage.previewWarningsOther',
      ),
    })
  }
  return t('ginkoCms.studio.reviewsPage.readyDecision')
}

function reviewPreparationItems(request: ReviewRequest): ReviewPreparationItem[] {
  const items: ReviewPreparationItem[] = []

  if (request.reviewSummary.changeCount) {
    items.push({
      message: countMessage(
        request.reviewSummary.changeCount,
        'ginkoCms.studio.reviewsPage.preparedChangesOne',
        'ginkoCms.studio.reviewsPage.preparedChangesOther',
      ),
      tone: 'neutral',
    })
  } else {
    items.push({
      message: t('ginkoCms.studio.reviewsPage.preparedNoChanges'),
      tone: 'neutral',
    })
  }

  if (request.reviewSummary.affectedPublicUrls.length) {
    items.push({
      message: countMessage(
        request.reviewSummary.affectedPublicUrls.length,
        'ginkoCms.studio.reviewsPage.preparedPagesOne',
        'ginkoCms.studio.reviewsPage.preparedPagesOther',
      ),
      tone: 'neutral',
    })
  } else {
    items.push({
      message: t('ginkoCms.studio.reviewsPage.preparedNoAffectedPages'),
      tone: 'neutral',
    })
  }

  if (request.isStale) {
    items.push({
      message: request.staleReason || t('ginkoCms.studio.reviewsPage.preparedStale'),
      tone: 'danger',
    })
  } else if (request.reviewSummary.blockerCount) {
    items.push({
      message: t('ginkoCms.studio.reviewsPage.preparedBlocked', {
        count: countMessage(
          request.reviewSummary.blockerCount,
          'ginkoCms.studio.reviewsPage.previewBlockersOne',
          'ginkoCms.studio.reviewsPage.previewBlockersOther',
        ),
      }),
      tone: 'danger',
    })
  } else if (request.reviewSummary.warningCount) {
    items.push({
      message: t('ginkoCms.studio.reviewsPage.preparedWarnings', {
        count: countMessage(
          request.reviewSummary.warningCount,
          'ginkoCms.studio.reviewsPage.previewWarningsOne',
          'ginkoCms.studio.reviewsPage.previewWarningsOther',
        ),
      }),
      tone: 'warning',
    })
  } else {
    items.push({
      message: t('ginkoCms.studio.reviewsPage.preparedReady'),
      tone: 'success',
    })
  }

  return items
}

function reviewCheckItems(request: ReviewRequest): ReviewCheckItem[] {
  const items: ReviewCheckItem[] = []
  const hasConcerns =
    request.isStale || request.reviewSummary.blockerCount || request.reviewSummary.warningCount
  if (request.isStale) {
    items.push({
      message: request.staleReason || t('ginkoCms.studio.reviewsPage.staleCheck'),
      tone: 'danger',
    })
  }
  if (request.reviewSummary.blockerCount) {
    items.push({
      message: t('ginkoCms.studio.reviewsPage.reviewCheckBlockers', {
        count: countMessage(
          request.reviewSummary.blockerCount,
          'ginkoCms.studio.reviewsPage.previewBlockersOne',
          'ginkoCms.studio.reviewsPage.previewBlockersOther',
        ),
      }),
      tone: 'danger',
    })
  }
  if (request.reviewSummary.warningCount) {
    items.push({
      message: t('ginkoCms.studio.reviewsPage.reviewCheckWarnings', {
        count: countMessage(
          request.reviewSummary.warningCount,
          'ginkoCms.studio.reviewsPage.previewWarningsOne',
          'ginkoCms.studio.reviewsPage.previewWarningsOther',
        ),
      }),
      tone: 'warning',
    })
  }
  if (!hasConcerns) {
    items.push({
      message: t('ginkoCms.studio.reviewsPage.noReviewConcerns'),
      tone: 'success',
    })
  }
  if (request.requestSource === 'agent') {
    items.push({
      message: t('ginkoCms.studio.reviewsPage.aiManualCheck'),
      tone: 'neutral',
    })
  }
  return items
}

function reviewCheckIconClass(item: ReviewCheckItem): string {
  if (item.tone === 'danger') return 'ginko:text-destructive'
  if (item.tone === 'warning') return 'ginko:text-warning-fg'
  if (item.tone === 'success') return 'ginko:text-success-fg'
  return 'ginko:text-muted-foreground'
}

async function approve(request: ReviewRequest): Promise<boolean> {
  decisionError.value = ''
  decidingId.value = request._id
  try {
    await approveReview({
      reviewRequestId: request._id,
      expectedVersionHash: request.versionHash,
    })
    await reviewsQuery.refresh()
    return true
  } catch (error) {
    decisionError.value = getCmsErrorMessage(error, t('ginkoCms.studio.reviewsPage.approveError'))
    return false
  } finally {
    decidingId.value = null
  }
}

function requestApprovalConfirmation(request: ReviewRequest) {
  approvalCandidate.value = request
}

async function confirmApproval() {
  if (!approvalCandidate.value) return
  const approved = await approve(approvalCandidate.value)
  if (approved) approvalCandidate.value = null
}

async function reject(request: ReviewRequest) {
  decisionError.value = ''
  decidingId.value = request._id
  try {
    await rejectReview({ reviewRequestId: request._id })
    await reviewsQuery.refresh()
  } catch (error) {
    decisionError.value = getCmsErrorMessage(error, t('ginkoCms.studio.reviewsPage.rejectError'))
  } finally {
    decidingId.value = null
  }
}
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader
        :title="t('ginkoCms.studio.reviewsPage.title')"
        :eyebrow="t('ginkoCms.studio.layout.publishing')"
        :description="t('ginkoCms.studio.reviewsPage.description')"
      >
        <template #actions>
          <Badge variant="outline" class="ginko:text-xs">
            {{ t('ginkoCms.studio.reviewsPage.pendingBadge', { count: reviews.length }) }}
          </Badge>
        </template>
      </StudioPageHeader>
    </template>

    <ScrollArea class="ginko:flex-1">
      <div class="studio-page-content studio-page-body">
        <div
          v-if="pageError || decisionError"
          class="ginko:mb-4 ginko:flex ginko:items-center ginko:gap-2 ginko:rounded-md ginko:border ginko:border-destructive/25 ginko:bg-destructive/10 ginko:p-3 ginko:text-sm ginko:text-destructive-fg"
        >
          <AlertCircle class="ginko:size-4 ginko:shrink-0" />
          {{ pageError || decisionError }}
        </div>

        <div
          v-if="!canPublishEntries && !pageError"
          class="ginko:mb-4 ginko:rounded-lg ginko:border ginko:border-dashed ginko:p-4 ginko:text-sm ginko:text-muted-foreground"
        >
          {{ t('ginkoCms.studio.reviewsPage.accessRequired') }}
        </div>

        <div
          v-if="reviews.length === 0 && isLoading"
          class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
        >
          <div
            v-for="i in 5"
            :key="`review-skeleton-${i}`"
            class="ginko:border-b ginko:border-border/60 ginko:p-4 ginko:last:border-b-0"
          >
            <Skeleton class="ginko:h-5 ginko:w-56" />
            <Skeleton class="ginko:mt-3 ginko:h-4 ginko:w-3/4" />
            <div class="ginko:mt-4 ginko:flex ginko:gap-2">
              <Skeleton class="ginko:h-8 ginko:w-24" />
              <Skeleton class="ginko:h-8 ginko:w-24" />
            </div>
          </div>
        </div>

        <StudioEmptyState
          v-else-if="reviews.length === 0 && !isLoading && !pageError"
          :title="t('ginkoCms.studio.reviewsPage.empty')"
          :description="t('ginkoCms.studio.reviewsPage.emptyDescription')"
        >
          <template #icon>
            <Inbox class="ginko:size-5" aria-hidden="true" />
          </template>
        </StudioEmptyState>

        <div v-else class="ginko:space-y-3">
          <article
            v-for="request in reviews"
            :key="request._id"
            class="ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card ginko:p-4"
          >
            <div
              class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-4"
            >
              <div class="ginko:min-w-0">
                <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
                  <Badge variant="warning">
                    {{ t('ginkoCms.studio.reviewsPage.statusPending') }}
                  </Badge>
                  <Badge v-if="request.isStale" variant="destructive">
                    {{ t('ginkoCms.studio.reviewsPage.statusOutOfDate') }}
                  </Badge>
                  <Badge variant="outline">{{ statusLabel(request.reviewSummary.status) }}</Badge>
                  <Badge variant="outline">{{ requestSourceLabel(request) }}</Badge>
                </div>
                <h2 class="ginko:mt-3 ginko:text-base ginko:font-semibold">
                  {{ request.title }}
                </h2>
                <p class="ginko:mt-1 ginko:text-sm ginko:text-muted-foreground">
                  {{ request.summary }}
                </p>
              </div>

              <div class="ginko:flex ginko:items-center ginko:gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="decidingId === request._id"
                  @click="reject(request)"
                >
                  <Loader2
                    v-if="decidingId === request._id && rejectReview.pending.value"
                    class="ginko:mr-2 ginko:size-3.5 ginko:animate-spin"
                  />
                  <X v-else class="ginko:mr-2 ginko:size-3.5" />
                  {{ t('ginkoCms.studio.reviewsPage.rejectButton') }}
                </Button>
                <Button
                  size="sm"
                  :disabled="decidingId === request._id || request.isStale"
                  @click="requestApprovalConfirmation(request)"
                >
                  <Loader2
                    v-if="decidingId === request._id && approveReview.pending.value"
                    class="ginko:mr-2 ginko:size-3.5 ginko:animate-spin"
                  />
                  <Check v-else class="ginko:mr-2 ginko:size-3.5" />
                  {{ t('ginkoCms.studio.reviewsPage.approveButton') }}
                </Button>
              </div>
            </div>

            <dl
              class="ginko:mt-3 ginko:flex ginko:flex-wrap ginko:gap-x-5 ginko:gap-y-1 ginko:text-xs ginko:text-muted-foreground"
            >
              <div class="ginko:flex ginko:gap-1.5">
                <dt class="ginko:font-medium ginko:text-foreground">
                  {{ t('ginkoCms.studio.reviewsPage.affectedLocales') }}:
                </dt>
                <dd>{{ formatLocaleList(request.locales) }}</dd>
              </div>
              <div class="ginko:flex ginko:gap-1.5">
                <dt class="ginko:font-medium ginko:text-foreground">
                  {{ t('ginkoCms.studio.reviewsPage.requested') }}:
                </dt>
                <dd>
                  <NuxtTime
                    :datetime="request.createdAt"
                    :locale="dateLocale"
                    month="short"
                    day="numeric"
                    hour="2-digit"
                    minute="2-digit"
                  />
                </dd>
              </div>
              <div class="ginko:flex ginko:gap-1.5">
                <dt class="ginko:font-medium ginko:text-foreground">
                  {{ t('ginkoCms.studio.reviewsPage.requestedBy') }}:
                </dt>
                <dd>{{ requestSourceLabel(request) }}</dd>
              </div>
            </dl>

            <section
              class="ginko:mt-4 ginko:-mx-4 ginko:border-y ginko:border-border/50 ginko:bg-muted/25 ginko:px-4 ginko:py-4"
            >
              <div
                class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3"
              >
                <div class="ginko:min-w-0">
                  <div class="ginko:flex ginko:items-center ginko:gap-2">
                    <Bot
                      v-if="request.requestSource === 'agent'"
                      class="ginko:size-4 ginko:text-muted-foreground"
                    />
                    <Inbox v-else class="ginko:size-4 ginko:text-muted-foreground" />
                    <h3 class="ginko:text-sm ginko:font-medium">
                      {{ sourcePanelTitle(request) }}
                    </h3>
                  </div>
                  <div class="ginko:mt-2 ginko:max-w-3xl ginko:text-sm ginko:leading-6">
                    <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                      {{ sourceSummaryLabel(request) }}
                    </div>
                    <p class="ginko:mt-1">
                      {{ request.message || request.summary }}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" class="ginko:text-xs">
                  {{ formatLocaleList(request.locales) }}
                </Badge>
              </div>

              <dl class="ginko:mt-4 ginko:grid ginko:gap-3 ginko:text-xs ginko:sm:grid-cols-3">
                <div>
                  <dt class="ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.preparedLanguages') }}
                  </dt>
                  <dd class="ginko:mt-1 ginko:font-medium ginko:text-foreground">
                    {{ formatLocaleList(request.locales) }}
                  </dd>
                </div>
                <div>
                  <dt class="ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.publishImpact') }}
                  </dt>
                  <dd class="ginko:mt-1 ginko:font-medium ginko:text-foreground">
                    {{ reviewSummaryText(request.reviewSummary) }}
                  </dd>
                </div>
                <div>
                  <dt class="ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.publishDecision') }}
                  </dt>
                  <dd
                    class="ginko:mt-1 ginko:font-medium"
                    :class="
                      request.isStale || request.reviewSummary.blockerCount
                        ? 'ginko:text-destructive'
                        : 'ginko:text-foreground'
                    "
                  >
                    {{ approvalStatusText(request) }}
                  </dd>
                </div>
              </dl>

              <div class="ginko:mt-4 ginko:border-t ginko:border-border/60 ginko:pt-3">
                <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                  {{ preparationListTitle(request) }}
                </div>
                <ul class="ginko:mt-2 ginko:grid ginko:gap-2 ginko:text-sm ginko:sm:grid-cols-3">
                  <li
                    v-for="item in reviewPreparationItems(request)"
                    :key="`${request._id}:prepared:${item.message}`"
                    class="ginko:flex ginko:gap-2"
                  >
                    <AlertCircle
                      v-if="item.tone === 'danger' || item.tone === 'warning'"
                      class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
                      :class="reviewCheckIconClass(item)"
                    />
                    <Check
                      v-else
                      class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
                      :class="reviewCheckIconClass(item)"
                    />
                    <span>{{ item.message }}</span>
                  </li>
                </ul>
              </div>
            </section>

            <div
              class="ginko:mt-4 ginko:grid ginko:gap-5 ginko:lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]"
            >
              <section class="ginko:min-w-0">
                <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-3">
                  <h3 class="ginko:text-sm ginko:font-medium">
                    {{ t('ginkoCms.studio.reviewsPage.whatChanged') }}
                  </h3>
                  <span class="ginko:text-xs ginko:text-muted-foreground">
                    {{
                      countMessage(
                        request.reviewSummary.changeCount,
                        'ginkoCms.studio.reviewsPage.previewChangesOne',
                        'ginkoCms.studio.reviewsPage.previewChangesOther',
                      )
                    }}
                  </span>
                </div>

                <div
                  class="ginko:mt-3 ginko:divide-y ginko:divide-border/60 ginko:border-y ginko:border-border/60"
                >
                  <div
                    v-for="localeState in request.reviewSummary.localeStatuses"
                    :key="`${request._id}:locale:${localeState.locale}`"
                    class="ginko:grid ginko:gap-3 ginko:py-3 ginko:text-xs ginko:sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <div class="ginko:flex ginko:items-center ginko:gap-2">
                      <Badge variant="outline" class="ginko:font-mono">
                        {{ localeState.locale }}
                      </Badge>
                      <span>{{ statusLabel(localeState.status) }}</span>
                    </div>
                    <div class="ginko:min-w-0">
                      <div class="ginko:font-medium ginko:text-muted-foreground">
                        {{ t('ginkoCms.studio.reviewsPage.currentLivePage') }}
                      </div>
                      <div class="ginko:mt-1 ginko:truncate ginko:font-mono">
                        {{ localeState.currentHref || t('ginkoCms.studio.reviewsPage.notLiveYet') }}
                      </div>
                    </div>
                    <div class="ginko:min-w-0">
                      <div class="ginko:font-medium ginko:text-muted-foreground">
                        {{ t('ginkoCms.studio.reviewsPage.afterPublish') }}
                      </div>
                      <div class="ginko:mt-1 ginko:truncate ginko:font-mono ginko:text-foreground">
                        {{
                          localeState.nextHref || t('ginkoCms.studio.reviewsPage.noPageUrlPlanned')
                        }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="ginko:mt-4">
                  <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.affectedPages') }}
                  </div>
                  <div
                    v-if="request.reviewSummary.affectedPublicUrls.length"
                    class="ginko:mt-2 ginko:divide-y ginko:divide-border/60 ginko:border-y ginko:border-border/60"
                  >
                    <div
                      v-for="url in request.reviewSummary.affectedPublicUrls"
                      :key="`${request._id}:url:${url.locale}:${url.beforeHref}:${url.afterHref}`"
                      class="ginko:grid ginko:gap-3 ginko:py-2 ginko:text-xs ginko:sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]"
                    >
                      <span class="ginko:font-medium">{{ url.label || url.locale }}</span>
                      <div class="ginko:min-w-0">
                        <div class="ginko:font-medium ginko:text-muted-foreground">
                          {{ t('ginkoCms.studio.reviewsPage.before') }}
                        </div>
                        <div class="ginko:mt-1 ginko:truncate ginko:font-mono">
                          {{ url.beforeHref || t('ginkoCms.studio.reviewsPage.notLiveYet') }}
                        </div>
                      </div>
                      <div class="ginko:min-w-0">
                        <div class="ginko:font-medium ginko:text-muted-foreground">
                          {{ t('ginkoCms.studio.reviewsPage.after') }}
                        </div>
                        <div
                          class="ginko:mt-1 ginko:truncate ginko:font-mono ginko:text-foreground"
                        >
                          {{ url.afterHref || t('ginkoCms.studio.reviewsPage.noPageUrlPlanned') }}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p v-else class="ginko:mt-2 ginko:text-xs ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.noAffectedPages') }}
                  </p>
                </div>

                <StudioReviewWebsiteChanges :request="request" />
              </section>

              <section>
                <h3 class="ginko:text-sm ginko:font-medium">
                  {{ t('ginkoCms.studio.reviewsPage.whatToCheck') }}
                </h3>
                <ul class="ginko:mt-3 ginko:space-y-2 ginko:text-sm">
                  <li
                    v-for="item in reviewCheckItems(request)"
                    :key="`${request._id}:check:${item.message}`"
                    class="ginko:flex ginko:gap-2"
                  >
                    <AlertCircle
                      v-if="item.tone === 'danger' || item.tone === 'warning'"
                      class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
                      :class="reviewCheckIconClass(item)"
                    />
                    <Check
                      v-else
                      class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0"
                      :class="reviewCheckIconClass(item)"
                    />
                    <span>{{ item.message }}</span>
                  </li>
                </ul>

                <div v-if="request.reviewSummary.blockingIssueCodes.length" class="ginko:mt-4">
                  <div class="ginko:text-xs ginko:font-medium ginko:text-destructive-fg">
                    {{ t('ginkoCms.studio.reviewsPage.blockers') }}
                  </div>
                  <div class="ginko:mt-2 ginko:space-y-1 ginko:text-xs">
                    <div
                      v-for="code in request.reviewSummary.blockingIssueCodes"
                      :key="`${request._id}:blocker:${code}`"
                    >
                      {{ readinessIssueLabel(t, code) }}
                    </div>
                  </div>
                </div>
                <div v-if="request.reviewSummary.warningIssueCodes.length" class="ginko:mt-4">
                  <div class="ginko:text-xs ginko:font-medium ginko:text-warning-fg">
                    {{ t('ginkoCms.studio.reviewsPage.warnings') }}
                  </div>
                  <div class="ginko:mt-2 ginko:space-y-1 ginko:text-xs">
                    <div
                      v-for="code in request.reviewSummary.warningIssueCodes"
                      :key="`${request._id}:warning:${code}`"
                    >
                      {{ readinessIssueLabel(t, code) }}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <StudioDeveloperDetails class="ginko:mt-4">
              <dl class="ginko:grid ginko:gap-2 ginko:text-xs ginko:sm:grid-cols-2">
                <div>
                  <dt class="ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.requestId') }}
                  </dt>
                  <dd class="ginko:mt-1 ginko:font-mono ginko:text-foreground">
                    {{ request.operationId }}
                  </dd>
                </div>
                <div v-if="request.agentRunId">
                  <dt class="ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.agentSessionId') }}
                  </dt>
                  <dd class="ginko:mt-1 ginko:font-mono ginko:text-foreground">
                    {{ request.agentRunId }}
                  </dd>
                </div>
                <div>
                  <dt class="ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.entryId') }}
                  </dt>
                  <dd class="ginko:mt-1 ginko:font-mono ginko:text-foreground">
                    {{ request.entryId }}
                  </dd>
                </div>
                <div>
                  <dt class="ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.expectedDraftVersion') }}
                  </dt>
                  <dd class="ginko:mt-1 ginko:font-mono ginko:text-foreground">
                    {{ request.expectedVersion }}
                  </dd>
                </div>
              </dl>
              <pre class="ginko:max-h-48 ginko:overflow-auto ginko:text-xs ginko:leading-relaxed">{{
                formatJson(request.preview)
              }}</pre>
            </StudioDeveloperDetails>
          </article>
        </div>

        <Dialog
          :open="!!approvalCandidate"
          @update:open="approvalCandidate = $event ? approvalCandidate : null"
        >
          <DialogContent class="ginko:sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{{ t('ginkoCms.studio.reviewsPage.approvalDialogTitle') }}</DialogTitle>
              <DialogDescription>
                {{ t('ginkoCms.studio.reviewsPage.approvalDialogDescription') }}
              </DialogDescription>
            </DialogHeader>

            <div v-if="approvalCandidate" class="ginko:space-y-4">
              <div
                class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3"
              >
                <div class="ginko:text-sm ginko:font-medium">
                  {{ approvalCandidate.title }}
                </div>
                <p class="ginko:mt-1 ginko:text-sm ginko:text-muted-foreground">
                  {{ approvalCandidate.summary }}
                </p>
              </div>

              <dl class="ginko:grid ginko:gap-3 ginko:text-sm ginko:sm:grid-cols-2">
                <div>
                  <dt class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.affectedLocales') }}
                  </dt>
                  <dd class="ginko:mt-1">{{ approvalCandidate.locales.join(', ') }}</dd>
                </div>
                <div>
                  <dt class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.versionState') }}
                  </dt>
                  <dd class="ginko:mt-1">
                    {{
                      approvalCandidate.isStale
                        ? t('ginkoCms.studio.reviewsPage.outOfDateRequest')
                        : t('ginkoCms.studio.reviewsPage.currentDraftRequest')
                    }}
                  </dd>
                </div>
                <div>
                  <dt class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.publishImpact') }}
                  </dt>
                  <dd class="ginko:mt-1">
                    {{ reviewSummaryText(approvalCandidate.reviewSummary) }}
                  </dd>
                </div>
                <div>
                  <dt class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.requestedBy') }}
                  </dt>
                  <dd class="ginko:mt-1">{{ requestSourceLabel(approvalCandidate) }}</dd>
                </div>
                <div>
                  <dt class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.requested') }}
                  </dt>
                  <dd class="ginko:mt-1">
                    <NuxtTime
                      :datetime="approvalCandidate.createdAt"
                      :locale="dateLocale"
                      month="short"
                      day="numeric"
                      hour="2-digit"
                      minute="2-digit"
                    />
                  </dd>
                </div>
              </dl>

              <StudioDeveloperDetails>
                <dl class="ginko:grid ginko:gap-2 ginko:text-xs">
                  <div>
                    <dt class="ginko:text-muted-foreground">
                      {{ t('ginkoCms.studio.reviewsPage.requestId') }}
                    </dt>
                    <dd class="ginko:mt-1 ginko:font-mono">{{ approvalCandidate.operationId }}</dd>
                  </div>
                  <div>
                    <dt class="ginko:text-muted-foreground">
                      {{ t('ginkoCms.studio.reviewsPage.entryId') }}
                    </dt>
                    <dd class="ginko:mt-1 ginko:font-mono">{{ approvalCandidate.entryId }}</dd>
                  </div>
                </dl>
              </StudioDeveloperDetails>

              <div
                v-if="approvalCandidate.staleReason"
                class="ginko:rounded-md ginko:border ginko:border-destructive/25 ginko:bg-destructive/10 ginko:p-3 ginko:text-sm ginko:text-destructive-fg"
              >
                {{ approvalCandidate.staleReason }}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" @click="approvalCandidate = null">
                {{ t('ginkoCms.common.cancel') }}
              </Button>
              <Button
                :disabled="
                  !approvalCandidate ||
                  approvalCandidate.isStale ||
                  decidingId === approvalCandidate._id
                "
                @click="confirmApproval"
              >
                <Loader2
                  v-if="
                    approvalCandidate &&
                    decidingId === approvalCandidate._id &&
                    approveReview.pending.value
                  "
                  class="ginko:mr-2 ginko:size-3.5 ginko:animate-spin"
                />
                <Check v-else class="ginko:mr-2 ginko:size-3.5" />
                {{ t('ginkoCms.studio.reviewsPage.approveButton') }}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  </StudioWorkspace>
</template>
