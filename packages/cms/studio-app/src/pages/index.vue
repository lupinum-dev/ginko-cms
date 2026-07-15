<script setup lang="ts">
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Eye,
  FileText,
  Globe2,
  Inbox,
  Languages,
  MessageSquareCheck,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  Workflow,
} from '@lucide/vue'
import { computed } from 'vue'

import { api } from '../boundary/api'
import StudioDashboardWorkflowPath from '../components/studio/dashboard/StudioDashboardWorkflowPath.vue'
import { cmsPermissionKeys, type CmsPermissionKey } from '../composables/permissions'
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
  readinessActionLabel,
  websiteRefreshStatusLabel,
  websiteRefreshStatusMessage,
} from '../lib/publicWorkflow'
import {
  studioRouteHref,
  studioStaticRoutes,
  type StudioStaticRoute,
} from '../lib/studioNavigation'
import type { StudioReviewRequest } from '../lib/studioReviewRequests'
import { studioWorkflowLabel, type StudioWorkflowSpineKey } from '../lib/studioWorkflowSpine'

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

type WorkflowPathStep = {
  key: StudioWorkflowSpineKey
  label: string
  description: string
  signal: number | string
  signalLabel: string
  icon: unknown
  tone: WorkQueueMetric['tone']
  to?: string
}

const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const reviewsRoute = `${studioRoute}/reviews`
const studioSettings = useCmsStudioSettings()
const locale = computed(() => studioSettings.defaultLocale.value)
const { can } = useCmsStudioAccess()
const canManageAssets = can(cmsPermissionKeys.manageAssets)
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
const pendingReviews = computed<ReviewRequest[]>(
  () => (reviewsQuery.data.value ?? []) as ReviewRequest[],
)
const aiPreparedReviews = computed(() =>
  pendingReviews.value.filter((request) => request.requestSource === 'agent'),
)
const workflowPathRows = computed<WorkflowPathStep[]>(() => {
  const loadingValue = overviewReady.value ? null : '...'
  const reviewsLoadingValue =
    canPublishEntries.value && reviewsQuery.pending.value && reviewsQuery.data.value === null
      ? '...'
      : null
  const needsAttention = workQueue.value.needsAttention
  const readyToPreview = overview.value?.counts?.readyToPreview ?? 0
  const changedDrafts = workQueue.value.changedDrafts
  const recentLive = overview.value?.recentPublished?.length ?? 0
  const reviewCount = pendingReviews.value.length

  return [
    {
      key: 'write',
      label: studioWorkflowLabel('write'),
      description: 'Draft website content and language versions.',
      signal: loadingValue ?? changedDrafts,
      signalLabel: 'Drafts',
      icon: PencilLine,
      tone: changedDrafts > 0 ? 'info' : 'neutral',
      to: contentRoute,
    },
    {
      key: 'check',
      label: studioWorkflowLabel('check'),
      description: 'Resolve blockers, missing languages, and URL issues.',
      signal: loadingValue ?? needsAttention,
      signalLabel: 'Need attention',
      icon: ShieldCheck,
      tone: needsAttention > 0 ? 'danger' : 'neutral',
      to: contentRoute,
    },
    {
      key: 'preview',
      label: studioWorkflowLabel('preview'),
      description: 'See what will change on the website.',
      signal: loadingValue ?? readyToPreview,
      signalLabel: 'Ready',
      icon: Eye,
      tone: readyToPreview > 0 ? 'info' : 'neutral',
      to: contentRoute,
    },
    {
      key: 'review',
      label: studioWorkflowLabel('review'),
      description: 'Approve human and AI-prepared publish requests.',
      signal: reviewsLoadingValue ?? (canPublishEntries.value ? reviewCount : '-'),
      signalLabel: canPublishEntries.value ? 'Requests' : 'No access',
      icon: MessageSquareCheck,
      tone: reviewCount > 0 ? 'warning' : 'neutral',
      to: canPublishEntries.value ? reviewsRoute : undefined,
    },
    {
      key: 'publish',
      label: studioWorkflowLabel('publish'),
      description: 'Confirm approved website changes from the entry editor.',
      signal: 'Confirm',
      signalLabel: 'From entry',
      icon: UploadCloud,
      tone: readyToPreview > 0 || reviewCount > 0 ? 'info' : 'neutral',
      to: contentRoute,
    },
    {
      key: 'track',
      label: studioWorkflowLabel('track'),
      description: 'Verify what is live and whether refreshes succeeded.',
      signal: loadingValue ?? recentLive,
      signalLabel: 'Recently live',
      icon: Globe2,
      tone: workQueue.value.failedRevalidation > 0 ? 'danger' : 'neutral',
    },
  ]
})
const capabilityAccess: Partial<Record<CmsPermissionKey, typeof canManageAssets>> = {
  [cmsPermissionKeys.manageAssets]: canManageAssets,
  [cmsPermissionKeys.manageSettings]: canManageSettings,
  [cmsPermissionKeys.publishEntries]: canPublishEntries,
}
function canAccessRoute(route: StudioStaticRoute): boolean {
  const requiredCapability = route.requiredCapability
  return !requiredCapability || capabilityAccess[requiredCapability]?.value === true
}
const quickLinks = computed(() =>
  studioStaticRoutes
    .filter((route) => ['siteData', 'assets', 'reviews'].includes(route.id))
    .filter(canAccessRoute)
    .map((route) => ({
      to: studioRouteHref(studioRoute, route),
      icon: route.icon,
      label: t(route.labelKey),
    })),
)

function entryHref(entry: OverviewEntry) {
  return `${contentRoute}/${entry.collection}/${entry.entryId}`
}

function entryActionLabel(entry: OverviewEntry, fallback: string) {
  return entry.workflowSummary?.nextAction.kind
    ? readinessActionLabel(t, entry.workflowSummary.nextAction.kind)
    : (entry.nextAction ?? fallback)
}

function blockerCount(entry: OverviewEntry) {
  return entry.workflowSummary?.issueCounts.blocker ?? entry.blockingIssueCount ?? 0
}

function reviewSourceLabel(request: ReviewRequest) {
  return request.requestSource === 'agent' ? 'AI prepared this' : 'Review requested'
}

function reviewImpactLabel(request: ReviewRequest) {
  const parts: string[] = []
  if (request.reviewSummary.changeCount) {
    parts.push(
      `${request.reviewSummary.changeCount} website change${
        request.reviewSummary.changeCount === 1 ? '' : 's'
      }`,
    )
  }
  if (request.reviewSummary.affectedPublicUrls.length) {
    parts.push(
      `${request.reviewSummary.affectedPublicUrls.length} affected page${
        request.reviewSummary.affectedPublicUrls.length === 1 ? '' : 's'
      }`,
    )
  }
  if (request.reviewSummary.warningCount) {
    parts.push(
      `${request.reviewSummary.warningCount} warning${
        request.reviewSummary.warningCount === 1 ? '' : 's'
      }`,
    )
  }
  if (request.reviewSummary.blockerCount) {
    parts.push(
      `${request.reviewSummary.blockerCount} blocker${
        request.reviewSummary.blockerCount === 1 ? '' : 's'
      }`,
    )
  }
  return parts.length ? parts.join(' · ') : 'Ready for a publishing decision'
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
        :eyebrow="t('ginkoCms.studio.layout.home')"
        :description="t('ginkoCms.studio.dashboard.headerDescription')"
      >
        <template #actions>
          <Button v-for="link in quickLinks" :key="link.to" as-child variant="outline" size="sm">
            <RouterLink :to="link.to">
              <Icon
                :name="link.icon"
                class="ginko:mr-1.5 ginko:size-3.5 ginko:text-muted-foreground"
              />
              {{ link.label }}
            </RouterLink>
          </Button>
        </template>
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
          <div class="ginko:divide-y ginko:divide-border/70">
            <component
              :is="row.to ? 'RouterLink' : 'div'"
              v-for="row in workQueueRows"
              :key="row.key"
              :to="row.to"
              class="ginko:grid ginko:gap-3 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:sm:grid-cols-[2.5rem_minmax(0,1fr)_5rem] ginko:hover:bg-accent/40"
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
                class="ginko:self-center ginko:text-2xl ginko:font-semibold ginko:tabular-nums ginko:sm:text-right"
              >
                {{ row.value }}
              </div>
            </component>
          </div>
        </section>

        <StudioDashboardWorkflowPath :rows="workflowPathRows" />

        <div
          class="ginko:grid ginko:min-w-0 ginko:gap-6 ginko:xl:grid-cols-[minmax(0,1.4fr)_minmax(24rem,0.6fr)]"
        >
          <div class="ginko:min-w-0 ginko:space-y-6">
            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div
                class="ginko:flex ginko:items-center ginko:justify-between ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3"
              >
                <div>
                  <h2 class="studio-text-title">Ready to preview</h2>
                  <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                    Drafts with no known blockers. Check the website changes before publishing.
                  </p>
                </div>
                <Badge variant="outline" class="ginko:text-xs">
                  {{ overview?.counts?.readyToPreview ?? 0 }}
                </Badge>
              </div>
              <div
                v-if="overview?.readyToPreview?.length"
                class="ginko:divide-y ginko:divide-border/70"
              >
                <RouterLink
                  v-for="entry in overview.readyToPreview"
                  :key="`ready:${entry.entryId}`"
                  :to="entryHref(entry)"
                  class="ginko:grid ginko:gap-3 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:hover:bg-accent/40 ginko:sm:grid-cols-[minmax(0,1fr)_12rem]"
                >
                  <div class="ginko:min-w-0">
                    <div class="ginko:truncate ginko:text-sm ginko:font-medium">
                      {{ entry.title }}
                    </div>
                    <div
                      class="ginko:mt-0.5 ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
                    >
                      {{ entry.collection }} · {{ entry.path || entry.status }}
                    </div>
                  </div>
                  <span
                    class="ginko:self-center ginko:text-xs ginko:text-muted-foreground ginko:sm:text-right"
                  >
                    Preview website changes
                  </span>
                </RouterLink>
              </div>
              <StudioEmptyState
                v-else
                title="Nothing ready to preview"
                description="Drafts appear here after required content and language checks pass."
                class="ginko:m-4"
              />
            </section>

            <section
              v-if="canPublishEntries"
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div
                class="ginko:flex ginko:items-center ginko:justify-between ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3"
              >
                <div>
                  <h2 class="studio-text-title">Ready for review</h2>
                  <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                    Human and AI-prepared publish requests waiting for a decision.
                  </p>
                </div>
                <Button as-child variant="outline" size="sm">
                  <RouterLink :to="reviewsRoute">
                    <Inbox class="ginko:mr-1.5 ginko:size-3.5" />
                    Reviews
                  </RouterLink>
                </Button>
              </div>
              <div
                v-if="reviewsQuery.pending.value && pendingReviews.length === 0"
                class="ginko:divide-y ginko:divide-border/70"
              >
                <div
                  v-for="i in 3"
                  :key="`review-preview-skeleton-${i}`"
                  class="ginko:px-4 ginko:py-3"
                >
                  <Skeleton class="ginko:h-4 ginko:w-56" />
                  <Skeleton class="ginko:mt-2 ginko:h-3 ginko:w-3/4" />
                </div>
              </div>
              <div v-else-if="pendingReviews.length" class="ginko:divide-y ginko:divide-border/70">
                <RouterLink
                  v-for="request in pendingReviews"
                  :key="request._id"
                  :to="reviewsRoute"
                  class="ginko:block ginko:px-4 ginko:py-3 ginko:transition-colors ginko:hover:bg-accent/40"
                >
                  <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
                    <Badge
                      :variant="request.requestSource === 'agent' ? 'secondary' : 'outline'"
                      class="ginko:text-xs"
                    >
                      {{ reviewSourceLabel(request) }}
                    </Badge>
                    <Badge v-if="request.isStale" variant="destructive" class="ginko:text-xs">
                      Out of date
                    </Badge>
                    <span class="ginko:text-xs ginko:text-muted-foreground">
                      {{ request.locales.join(', ').toUpperCase() }}
                    </span>
                  </div>
                  <div class="ginko:mt-2 ginko:truncate ginko:text-sm ginko:font-medium">
                    {{ request.title }}
                  </div>
                  <p
                    class="ginko:mt-1 ginko:line-clamp-2 ginko:text-xs ginko:text-muted-foreground"
                  >
                    {{ request.message || request.summary }}
                  </p>
                  <div class="ginko:mt-2 ginko:text-xs ginko:text-muted-foreground">
                    {{ reviewImpactLabel(request) }}
                  </div>
                </RouterLink>
              </div>
              <StudioEmptyState
                v-else
                title="No review requests"
                description="Human and AI-prepared publish requests will appear here."
                class="ginko:m-4"
              />
            </section>

            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div
                class="ginko:flex ginko:items-center ginko:justify-between ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3"
              >
                <div>
                  <h2 class="studio-text-title">Continue editing</h2>
                  <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                    Drafts with changes since the last published website content.
                  </p>
                </div>
                <Badge variant="outline" class="ginko:text-xs">
                  {{ overview?.changedDrafts?.length ?? 0 }}
                </Badge>
              </div>
              <div
                v-if="overview?.changedDrafts?.length"
                class="ginko:divide-y ginko:divide-border/70"
              >
                <RouterLink
                  v-for="entry in overview.changedDrafts"
                  :key="`changed:${entry.entryId}`"
                  :to="entryHref(entry)"
                  class="ginko:grid ginko:gap-3 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:hover:bg-accent/40 ginko:sm:grid-cols-[minmax(0,1fr)_12rem]"
                >
                  <div class="ginko:min-w-0">
                    <div class="ginko:truncate ginko:text-sm ginko:font-medium">
                      {{ entry.title }}
                    </div>
                    <div
                      class="ginko:mt-0.5 ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
                    >
                      {{ entry.collection }} · {{ entry.path || entry.status }}
                    </div>
                  </div>
                  <span
                    class="ginko:self-center ginko:text-xs ginko:text-muted-foreground ginko:sm:text-right"
                  >
                    {{ entryActionLabel(entry, 'Preview website changes') }}
                  </span>
                </RouterLink>
              </div>
              <StudioEmptyState
                v-else
                title="No changed drafts"
                description="Start from Content when you are ready to create new work."
                class="ginko:m-4"
              />
            </section>

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
                  class="ginko:grid ginko:gap-3 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:hover:bg-accent/40 ginko:sm:grid-cols-[minmax(0,1fr)_10rem_2rem]"
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
                    class="ginko:self-center ginko:text-xs ginko:text-muted-foreground ginko:sm:text-right"
                  >
                    {{ blockerCount(entry) }} publish issue{{
                      blockerCount(entry) === 1 ? '' : 's'
                    }}
                  </div>
                  <AlertCircle
                    class="ginko:self-center ginko:size-4 ginko:text-destructive ginko:sm:justify-self-end"
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
                      <div
                        class="ginko:mt-0.5 ginko:truncate ginko:text-xs ginko:text-muted-foreground"
                      >
                        {{ collection.type }}
                      </div>
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
                <h2 class="studio-text-title">Already live</h2>
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
                <h2 class="studio-text-title">Latest CMS activity</h2>
              </div>
              <div v-if="recentActivity.length" class="ginko:divide-y ginko:divide-border/70">
                <div v-for="item in recentActivity" :key="item._id" class="ginko:px-4 ginko:py-3">
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
                title="No activity yet"
                description="Editorial, import, asset, and website refresh events will appear here."
                class="ginko:m-4"
              />
            </section>
          </aside>
        </div>
      </StudioPageBody>
    </ScrollArea>
  </StudioWorkspace>
</template>
