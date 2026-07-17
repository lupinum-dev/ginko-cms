<script setup lang="ts">
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  FileText,
  Inbox,
  Languages,
  Plus,
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
const canCreateEntries = can(cmsPermissionKeys.createEntries)
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
// "New content" starts in the first entry-capable (non-singleton) collection.
// Route-backed (website page) collections win over data-only ones — the CTA
// should land on pages, not reference data like authors.
const entryCapableCollections = computed(() =>
  collections.value.filter((collection) => !collection.singleton),
)
const firstEntryCollectionSlug = computed(
  () =>
    (
      entryCapableCollections.value.find((collection) => collection.mode !== 'none') ??
      entryCapableCollections.value[0]
    )?.slug ?? null,
)
// THE one primary action on Home (DESIGN.md principle 1): start new content in
// the first writable collection. Hidden when nothing accepts new entries.
const newContentTo = computed(() =>
  canCreateEntries.value && firstEntryCollectionSlug.value
    ? `${contentRoute}/${firstEntryCollectionSlug.value}/new`
    : null,
)
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
// A queue row must link somewhere that shows exactly what it counted (NAV-01),
// and list filters are per collection — so editorial queue rows split per
// collection, each linking to that collection's filtered list. The overview
// still counts archived entries as work while the destination lists exclude
// them, so the archived entries the overview exposes are subtracted here; the
// real fix (excluding archived from overview counts) lives in the backend.
function archivedCountBySlug(entries: OverviewEntry[] | undefined) {
  const counts = new Map<string, number>()
  for (const entry of entries ?? []) {
    if (entry.status !== 'archived') continue
    counts.set(entry.collection, (counts.get(entry.collection) ?? 0) + 1)
  }
  return counts
}
function collectionQueueCounts(
  field: 'blocked' | 'changedDrafts' | 'missingTranslations',
  entries: OverviewEntry[] | undefined,
) {
  const archived = archivedCountBySlug(entries)
  return (overview.value?.collections ?? []).flatMap((collection) => {
    const slug = String(collection.slug ?? '')
    const count = Math.max(0, Number(collection[field] ?? 0) - (archived.get(slug) ?? 0))
    if (!slug || count === 0) return []
    return [{ slug, label: String(collection.label || slug), count }]
  })
}
const workQueueRows = computed<WorkQueueMetric[]>(() => {
  const reviewsLoadingValue =
    canPublishEntries.value && reviewsQuery.pending.value && reviewsQuery.data.value === null
      ? '...'
      : null
  const rows: WorkQueueMetric[] = []
  const editorialQueues = [
    {
      work: 'blocked',
      field: 'blocked',
      entries: overview.value?.blocked,
      labelKey: 'ginkoCms.studio.dashboard.queueNeedsAttention',
      descriptionKey: 'ginkoCms.studio.dashboard.queueNeedsAttentionDesc',
      icon: AlertCircle,
      tone: 'danger',
    },
    {
      work: 'changed',
      field: 'changedDrafts',
      entries: overview.value?.changedDrafts,
      labelKey: 'ginkoCms.studio.dashboard.queueContinueEditing',
      descriptionKey: 'ginkoCms.studio.dashboard.queueContinueEditingDesc',
      icon: FileText,
      tone: 'info',
    },
    {
      work: 'missing_translation',
      field: 'missingTranslations',
      entries: overview.value?.missingTranslations,
      labelKey: 'ginkoCms.studio.dashboard.queueMissingLanguages',
      descriptionKey: 'ginkoCms.studio.dashboard.queueMissingLanguagesDesc',
      icon: Languages,
      tone: 'warning',
    },
  ] as const

  const readyToPreviewRow: WorkQueueMetric = {
    key: 'readyToPreview',
    label: t('ginkoCms.studio.dashboard.queueReadyToPreview'),
    description: t('ginkoCms.studio.dashboard.queueReadyToPreviewDesc'),
    value: overviewReady.value ? (overview.value?.counts?.readyToPreview ?? 0) : '...',
    icon: CheckCircle2,
    tone: (overview.value?.counts?.readyToPreview ?? 0) > 0 ? 'info' : 'neutral',
    // Deliberately unlinked: no list filter reproduces this queue yet, and the
    // old target (/content) was a dead route.
  }

  if (!overviewReady.value) {
    rows.push(
      ...editorialQueues.map<WorkQueueMetric>((queue) => ({
        key: queue.work,
        label: t(queue.labelKey),
        description: t(queue.descriptionKey),
        value: '...',
        icon: queue.icon,
        tone: 'neutral',
      })),
    )
    rows.splice(1, 0, readyToPreviewRow)
  } else {
    for (const queue of editorialQueues) {
      for (const collection of collectionQueueCounts(queue.field, queue.entries)) {
        rows.push({
          key: `${queue.work}:${collection.slug}`,
          label: `${t(queue.labelKey)} · ${collection.label}`,
          description: t(queue.descriptionKey),
          value: collection.count,
          icon: queue.icon,
          tone: queue.tone,
          to: `${contentRoute}/${collection.slug}?work=${queue.work}`,
        })
      }
      if (queue.work === 'blocked') rows.push(readyToPreviewRow)
    }
  }

  if (canPublishEntries.value) {
    rows.push({
      key: 'readyForReview',
      label: t('ginkoCms.studio.dashboard.queueReadyForReview'),
      description: t('ginkoCms.studio.dashboard.queueReadyForReviewDesc'),
      value: reviewsLoadingValue ?? pendingReviews.value.length,
      icon: Inbox,
      tone: pendingReviews.value.length > 0 ? 'warning' : 'neutral',
      to: reviewsRoute,
    })
  }

  if (reviewsLoadingValue !== null || aiPreparedReviews.value.length > 0) {
    rows.push({
      key: 'aiPrepared',
      label: t('ginkoCms.studio.dashboard.queueAiPrepared'),
      description: t('ginkoCms.studio.dashboard.queueAiPreparedDesc'),
      value: reviewsLoadingValue ?? aiPreparedReviews.value.length,
      icon: Bot,
      tone: aiPreparedReviews.value.length > 0 ? 'info' : 'neutral',
      to: reviewsRoute,
    })
  }

  if (!overviewReady.value || workQueue.value.failedRevalidation > 0) {
    rows.push({
      key: 'failedRevalidation',
      label: t('ginkoCms.studio.dashboard.queueWebsiteRefresh'),
      description: t('ginkoCms.studio.dashboard.queueWebsiteRefreshDesc'),
      value: overviewReady.value ? workQueue.value.failedRevalidation : '...',
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
// First run = the site has no entries anywhere; the empty queue should teach
// the first step instead of celebrating.
const isFirstRun = computed(
  () =>
    overviewReady.value &&
    collections.value.length > 0 &&
    collections.value.every((collection) => (collection.entryCount ?? 0) === 0),
)
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
// Archived content is not publishable work: the destination lists exclude it,
// so the blocked card must not offer it either (same backend caveat as the
// queue rows above).
const blockedEntries = computed(() =>
  (overview.value?.blocked ?? []).filter((entry) => entry.status !== 'archived'),
)
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
  return mode === 'none'
    ? t('ginkoCms.studio.dashboard.routeModeSharedData')
    : t('ginkoCms.studio.dashboard.routeModeWebsitePages')
}

function metricToneClass(tone: WorkQueueMetric['tone']) {
  switch (tone) {
    case 'danger':
      return 'ginko:border-destructive/40 ginko:bg-destructive/10 ginko:dark:bg-destructive/15 ginko:text-destructive-fg'
    case 'warning':
      return 'ginko:border-warning/40 ginko:bg-warning/10 ginko:dark:bg-warning/15 ginko:text-warning-fg'
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
        <template #actions>
          <Button v-if="newContentTo" as-child size="sm">
            <RouterLink :to="newContentTo">
              <Plus class="ginko:mr-1.5 ginko:size-3.5" />
              {{ t('ginkoCms.studio.collectionListPage.newEntry') }}
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
          <StudioEmptyState
            v-if="allCaughtUp"
            :title="
              isFirstRun
                ? t('ginkoCms.studio.dashboard.firstRunTitle')
                : t('ginkoCms.studio.dashboard.allCaughtUpTitle')
            "
            :description="
              isFirstRun
                ? t('ginkoCms.studio.dashboard.firstRunDescription')
                : t('ginkoCms.studio.dashboard.allCaughtUpDescription')
            "
            class="ginko:m-4"
          >
            <!-- First run teaches the first step instead of celebrating an
                 empty queue (design review W7). -->
            <template v-if="isFirstRun && newContentTo" #action>
              <Button as-child size="sm">
                <RouterLink :to="newContentTo">
                  {{ t('ginkoCms.studio.dashboard.firstRunCta') }}
                </RouterLink>
              </Button>
            </template>
          </StudioEmptyState>
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
                  <h2 class="studio-text-title">
                    {{ t('ginkoCms.studio.dashboard.blockedTitle') }}
                  </h2>
                  <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                    {{ t('ginkoCms.studio.dashboard.blockedDescription') }}
                  </p>
                </div>
                <Badge variant="outline" class="ginko:text-xs">
                  {{ blockedEntries.length }}
                </Badge>
              </div>
              <div v-if="blockedEntries.length" class="ginko:divide-y ginko:divide-border/70">
                <RouterLink
                  v-for="entry in blockedEntries"
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
                    {{
                      t(
                        blockerCount(entry) === 1
                          ? 'ginkoCms.studio.dashboard.blockedIssuesOne'
                          : 'ginkoCms.studio.dashboard.blockedIssuesOther',
                        { count: blockerCount(entry) },
                      )
                    }}
                  </div>
                  <AlertCircle
                    class="ginko:self-center ginko:size-4 ginko:text-destructive ginko:@2xl:justify-self-end"
                  />
                </RouterLink>
              </div>
              <StudioEmptyState
                v-else
                :title="t('ginkoCms.studio.dashboard.noPublishBlockersTitle')"
                :description="t('ginkoCms.studio.dashboard.noPublishBlockersDescription')"
                class="ginko:m-4"
              />
            </section>

            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div class="ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3">
                <h2 class="studio-text-title">
                  {{ t('ginkoCms.studio.dashboard.contentOverviewTitle') }}
                </h2>
                <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                  {{ t('ginkoCms.studio.dashboard.contentOverviewDescription') }}
                </p>
              </div>
              <div class="ginko:overflow-x-auto">
                <div class="ginko:min-w-[46rem]">
                  <div
                    class="ginko:grid ginko:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem_8rem] ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
                  >
                    <div>{{ t('ginkoCms.studio.dashboard.columnCollection') }}</div>
                    <div>{{ t('ginkoCms.studio.dashboard.columnWebsiteUse') }}</div>
                    <div>{{ t('ginkoCms.studio.dashboard.columnEntries') }}</div>
                    <div>{{ t('ginkoCms.studio.dashboard.columnDrafts') }}</div>
                    <div>{{ t('ginkoCms.studio.dashboard.columnTranslations') }}</div>
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
                <h2 class="studio-text-title">
                  {{ t('ginkoCms.studio.dashboard.trackWebsiteUpdatesTitle') }}
                </h2>
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
                    <div class="ginko:font-medium">
                      {{ t('ginkoCms.studio.dashboard.trackStatusUnavailableTitle') }}
                    </div>
                    <div class="ginko:text-xs ginko:text-muted-foreground">
                      {{ t('ginkoCms.studio.dashboard.trackStatusUnavailableDescription') }}
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
                    <div class="ginko:font-medium">
                      {{ t('ginkoCms.studio.dashboard.trackHealthyTitle') }}
                    </div>
                    <div class="ginko:text-xs ginko:text-muted-foreground">
                      {{ t('ginkoCms.studio.dashboard.trackHealthyDescription') }}
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
                :title="t('ginkoCms.studio.dashboard.nothingLiveTitle')"
                :description="t('ginkoCms.studio.dashboard.nothingLiveDescription')"
                class="ginko:m-4"
              />
            </section>

            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div class="ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3">
                <h2 class="studio-text-title">
                  {{ t('ginkoCms.studio.dashboard.recentActivity') }}
                </h2>
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
