<script setup lang="ts">
import { Check, Inbox, Loader2, PanelRight, X } from '@lucide/vue'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, ref, watch } from 'vue'

import { api } from '../boundary/api'
import StudioReviewDetail from '../components/studio/reviews/StudioReviewDetail.vue'
import StudioReviewDetailsPanel from '../components/studio/reviews/StudioReviewDetailsPanel.vue'
import { cmsPermissionKeys } from '../composables/permissions'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioQuery } from '../composables/useCmsStudioQuery'
import { useRightSidebar, useRightSidebarPanel } from '../composables/useRightSidebar'
import { useStudioReviewPresentation } from '../composables/useStudioReviewPresentation'
import { useConvexMutation } from '../composables/useStudioConvex'
import type { StudioReviewRequest } from '../lib/studioReviewRequests'

type ReviewRequest = StudioReviewRequest

const { t, dateLocale, statusLabel, reviewSummaryText, requestSourceLabel, formatLocaleList } =
  useStudioReviewPresentation()
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

// The selected review's full detail moves to the right-sidebar panel (RFC Phase 5
// step 5 / D4). Selection lives here so the panel — which renders in the layout
// tree, not this page subtree — can reach it through the props getter. The same
// StudioReviewDetail component still renders inline in each list card.
const selectedReviewId = ref<string | null>(null)
const selectedReview = computed<ReviewRequest | null>(
  () => reviews.value.find((review) => review._id === selectedReviewId.value) ?? null,
)
const rightSidebar = useRightSidebar()
// Mirror of the auto-open in selectReview: when the selection disappears
// (request decided/withdrawn), an open panel showing nothing is dead space.
watch(
  () => selectedReview.value,
  (review, previous) => {
    if (!review && previous && !rightSidebar.isMobile.value) {
      rightSidebar.setOpen(false)
    }
  },
)
useRightSidebarPanel({
  title: () => t('ginkoCms.studio.reviewDetails.title'),
  component: StudioReviewDetailsPanel,
  props: () => ({ request: selectedReview.value }),
  defaultOpen: false,
  compact: true,
})

function selectReview(request: ReviewRequest) {
  selectedReviewId.value = request._id
  if (rightSidebar.isMobile.value) {
    rightSidebar.setOpenMobile(true)
  } else {
    rightSidebar.setOpen(true)
  }
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
      <StudioPageBody>
        <StudioNotice
          v-if="pageError || decisionError"
          tone="danger"
          :description="pageError || decisionError"
          class="ginko:mb-4"
        />

        <StudioNotice
          v-if="!canPublishEntries && !pageError"
          tone="info"
          :description="t('ginkoCms.studio.reviewsPage.accessRequired')"
          class="ginko:mb-4"
        />

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
            :class="
              selectedReviewId === request._id
                ? 'ginko:ring-2 ginko:ring-primary/40'
                : ''
            "
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
                  variant="ghost"
                  size="sm"
                  :aria-pressed="selectedReviewId === request._id"
                  @click="selectReview(request)"
                >
                  <PanelRight class="ginko:mr-2 ginko:size-3.5" />
                  {{ t('ginkoCms.studio.reviewsPage.viewDetails') }}
                </Button>
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

            <StudioReviewDetail :request="request" />
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

              <StudioNotice
                v-if="approvalCandidate.staleReason"
                tone="danger"
                :description="approvalCandidate.staleReason"
              />
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
      </StudioPageBody>
    </ScrollArea>
  </StudioWorkspace>
</template>
