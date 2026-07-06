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
const approvalCandidate = ref<ReviewRequest | null>(null)

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

function countArrayField(value: Record<string, unknown>, key: string): number {
  const field = value[key]
  return Array.isArray(field) ? field.length : 0
}

function previewSummaryCount(key: string, count: number): string {
  return t(`ginkoCms.studio.reviewsPage.${key}${count === 1 ? 'One' : 'Other'}`, { count })
}

function previewSummary(value: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof value.status === 'string') parts.push(value.status)
  const changes = countArrayField(value, 'changes')
  const blockers =
    countArrayField(value, 'blockingDiagnostics') || countArrayField(value, 'blockers')
  const warnings = countArrayField(value, 'warnings')
  const cacheTags = countArrayField(value, 'cacheTags')
  const events = countArrayField(value, 'events')
  if (changes) parts.push(previewSummaryCount('previewChanges', changes))
  if (blockers) parts.push(previewSummaryCount('previewBlockers', blockers))
  if (warnings) parts.push(previewSummaryCount('previewWarnings', warnings))
  if (cacheTags) parts.push(previewSummaryCount('previewCacheTags', cacheTags))
  if (events) parts.push(previewSummaryCount('previewEvents', events))
  return parts.join(' · ') || t('ginkoCms.studio.reviewsPage.previewSummaryFallback')
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
          Approvals require publish access.
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
                  <Badge v-if="request.isStale" variant="destructive">Out of date</Badge>
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
                  @click="requestApprovalConfirmation(request)"
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
                <dt class="ginko:font-medium ginko:text-foreground">Locales</dt>
                <dd class="ginko:mt-1">{{ request.locales.join(', ') }}</dd>
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
                  {{ t('ginkoCms.studio.reviewsPage.publishDecision') }}
                </h3>
                <div
                  class="ginko:mt-2 ginko:space-y-2 ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3 ginko:text-xs"
                >
                  <div v-if="request.staleReason" class="ginko:text-destructive">
                    {{ request.staleReason }}
                  </div>
                  <div>
                    <span class="ginko:text-muted-foreground">
                      {{ t('ginkoCms.studio.reviewsPage.affectedLocales') }}:
                    </span>
                    {{ request.locales.join(', ') }}
                  </div>
                  <div>
                    <span class="ginko:text-muted-foreground">
                      {{ t('ginkoCms.studio.reviewsPage.versionState') }}:
                    </span>
                    {{
                      request.isStale
                        ? t('ginkoCms.studio.reviewsPage.outOfDateRequest')
                        : t('ginkoCms.studio.reviewsPage.currentDraftRequest')
                    }}
                  </div>
                  <div v-if="request.message">
                    <span class="ginko:text-muted-foreground">
                      {{ t('ginkoCms.studio.reviewsPage.message') }}:
                    </span>
                    {{ request.message }}
                  </div>
                </div>
              </div>
              <div>
                <h3 class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                  {{ t('ginkoCms.studio.reviewsPage.proposedChanges') }}
                </h3>
                <div
                  class="ginko:mt-2 ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3 ginko:text-xs ginko:leading-relaxed ginko:text-muted-foreground"
                >
                  {{ t('ginkoCms.studio.reviewsPage.proposedChangesDescription') }}
                </div>
              </div>
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
                <div>
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
                    {{ t('ginkoCms.studio.reviewsPage.expectedDraftVersion') }}
                  </dt>
                  <dd class="ginko:mt-1 ginko:font-mono">
                    {{ approvalCandidate.expectedVersion }}
                  </dd>
                </div>
                <div>
                  <dt class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.publishImpact') }}
                  </dt>
                  <dd class="ginko:mt-1">{{ previewSummary(approvalCandidate.preview) }}</dd>
                </div>
                <div>
                  <dt class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.reviewsPage.requestedBy') }}
                  </dt>
                  <dd class="ginko:mt-1 ginko:font-mono">
                    {{ shortId(approvalCandidate.requestedBy) }}
                  </dd>
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
