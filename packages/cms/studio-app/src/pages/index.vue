<script setup lang="ts">
import { AlertCircle, FileText, Languages, Plus, RefreshCw } from '@lucide/vue'
import { computed } from 'vue'

import { api } from '../boundary/api'
import { cmsPermissionKeys } from '../composables/permissions'
import { useCmsConfig } from '../composables/useCmsConfig'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioPaginatedQuery } from '../composables/useCmsStudioPaginatedQuery'
import { useCmsStudioQuery } from '../composables/useCmsStudioQuery'
import { useCmsStudioSettings } from '../composables/useCmsStudioSettings'
import type { StudioCollectionListItem } from '../lib/installedCollections'

type QueueKind = 'changed' | 'needs_attention' | 'missing_translation'
type QueueEntry = {
  entryId: string
  collection: string
  collectionLabel: string | Record<string, string>
  title: string
  nextAction: string
  updatedAt: number
}
type WorkQueueItem = { entry: QueueEntry; queueKinds: QueueKind[] }
type Overview = {
  recentPublished: Array<
    QueueEntry & {
      publishedAt: number | null
    }
  >
  revalidationJobs: Array<{
    id: string
    status: 'pending' | 'delivering' | 'delivered' | 'failed'
    lastError: string | null
    updatedAt: number
  }>
}
type ActivityItem = {
  _id: string
  displaySummary: string
  createdAt: number
}

const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const reviewsRoute = `${studioRoute}/reviews`
const studioSettings = useCmsStudioSettings()
const locale = computed(() => studioSettings.defaultLocale.value)
const { can } = useCmsStudioAccess()
const canCreateEntries = can(cmsPermissionKeys.createEntries)
const canPublishEntries = can(cmsPermissionKeys.publishEntries)
const { dateLocale, t } = useCmsI18n()

const overviewQuery = useCmsStudioQuery(
  api.ginkoCms.editor.getStudioOverview,
  computed(() => ({ locale: locale.value })),
)
const workQueueQuery = useCmsStudioPaginatedQuery(
  api.ginkoCms.editor.listStudioWorkQueue,
  computed(() => ({ locale: locale.value })),
  { initialNumItems: 20 },
)
const collectionsQuery = useCmsStudioQuery(api.ginkoCms.collections.listCollections, {})
const activityQuery = useCmsStudioPaginatedQuery(
  api.ginkoCms.editor.listActivity,
  {},
  { initialNumItems: 8, requiredCapability: cmsPermissionKeys.publishEntries },
)
const reviewsQuery = useCmsStudioQuery(
  api.ginkoCms.reviewRequests.listPendingReviews,
  { limit: 8 },
  { requiredCapability: cmsPermissionKeys.publishEntries },
)

const overview = computed(() => (overviewQuery.data.value ?? null) as Overview | null)
const workItems = computed(() => workQueueQuery.results.value as WorkQueueItem[])
const recentActivity = computed(() => activityQuery.results.value as ActivityItem[])
const pendingReviews = computed(() => reviewsQuery.data.value ?? [])
const failedRevalidation = computed(
  () => overview.value?.revalidationJobs.filter((job) => job.status === 'failed') ?? [],
)
const collections = computed(
  () => (collectionsQuery.data.value ?? []) as StudioCollectionListItem[],
)
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
const newContentTo = computed(() =>
  canCreateEntries.value && firstEntryCollectionSlug.value
    ? `${contentRoute}/${firstEntryCollectionSlug.value}/new`
    : null,
)
const queueIsEmpty = computed(
  () =>
    workQueueQuery.isExhausted.value &&
    workItems.value.length === 0 &&
    (!canPublishEntries.value || pendingReviews.value.length === 0) &&
    failedRevalidation.value.length === 0,
)

function entryHref(entry: QueueEntry) {
  return `${contentRoute}/${entry.collection}/${entry.entryId}`
}

function collectionLabel(entry: QueueEntry) {
  if (typeof entry.collectionLabel === 'string') return entry.collectionLabel
  return entry.collectionLabel[locale.value] ?? entry.collection
}

function queueKindLabel(kind: QueueKind) {
  if (kind === 'needs_attention') return t('ginkoCms.studio.dashboard.queueNeedsAttention')
  if (kind === 'missing_translation') return t('ginkoCms.studio.dashboard.queueMissingLanguages')
  return t('ginkoCms.studio.dashboard.queueContinueEditing')
}

function queueKindIcon(kind: QueueKind) {
  if (kind === 'needs_attention') return AlertCircle
  if (kind === 'missing_translation') return Languages
  return FileText
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
          v-if="overviewQuery.error.value || workQueueQuery.error.value"
          tone="danger"
          :title="t('ginkoCms.studio.dashboard.overviewLoadErrorTitle')"
          :description="t('ginkoCms.studio.dashboard.overviewLoadErrorDescription')"
        />

        <section
          v-if="canPublishEntries"
          class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:bg-card"
        >
          <div class="ginko:border-b ginko:px-4 ginko:py-3">
            <h2 class="studio-text-title">{{ t('ginkoCms.studio.dashboard.today') }}</h2>
            <p class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.dashboard.todayDescription') }}
            </p>
          </div>

          <StudioEmptyState
            v-if="queueIsEmpty"
            :title="t('ginkoCms.studio.dashboard.allCaughtUpTitle')"
            :description="t('ginkoCms.studio.dashboard.allCaughtUpDescription')"
            class="ginko:m-4"
          />

          <div v-else class="ginko:divide-y ginko:divide-border/70">
            <RouterLink
              v-for="item in workItems"
              :key="item.entry.entryId"
              :to="entryHref(item.entry)"
              class="ginko:grid ginko:gap-3 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:hover:bg-accent/40 ginko:@2xl:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div class="ginko:min-w-0">
                <div class="ginko:truncate ginko:text-sm ginko:font-medium">
                  {{ item.entry.title }}
                </div>
                <div class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground">
                  {{ collectionLabel(item.entry) }} · {{ item.entry.nextAction }}
                </div>
              </div>
              <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-1.5">
                <Badge v-for="kind in item.queueKinds" :key="kind" variant="outline">
                  <component :is="queueKindIcon(kind)" class="ginko:mr-1 ginko:size-3" />
                  {{ queueKindLabel(kind) }}
                </Badge>
              </div>
            </RouterLink>

            <RouterLink
              v-if="canPublishEntries && pendingReviews.length"
              :to="reviewsRoute"
              class="ginko:block ginko:px-4 ginko:py-3 ginko:text-sm ginko:font-medium ginko:hover:bg-accent/40"
            >
              {{ t('ginkoCms.studio.dashboard.queueReadyForReview') }}
            </RouterLink>

            <div
              v-if="failedRevalidation.length"
              class="ginko:flex ginko:items-start ginko:gap-3 ginko:px-4 ginko:py-3"
            >
              <RefreshCw class="ginko:mt-0.5 ginko:size-4 ginko:text-destructive" />
              <div>
                <div class="ginko:text-sm ginko:font-medium">
                  {{ t('ginkoCms.studio.dashboard.queueWebsiteRefresh') }}
                </div>
                <div class="ginko:text-xs ginko:text-muted-foreground">
                  {{ failedRevalidation[0]?.lastError }}
                </div>
              </div>
            </div>

            <div v-if="workQueueQuery.hasNextPage.value" class="ginko:p-3">
              <Button
                variant="outline"
                size="sm"
                class="ginko:w-full"
                :disabled="workQueueQuery.isLoading.value"
                @click="workQueueQuery.loadMore(20)"
              >
                {{ t('ginkoCms.common.loadMore') }}
              </Button>
            </div>
          </div>
        </section>

        <div class="ginko:grid ginko:gap-6 ginko:@5xl:grid-cols-2">
          <section class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:bg-card">
            <div class="ginko:border-b ginko:px-4 ginko:py-3">
              <h2 class="studio-text-title">
                {{ t('ginkoCms.studio.dashboard.contentOverviewTitle') }}
              </h2>
            </div>
            <div class="ginko:divide-y ginko:divide-border/70">
              <RouterLink
                v-for="collection in collections"
                :key="collection.slug"
                :to="`${contentRoute}/${collection.slug}`"
                class="ginko:flex ginko:items-center ginko:justify-between ginko:px-4 ginko:py-3 ginko:text-sm ginko:hover:bg-accent/40"
              >
                <span class="ginko:font-medium">{{ collection.label }}</span>
                <span class="ginko:text-xs ginko:text-muted-foreground">
                  {{ collection.locales.join(' · ') }}
                </span>
              </RouterLink>
            </div>
          </section>

          <section class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:bg-card">
            <div class="ginko:border-b ginko:px-4 ginko:py-3">
              <h2 class="studio-text-title">{{ t('ginkoCms.studio.dashboard.alreadyLive') }}</h2>
            </div>
            <div
              v-if="overview?.recentPublished.length"
              class="ginko:divide-y ginko:divide-border/70"
            >
              <RouterLink
                v-for="entry in overview.recentPublished"
                :key="entry.entryId"
                :to="entryHref(entry)"
                class="ginko:block ginko:px-4 ginko:py-3 ginko:hover:bg-accent/40"
              >
                <div class="ginko:truncate ginko:text-sm ginko:font-medium">{{ entry.title }}</div>
                <NuxtTime
                  v-if="entry.publishedAt"
                  :datetime="entry.publishedAt"
                  :locale="dateLocale"
                  class="ginko:text-xs ginko:text-muted-foreground"
                  month="short"
                  day="numeric"
                />
              </RouterLink>
            </div>
            <StudioEmptyState
              v-else
              :title="t('ginkoCms.studio.dashboard.nothingLiveTitle')"
              :description="t('ginkoCms.studio.dashboard.nothingLiveDescription')"
              class="ginko:m-4"
            />
          </section>
        </div>

        <section class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:bg-card">
          <div class="ginko:border-b ginko:px-4 ginko:py-3">
            <h2 class="studio-text-title">{{ t('ginkoCms.studio.dashboard.recentActivity') }}</h2>
          </div>
          <div v-if="recentActivity.length" class="ginko:divide-y ginko:divide-border/70">
            <div
              v-for="item in recentActivity.slice(0, 6)"
              :key="item._id"
              class="ginko:px-4 ginko:py-3"
            >
              <div class="ginko:text-sm">{{ item.displaySummary }}</div>
              <NuxtTime
                :datetime="item.createdAt"
                :locale="dateLocale"
                class="ginko:text-xs ginko:text-muted-foreground"
                month="short"
                day="numeric"
              />
            </div>
          </div>
        </section>
      </StudioPageBody>
    </ScrollArea>
  </StudioWorkspace>
</template>
