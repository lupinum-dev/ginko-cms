<script setup lang="ts">
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { AlertCircle, Check, Inbox, Loader2, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { api } from '../boundary/api'
import { cmsPermissionKeys } from '../composables/permissions'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioQuery } from '../composables/useCmsStudioQuery'
import { useConvexMutation } from '../composables/useStudioConvex'

type ReviewRequest = {
  _id: string
  agentRunId: string
  operationId: string
  entryId: string
  locales: string[]
  expectedVersion: number
  message: string | null
  title: string
  summary: string
  status: 'pending' | 'approved' | 'rejected'
  preview: Record<string, unknown>
  requestedBy: string
  reviewedBy: string | null
  createdAt: number
  updatedAt: number
  reviewedAt: number | null
  versionHash: string | null
  isStale: boolean
  staleReason: string | null
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

const reviews = computed<ReviewRequest[]>(() => (reviewsQuery.data.value ?? []) as ReviewRequest[])
const isLoading = computed(() => reviewsQuery.data.value === null && reviewsQuery.pending.value)
const pageError = computed(() =>
  reviewsQuery.error.value
    ? getCmsErrorMessage(reviewsQuery.error.value, t('ginkoCms.studio.reviewsPage.loadError'))
    : '',
)

function shortId(value: string | null): string {
  if (!value) return '-'
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function formatJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}

async function approve(request: ReviewRequest) {
  decisionError.value = ''
  decidingId.value = request._id
  try {
    await approveReview({
      reviewRequestId: request._id,
      expectedVersionHash: request.versionHash,
    })
    await reviewsQuery.refresh()
  } catch (error) {
    decisionError.value = getCmsErrorMessage(error, t('ginkoCms.studio.reviewsPage.approveError'))
  } finally {
    decidingId.value = null
  }
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
        eyebrow="Agent review"
        description="Approve or reject pending agent publish requests."
      >
        <template #actions>
          <Badge variant="outline" class="ginko:text-xs"> {{ reviews.length }} pending </Badge>
        </template>
      </StudioPageHeader>
    </template>

    <ScrollArea class="ginko:flex-1">
      <div class="studio-page-content ginko:p-4 ginko:sm:p-5 ginko:lg:p-6">
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
          Review requests require publish access.
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
                  <Badge variant="warning">Pending</Badge>
                  <Badge v-if="request.isStale" variant="destructive">Stale</Badge>
                  <Badge variant="outline">{{ request.operationId }}</Badge>
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
                  Reject
                </Button>
                <Button
                  size="sm"
                  :disabled="decidingId === request._id || request.isStale"
                  @click="approve(request)"
                >
                  <Loader2
                    v-if="decidingId === request._id && approveReview.pending.value"
                    class="ginko:mr-2 ginko:size-3.5 ginko:animate-spin"
                  />
                  <Check v-else class="ginko:mr-2 ginko:size-3.5" />
                  Approve
                </Button>
              </div>
            </div>

            <dl
              class="ginko:mt-4 ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:sm:grid-cols-2 ginko:lg:grid-cols-4"
            >
              <div>
                <dt class="ginko:font-medium ginko:text-foreground">Requested by</dt>
                <dd class="ginko:mt-1 ginko:font-mono">{{ shortId(request.requestedBy) }}</dd>
              </div>
              <div>
                <dt class="ginko:font-medium ginko:text-foreground">Agent run</dt>
                <dd class="ginko:mt-1 ginko:font-mono">{{ shortId(request.agentRunId) }}</dd>
              </div>
              <div>
                <dt class="ginko:font-medium ginko:text-foreground">Target entry</dt>
                <dd class="ginko:mt-1 ginko:font-mono">{{ shortId(request.entryId) }}</dd>
              </div>
              <div>
                <dt class="ginko:font-medium ginko:text-foreground">Requested</dt>
                <dd class="ginko:mt-1">
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
            </dl>

            <div class="ginko:mt-4 ginko:grid ginko:gap-3 ginko:lg:grid-cols-2">
              <div>
                <h3 class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                  Publish request
                </h3>
                <div
                  class="ginko:mt-2 ginko:space-y-2 ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3 ginko:text-xs"
                >
                  <div v-if="request.staleReason" class="ginko:text-destructive">
                    {{ request.staleReason }}
                  </div>
                  <div>
                    <span class="ginko:text-muted-foreground">Locales:</span>
                    {{ request.locales.join(', ') }}
                  </div>
                  <div>
                    <span class="ginko:text-muted-foreground">Expected version:</span>
                    {{ request.expectedVersion }}
                  </div>
                  <div v-if="request.message">
                    <span class="ginko:text-muted-foreground">Message:</span>
                    {{ request.message }}
                  </div>
                </div>
              </div>
              <div>
                <h3 class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">Preview</h3>
                <pre
                  class="ginko:mt-2 ginko:max-h-48 ginko:overflow-auto ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3 ginko:text-xs ginko:leading-relaxed"
                  >{{ formatJson(request.preview) }}</pre
                >
              </div>
            </div>
          </article>
        </div>
      </div>
    </ScrollArea>
  </StudioWorkspace>
</template>
