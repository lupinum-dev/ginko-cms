<script setup lang="ts">
import { AlertCircle, Bot, Check, Inbox } from '@lucide/vue'

import { useStudioReviewPresentation } from '../../../composables/useStudioReviewPresentation'
import { readinessIssueLabel } from '../../../lib/publicWorkflow'
import type { StudioReviewRequest } from '../../../lib/studioReviewRequests'
import StudioReviewWebsiteChanges from './StudioReviewWebsiteChanges.vue'

// Full website-change detail for one review request. Extracted from reviews.vue
// so it renders identically inline in the list card AND inside the right-sidebar
// StudioReviewDetailsPanel (RFC Phase 5 step 5 / D4 — reuse, don't duplicate).
defineProps<{
  request: StudioReviewRequest
}>()

const {
  t,
  countMessage,
  statusLabel,
  reviewSummaryText,
  sourcePanelTitle,
  sourceSummaryLabel,
  preparationListTitle,
  formatLocaleList,
  approvalStatusText,
  reviewPreparationItems,
  reviewCheckItems,
  reviewCheckIconClass,
  formatJson,
} = useStudioReviewPresentation()
</script>

<template>
  <div>
    <section
      class="ginko:mt-4 ginko:-mx-4 ginko:border-y ginko:border-border/50 ginko:bg-muted/25 ginko:px-4 ginko:py-4"
    >
      <div class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3">
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

      <dl class="ginko:mt-4 ginko:grid ginko:gap-3 ginko:text-xs ginko:@2xl:grid-cols-3">
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
        <ul class="ginko:mt-2 ginko:grid ginko:gap-2 ginko:text-sm ginko:@2xl:grid-cols-3">
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
      class="ginko:mt-4 ginko:grid ginko:gap-5 ginko:@3xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]"
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
            class="ginko:grid ginko:gap-3 ginko:py-3 ginko:text-xs ginko:@2xl:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]"
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
                {{ localeState.nextHref || t('ginkoCms.studio.reviewsPage.noPageUrlPlanned') }}
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
              class="ginko:grid ginko:gap-3 ginko:py-2 ginko:text-xs ginko:@2xl:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]"
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
                <div class="ginko:mt-1 ginko:truncate ginko:font-mono ginko:text-foreground">
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
      <dl class="ginko:grid ginko:gap-2 ginko:text-xs ginko:@2xl:grid-cols-2">
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
  </div>
</template>
