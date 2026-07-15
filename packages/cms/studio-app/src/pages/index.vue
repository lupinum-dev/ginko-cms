<script setup lang="ts">
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  FileText,
  Inbox,
  Languages,
  RefreshCw,
  Workflow,
} from '@lucide/vue'
import { computed } from 'vue'

import { api } from '../boundary/api'
import { cmsPermissionKeys } from '../composables/permissions'
import { useCmsConfig } from '../composables/useCmsConfig'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioPaginatedQuery } from '../composables/useCmsStudioPaginatedQuery'
import { useCmsStudioQuery } from '../composables/useCmsStudioQuery'
import { useCmsStudioSettings } from '../composables/useCmsStudioSettings'
import {
  codeDefinedCollectionList,
  type StudioCollectionListItem,
} from '../lib/codeDefinedCollections'
import {
  deriveStudioWorkQueueSummary,
  websiteRefreshStatusLabel,
  websiteRefreshStatusMessage,
} from '../lib/publicWorkflow'
import type { StudioReviewRequest } from '../lib/studioReviewRequests'

type OverviewEntry = {
  entryId: string
  collection: string
  collectionLabel?: string
  title: string
  path?: string
  status: string
  publicState: string
  updatedAt: number
  publishedAt?: number | null
  blockingIssueCount?: number
  missingTranslationLocales?: string[]
  nextAction?: string
  workflowSummary?: {
    workStatesByLocale: Record<string, string>
    issueCounts: {
      blocker: number
      warning: number
      info: number
    }
    missingLocales: string[]
    nextAction: {
      kind: string
      locale: string | null
      target: string
      params: Record<string, unknown>
    }
  }
}

type OverviewRun = {
  id: string
  status: string
  paths?: string[]
  entryCount?: number
  lastError?: string | null
  createdAt: number
  updatedAt?: number
}

type Overview = {
  counts?: Record<string, number>
  collections?: Array<Record<string, unknown>>
  changedDrafts?: OverviewEntry[]
  readyToPreview?: OverviewEntry[]
  blocked?: OverviewEntry[]
  missingTranslations?: OverviewEntry[]
  recentPublished?: OverviewEntry[]
  revalidationJobs?: OverviewRun[]
  activity?: Array<{
    _id: string
    summary: string
    displaySummary: string
    kind: string
    locale: string | null
    createdAt: number
  }>
}

type ReviewRequest = StudioReviewRequest

type WorkQueueMetric = {
  key: string
  label: string
  description: string
  value: number | string
  icon: unknown
  tone: 'danger' | 'warning' | 'info' | 'neutral'
  to?: string
}

const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const reviewsRoute = `${studioRoute}/reviews`
const studioSettings = useCmsStudioSettings()
const locale = computed(() => studioSettings.defaultLocale.value)
const { can } = useCmsStudioAccess()
const canManageSettings = can(cmsPermissionKeys.manageSettings)
const canPublishEntries = can(cmsPermissionKeys.publishEntries)
const { dateLocale, t } = useCmsI18n()

const overviewQuery = useCmsStudioQuery(
  api.ginkoCms.editor.getStudioOverview,
  computed(() => ({ locale: locale.value })),
)
const collectionsQuery = useCmsStudioQuery(api.ginkoCms.collections.listCollections, {})
const activityQuery = useCmsStudioPaginatedQuery(
  api.ginkoCms.editor.listActivity,
  {},
  { initialNumItems: 8 },
)
const reviewsQuery = useCmsStudioQuery(
  api.ginkoCms.reviewRequests.listPendingReviews,
  { limit: 8 },
  { requiredCapability: cmsPermissionKeys.publishEntries },
)

const hostCollections = computed(() =>
  codeDefinedCollectionList(cmsConfig.collections, cmsConfig.defaultLocale),
)
const collections = computed(() => {
  const fromConvex = (collectionsQuery.data.value ?? []) as StudioCollectionListItem[]
  if (!hostCollections.value.length) return fromConvex
  const bySlug = new Map(fromConvex.map((collection) => [collection.slug, collection]))
  return hostCollections.value.map((hostCollection) => ({
    ...hostCollection,
    ...bySlug.get(hostCollection.slug),
    label: bySlug.get(hostCollection.slug)?.label || hostCollection.label,
  }))
})
const overview = computed(() => (overviewQuery.data.value ?? null) as Overview | null)
const overviewReady = computed(
  () => !!overview.value && !overviewQuery.pending.value && !overviewQuery.error.value,
)
const workQueue = computed(() =>
  deriveStudioWorkQueueSummary({
    needsAttention: overview.value?.counts?.needsAttention,
    changedDrafts: overview.value?.counts?.changedDrafts,
    missingTranslations: overview.value?.counts?.missingTranslations,
    failedRevalidation: overview.value?.counts?.failedRevalidation,
    pendingRevalidation: overview.value?.counts?.pendingRevalidation,
  }),
)
const workQueueRows = computed<WorkQueueMetric[]>(() => {
  const loadingValue = overviewReady.value ? null : '...'
  const reviewsLoadingValue =
    canPublishEntries.value && reviewsQuery.pending.value && reviewsQuery.data.value === null
      ? '...'
      : null
  const rows: WorkQueueMetric[] = [
    {
      key: 'needsAttention',
      label: 'Needs attention',
      description: 'Start here when publishing is blocked or website updates need review.',
      value: loadingValue ?? workQueue.value.needsAttention,
      icon: AlertCircle,
      tone: workQueue.value.needsAttention > 0 ? 'danger' : 'neutral',
      to: contentRoute,
    },
    {
      key: 'readyToPreview',
      label: 'Ready to preview',
      description: 'Drafts with no known blockers. Review website changes before publishing.',
      value: loadingValue ?? overview.value?.counts?.readyToPreview ?? 0,
      icon: CheckCircle2,
      tone: (overview.value?.counts?.readyToPreview ?? 0) > 0 ? 'info' : 'neutral',
      to: contentRoute,
    },
    {
      key: 'changedDrafts',
      label: 'Continue editing',
      description: 'Draft edits waiting for preview, review, or publishing.',
      value: loadingValue ?? workQueue.value.changedDrafts,
      icon: FileText,
      tone: workQueue.value.changedDrafts > 0 ? 'info' : 'neutral',
      to: contentRoute,
    },
    {
      key: 'missingTranslations',
      label: 'Missing languages',
      description: 'Language versions that still need content before the website is complete.',
      value: loadingValue ?? workQueue.value.missingTranslations,
      icon: Languages,
      tone: workQueue.value.missingTranslations > 0 ? 'warning' : 'neutral',
      to: contentRoute,
    },
  ]

  if (canPublishEntries.value) {
    rows.push({
      key: 'readyForReview',
      label: 'Ready for review',
      description: 'Publish requests waiting for a human decision.',
      value: reviewsLoadingValue ?? pendingReviews.value.length,
      icon: Inbox,
      tone: pendingReviews.value.length > 0 ? 'warning' : 'neutral',
      to: reviewsRoute,
    })
  }

  if (reviewsLoadingValue !== null || aiPreparedReviews.value.length > 0) {
    rows.push({
      key: 'aiPrepared',
      label: 'AI prepared',
      description: 'AI-submitted website changes waiting for review.',
      value: reviewsLoadingValue ?? aiPreparedReviews.value.length,
      icon: Bot,
      tone: aiPreparedReviews.value.length > 0 ? 'info' : 'neutral',
      to: reviewsRoute,
    })
  }

  if (!overviewReady.value || workQueue.value.failedRevalidation > 0) {
    rows.push({
      key: 'failedRevalidation',
      label: 'Website refresh',
      description: 'Failed website refreshes that can affect recently published content.',
      value: loadingValue ?? workQueue.value.failedRevalidation,
      icon: RefreshCw,
      tone: workQueue.value.failedRevalidation > 0 ? 'danger' : 'neutral',
    })
  }

  return rows
})
// Only queues with work (or still loading) render — a zero-count row is noise
// (design review, principle 5). With nothing queued the section collapses to a
// single all-caught-up state.
const visibleQueueRows = computed(() =>
  workQueueRows.value.filter(
    (row) => row.value === '...' || (typeof row.value === 'number' && row.value > 0),
  ),
)
const allCaughtUp = computed(() => overviewReady.value && visibleQueueRows.value.length === 0)
const collectionRows = computed(() => {
  if (overview.value?.collections?.length) return overview.value.collections
  return collections.value.map((collection) => ({
    slug: collection.slug,
    label: collection.label,
    routeMode: collection.mode === 'none' ? 'none' : 'route',
    type: collection.type,
    locales: collection.locales ?? [],
    entryCount: collection.entryCount ?? 0,
    changedDrafts: 0,
    blocked: 0,
    missingTranslations: 0,
  }))
})
const recentActivity = computed(() => overview.value?.activity ?? activityQuery.results.value)
const recentActivityCapped = computed(() => recentActivity.value.slice(0, 6))
const pendingReviews = computed<ReviewRequest[]>(
  () => (reviewsQuery.data.value ?? []) as ReviewRequest[],
)
const aiPreparedReviews = computed(() =>
  pendingReviews.value.filter((request) => request.requestSource === 'agent'),
)
function entryHref(entry: OverviewEntry) {
  return `${contentRoute}/${entry.collection}/${entry.entryId}`
}

function blockerCount(entry: OverviewEntry) {
  return entry.workflowSummary?.issueCounts.blocker ?? entry.blockingIssueCount ?? 0
}

function routeModeLabel(mode: unknown) {
  return mode === 'none' ? 'Shared data' : 'Website pages'
}

function metricToneClass(tone: WorkQueueMetric['tone']) {
  switch (tone) {
    case 'danger':
      return 'ginko:border-destructive/40 ginko:bg-destructive/10 ginko:text-destructive-fg'
    case 'warning':
      return 'ginko:border-warning/40 ginko:bg-warning/10 ginko:text-warning-fg'
    case 'info':
      return 'ginko:border-primary/30 ginko:bg-primary/5 ginko:text-primary'
    default:
      return 'ginko:border-border ginko:bg-card ginko:text-muted-foreground'
  }
}
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader
        :title="t('ginkoCms.studio.dashboard.title')"
        :description="t('ginkoCms.studio.dashboard.headerDescription')"
      >
      </StudioPageHeader>
    </template>

    <ScrollArea class="ginko:flex-1">
      <StudioPageBody width="wide" class="ginko:space-y-6">
        <StudioNotice
          v-if="overviewQuery.error.value"
          tone="danger"
          :title="t('ginkoCms.studio.dashboard.overviewLoadErrorTitle')"
          :description="t('ginkoCms.studio.dashboard.overviewLoadErrorDescription')"
        />

        <section
          :aria-label="t('ginkoCms.studio.dashboard.title')"
          class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
        >
          <div class="ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3">
            <h2 class="studio-text-title">
              {{ t('ginkoCms.studio.dashboard.today') }}
            </h2>
            <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.dashboard.todayDescription') }}
            </p>
          </div>
          <StudioEmptyState
            v-if="allCaughtUp"
            :title="t('ginkoCms.studio.dashboard.allCaughtUpTitle')"
            :description="t('ginkoCms.studio.dashboard.allCaughtUpDescription')"
            class="ginko:m-4"
          />
          <div v-else class="ginko:divide-y ginko:divide-border/70">
            <component
              :is="row.to ? 'RouterLink' : 'div'"
              v-for="row in visibleQueueRows"
              :key="row.key"
              :to="row.to"
              class="ginko:grid ginko:gap-3 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:@2xl:grid-cols-[2.5rem_minmax(0,1fr)_5rem] ginko:hover:bg-accent/40"
            >
              <div
                class="ginko:grid ginko:size-9 ginko:place-items-center ginko:rounded-md ginko:border"
                :class="metricToneClass(row.tone)"
              >
                <component :is="row.icon" class="ginko:size-4" />
              </div>
              <div class="ginko:min-w-0">
                <div class="ginko:text-sm ginko:font-medium">{{ row.label }}</div>
                <p class="ginko:mt-0.5 ginko:text-xs ginko:leading-4 ginko:text-muted-foreground">
                  {{ row.description }}
                </p>
              </div>
              <div
                class="ginko:self-center ginko:text-2xl ginko:font-semibold ginko:tabular-nums ginko:@2xl:text-right"
              >
                {{ row.value }}
              </div>
            </component>
          </div>
        </section>


        <div
          class="ginko:grid ginko:min-w-0 ginko:gap-6 ginko:@5xl:grid-cols-[minmax(0,1.4fr)_minmax(24rem,0.6fr)]"
        >
          <div class="ginko:min-w-0 ginko:space-y-6">



            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div
                class="ginko:flex ginko:items-center ginko:justify-between ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3"
              >
                <div>
                  <h2 class="studio-text-title">Blocked from publishing</h2>
                  <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                    Content with issues to fix before the website can change.
                  </p>
                </div>
                <Badge variant="outline" class="ginko:text-xs">
                  {{ overview?.blocked?.length ?? 0 }}
                </Badge>
              </div>
              <div v-if="overview?.blocked?.length" class="ginko:divide-y ginko:divide-border/70">
                <RouterLink
                  v-for="entry in overview.blocked"
                  :key="`blocked:${entry.entryId}`"
                  :to="entryHref(entry)"
                  class="ginko:grid ginko:gap-3 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:hover:bg-accent/40 ginko:@2xl:grid-cols-[minmax(0,1fr)_10rem_2rem]"
                >
                  <div class="ginko:min-w-0">
                    <div class="ginko:truncate ginko:text-sm ginko:font-medium">
                      {{ entry.title }}
                    </div>
                    <div
                      class="ginko:mt-0.5 ginko:truncate ginko:text-xs ginko:text-muted-foreground"
                    >
                      {{ entry.collectionLabel || entry.collection }}
                    </div>
                  </div>
                  <div
                    class="ginko:self-center ginko:text-xs ginko:text-muted-foreground ginko:@2xl:text-right"
                  >
                    {{ blockerCount(entry) }} publish issue{{
                      blockerCount(entry) === 1 ? '' : 's'
                    }}
                  </div>
                  <AlertCircle
                    class="ginko:self-center ginko:size-4 ginko:text-destructive ginko:@2xl:justify-self-end"
                  />
                </RouterLink>
              </div>
              <StudioEmptyState
                v-else
                title="No publish blockers"
                description="The current work queue has no publish blockers."
                class="ginko:m-4"
              />
            </section>

            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div class="ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3">
                <h2 class="studio-text-title">Content overview</h2>
                <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                  Content types, website use, drafts, and translation gaps.
                </p>
              </div>
              <div class="ginko:overflow-x-auto">
                <div class="ginko:min-w-[46rem]">
                  <div
                    class="ginko:grid ginko:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem_8rem] ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
                  >
                    <div>Collection</div>
                    <div>Website use</div>
                    <div>Entries</div>
                    <div>Drafts</div>
                    <div>Translations</div>
                  </div>
                  <RouterLink
                    v-for="collection in collectionRows"
                    :key="String(collection.slug)"
                    :to="`${contentRoute}/${collection.slug}`"
                    class="ginko:grid ginko:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem_8rem] ginko:items-center ginko:border-b ginko:border-border/60 ginko:px-4 ginko:py-3 ginko:text-sm ginko:transition-colors ginko:last:border-b-0 ginko:hover:bg-accent/40"
                  >
                    <div class="ginko:min-w-0">
                      <div class="ginko:truncate ginko:font-medium">{{ collection.label }}</div>
                    </div>
                    <div class="ginko:text-xs ginko:text-muted-foreground">
                      {{ routeModeLabel(collection.routeMode) }}
                    </div>
                    <div class="ginko:font-medium ginko:tabular-nums">
                      {{ collection.entryCount }}
                    </div>
                    <div class="ginko:tabular-nums ginko:text-muted-foreground">
                      {{ collection.changedDrafts }}
                    </div>
                    <div class="ginko:tabular-nums ginko:text-muted-foreground">
                      {{ collection.missingTranslations }}
                    </div>
                  </RouterLink>
                </div>
              </div>
            </section>
          </div>

          <aside class="ginko:min-w-0 ginko:space-y-6">
            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div
                class="ginko:flex ginko:items-center ginko:gap-2 ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3"
              >
                <Workflow class="ginko:size-4 ginko:text-muted-foreground" />
                <h2 class="studio-text-title">Track website updates</h2>
              </div>
              <div class="ginko:space-y-3 ginko:p-4">
                <div
                  v-if="!overviewReady"
                  class="ginko:flex ginko:items-start ginko:gap-2 ginko:text-sm"
                >
                  <RefreshCw
                    class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-muted-foreground"
                  />
                  <div>
                    <div class="ginko:font-medium">Website update status unavailable</div>
                    <div class="ginko:text-xs ginko:text-muted-foreground">
                      Studio is still loading website refresh status.
                    </div>
                  </div>
                </div>
                <div
                  v-else-if="workQueue.healthy"
                  class="ginko:flex ginko:items-start ginko:gap-2 ginko:text-sm"
                >
                  <CheckCircle2
                    class="ginko:mt-0.5 ginko:size-4 ginko:shrink-0 ginko:text-success"
                  />
                  <div>
                    <div class="ginko:font-medium">No blocked website updates</div>
                    <div class="ginko:text-xs ginko:text-muted-foreground">
                      Website refreshes are healthy.
                    </div>
                  </div>
                </div>
                <div
                  v-for="job in overview?.revalidationJobs ?? []"
                  :key="`job:${job.id}`"
                  class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3 ginko:text-sm"
                >
                  <div class="ginko:font-medium">
                    {{ websiteRefreshStatusLabel(t, job.status) }}
                  </div>
                  <div class="ginko:mt-1 ginko:truncate ginko:text-xs ginko:text-muted-foreground">
                    {{ websiteRefreshStatusMessage(t, job) }}
                  </div>
                </div>
              </div>
            </section>

            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div class="ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3">
                <h2 class="studio-text-title">{{ t('ginkoCms.studio.dashboard.alreadyLive') }}</h2>
              </div>
              <div
                v-if="overview?.recentPublished?.length"
                class="ginko:divide-y ginko:divide-border/70"
              >
                <RouterLink
                  v-for="entry in overview.recentPublished"
                  :key="`published:${entry.entryId}`"
                  :to="entryHref(entry)"
                  class="ginko:block ginko:px-4 ginko:py-3 ginko:transition-colors ginko:hover:bg-accent/40"
                >
                  <div class="ginko:truncate ginko:text-sm ginko:font-medium">
                    {{ entry.title }}
                  </div>
                  <div class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                    <NuxtTime
                      v-if="entry.publishedAt"
                      :datetime="entry.publishedAt"
                      :locale="dateLocale"
                      month="short"
                      day="numeric"
                      hour="2-digit"
                      minute="2-digit"
                    />
                  </div>
                </RouterLink>
              </div>
              <StudioEmptyState
                v-else
                title="Nothing live yet"
                description="Published entries will appear here after website changes go live."
                class="ginko:m-4"
              />
            </section>

            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div class="ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3">
                <h2 class="studio-text-title">{{ t('ginkoCms.studio.dashboard.recentActivity') }}</h2>
              </div>
              <div v-if="recentActivity.length" class="ginko:divide-y ginko:divide-border/70">
                <div
                  v-for="item in recentActivityCapped"
                  :key="item._id"
                  class="ginko:px-4 ginko:py-3"
                >
                  <div class="ginko:text-sm">{{ item.displaySummary }}</div>
                  <div class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                    <NuxtTime
                      :datetime="item.createdAt"
                      :locale="dateLocale"
                      month="short"
                      day="numeric"
                      hour="2-digit"
                      minute="2-digit"
                    />
                  </div>
                </div>
              </div>
              <StudioEmptyState
                v-else
                :title="t('ginkoCms.studio.dashboard.noActivityTitle')"
                :description="t('ginkoCms.studio.dashboard.noActivityDescription')"
                class="ginko:m-4"
              />
              <div
                v-if="canManageSettings && recentActivity.length"
                class="ginko:border-t ginko:border-border/40 ginko:px-4 ginko:py-2"
              >
                <Button as-child variant="ghost" size="sm" class="ginko:w-full">
                  <RouterLink :to="`${studioRoute}/activity`">
                    {{ t('ginkoCms.studio.dashboard.viewAllActivity') }}
                  </RouterLink>
                </Button>
              </div>
            </section>
          </aside>
        </div>
      </StudioPageBody>
    </ScrollArea>
  </StudioWorkspace>
</template>
