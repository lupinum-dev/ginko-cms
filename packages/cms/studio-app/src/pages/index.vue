<script setup lang="ts">
import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  FileText,
  Languages,
  RefreshCw,
  Workflow,
} from 'lucide-vue-next'
import { computed } from 'vue'

import { api } from '../boundary/api'
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
import { deriveStudioWorkQueueSummary } from '../lib/publicWorkflow'
import {
  studioRouteHref,
  studioStaticRoutes,
  type StudioStaticRoute,
} from '../lib/studioNavigation'

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
}

type OverviewRun = {
  id: string
  importRunId?: string
  status: string
  paths?: string[]
  collectionSlugs?: string[]
  entryCount?: number
  lastError?: string | null
  createdAt: number
  updatedAt?: number
}

type Overview = {
  counts?: Record<string, number>
  collections?: Array<Record<string, unknown>>
  changedDrafts?: OverviewEntry[]
  blocked?: OverviewEntry[]
  missingTranslations?: OverviewEntry[]
  recentPublished?: OverviewEntry[]
  revalidationJobs?: OverviewRun[]
  importRuns?: OverviewRun[]
  activity?: Array<{
    _id: string
    summary: string
    displaySummary: string
    kind: string
    locale: string | null
    createdAt: number
  }>
}

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
    importBlockers: overview.value?.counts?.importBlockers,
    pendingRevalidation: overview.value?.counts?.pendingRevalidation,
  }),
)
const workQueueRows = computed<WorkQueueMetric[]>(() => {
  const loadingValue = overviewReady.value ? null : '...'
  const rows: WorkQueueMetric[] = [
    {
      key: 'needsAttention',
      label: 'Needs attention',
      description: 'Start here when publishing is blocked or website updates need review.',
      value: loadingValue ?? workQueue.value.needsAttention,
      icon: AlertCircle,
      tone: workQueue.value.needsAttention > 0 ? 'danger' : 'neutral',
    },
    {
      key: 'changedDrafts',
      label: 'Continue editing',
      description: 'Draft edits waiting for preview, review, or publishing.',
      value: loadingValue ?? workQueue.value.changedDrafts,
      icon: FileText,
      tone: workQueue.value.changedDrafts > 0 ? 'info' : 'neutral',
    },
    {
      key: 'missingTranslations',
      label: 'Missing translations',
      description: 'Locales that still need content before the website is complete.',
      value: loadingValue ?? workQueue.value.missingTranslations,
      icon: Languages,
      tone: workQueue.value.missingTranslations > 0 ? 'warning' : 'neutral',
    },
  ]

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

  if (!overviewReady.value || workQueue.value.importBlockers > 0) {
    rows.push({
      key: 'importBlockers',
      label: 'Import needs review',
      description: 'Imported content that needs a human check before it affects the website.',
      value: loadingValue ?? workQueue.value.importBlockers,
      icon: FileArchive,
      tone: workQueue.value.importBlockers > 0 ? 'danger' : 'neutral',
      to: `${studioRoute}/imports`,
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
      <div class="studio-page-content ginko:space-y-5 ginko:p-4 ginko:sm:p-5 ginko:lg:p-6">
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
            <h2 class="ginko:text-sm ginko:font-semibold">
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

        <div
          class="ginko:grid ginko:min-w-0 ginko:gap-5 ginko:xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.6fr)]"
        >
          <div class="ginko:min-w-0 ginko:space-y-5">
            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div
                class="ginko:flex ginko:items-center ginko:justify-between ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3"
              >
                <div>
                  <h2 class="ginko:text-sm ginko:font-semibold">Continue editing</h2>
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
                      class="ginko:mt-0.5 ginko:truncate ginko:font-mono ginko:text-[11px] ginko:text-muted-foreground"
                    >
                      {{ entry.collection }} · {{ entry.path || entry.status }}
                    </div>
                  </div>
                  <span
                    class="ginko:self-center ginko:text-xs ginko:text-muted-foreground ginko:sm:text-right"
                  >
                    {{ entry.nextAction || 'Preview website changes' }}
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
                  <h2 class="ginko:text-sm ginko:font-semibold">Blocked from publishing</h2>
                  <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                    Entries with readiness issues before the website can change.
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
                    {{ entry.blockingIssueCount }} readiness issue{{
                      entry.blockingIssueCount === 1 ? '' : 's'
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
                description="The current work queue has no readiness blockers."
                class="ginko:m-4"
              />
            </section>

            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div class="ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3">
                <h2 class="ginko:text-sm ginko:font-semibold">Content overview</h2>
                <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                  Content types, website use, drafts, and translation gaps.
                </p>
              </div>
              <div class="ginko:overflow-x-auto">
                <div class="ginko:min-w-[46rem]">
                  <div
                    class="ginko:grid ginko:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem_8rem] ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-2 ginko:text-[11px] ginko:font-medium ginko:uppercase ginko:text-muted-foreground"
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

          <aside class="ginko:min-w-0 ginko:space-y-5">
            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div
                class="ginko:flex ginko:items-center ginko:gap-2 ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3"
              >
                <Workflow class="ginko:size-4 ginko:text-muted-foreground" />
                <h2 class="ginko:text-sm ginko:font-semibold">Operations status</h2>
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
                    <div class="ginko:font-medium">Work queue unavailable</div>
                    <div class="ginko:text-xs ginko:text-muted-foreground">
                      Studio is still loading operational state or the overview query failed.
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
                    <div class="ginko:font-medium">No operational blockers</div>
                    <div class="ginko:text-xs ginko:text-muted-foreground">
                      Imports and website refreshes look healthy.
                    </div>
                  </div>
                </div>
                <div
                  v-for="job in overview?.revalidationJobs ?? []"
                  :key="`job:${job.id}`"
                  class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3 ginko:text-sm"
                >
                  <div class="ginko:font-medium">Website refresh {{ job.status }}</div>
                  <div class="ginko:mt-1 ginko:truncate ginko:text-xs ginko:text-muted-foreground">
                    {{ job.paths?.join(', ') || job.lastError || 'No affected pages recorded' }}
                  </div>
                </div>
                <div
                  v-for="run in overview?.importRuns ?? []"
                  :key="`import:${run.id}`"
                  class="ginko:rounded-md ginko:border ginko:border-border/40 ginko:bg-muted/30 ginko:p-3 ginko:text-sm"
                >
                  <div class="ginko:font-medium">Import {{ run.status }}</div>
                  <div class="ginko:mt-1 ginko:text-xs ginko:text-muted-foreground">
                    {{ run.entryCount ?? 0 }} entries · {{ run.collectionSlugs?.join(', ') }}
                  </div>
                </div>
              </div>
            </section>

            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div class="ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3">
                <h2 class="ginko:text-sm ginko:font-semibold">Recently published</h2>
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
                title="Nothing published yet"
                description="Published entries will appear here after the website changes."
                class="ginko:m-4"
              />
            </section>

            <section
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
            >
              <div class="ginko:border-b ginko:border-border/40 ginko:px-4 ginko:py-3">
                <h2 class="ginko:text-sm ginko:font-semibold">Recent activity</h2>
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
      </div>
    </ScrollArea>
  </StudioWorkspace>
</template>
