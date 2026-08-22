<script setup lang="ts">
import { Activity, Loader2 } from '@lucide/vue'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { api } from '../boundary/api'
import { cmsPermissionKeys } from '../composables/permissions'
import { useCmsConfig } from '../composables/useCmsConfig'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioPaginatedQuery } from '../composables/useCmsStudioPaginatedQuery'

type ActivityItem = {
  _id: string
  displaySummary: string
  kind: string
  outcome: ActivityOutcome
  entryId: string | null
  collection: string | null
  locale: string | null
  appIdentityId: string
  createdAt: number
  collectionLabel?: string | null
  entrySlug?: string | null
  actorLabel?: string | null
}

type ActivityOutcome = 'applied' | 'failed' | 'blocked' | 'stale'
type ActivityFilterKind =
  | 'all'
  | 'content'
  | 'collection'
  | 'actor'
  | 'operation'
  | 'result'
  | 'time'
type ActivityFilter =
  | { kind: 'content'; entryId: string }
  | { kind: 'collection'; collection: string }
  | { kind: 'actor'; appIdentityId: string }
  | { kind: 'operation'; operationKind: string }
  | { kind: 'result'; outcome: ActivityOutcome }
  | { kind: 'time'; from: number; to: number }

const { t, dateLocale } = useCmsI18n()
const { ready, can } = useCmsStudioAccess()
const canPublishEntries = can(cmsPermissionKeys.publishEntries)
const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const pageSize = 50
const filterKind = ref<ActivityFilterKind>('all')
const filterValue = ref('')
const resultOutcome = ref<ActivityOutcome>('applied')
const timeFrom = ref('')
const timeTo = ref('')
const activeFilter = ref<ActivityFilter | null>(null)
const filterError = ref('')
const hasActiveFilter = computed(() => activeFilter.value !== null)
const queryArgs = computed(() => (activeFilter.value ? { filter: activeFilter.value } : {}))
const activityQuery = useCmsStudioPaginatedQuery(api.ginkoCms.editor.listActivity, queryArgs, {
  initialNumItems: pageSize,
  requiredCapability: cmsPermissionKeys.publishEntries,
})
const rows = computed<ActivityItem[]>(() => [...(activityQuery.data.value ?? [])])
const hasMore = computed(() => activityQuery.canLoadMore.value)
const isLoading = computed(() => activityQuery.pending.value)
const isLoadingMore = computed(() => rows.value.length > 0 && isLoading.value)
const pageError = computed(() =>
  activityQuery.error.value
    ? getCmsErrorMessage(activityQuery.error.value, t('ginkoCms.studio.activityPage.loadError'))
    : '',
)
function loadMore() {
  activityQuery.loadMore(pageSize)
}

function filterValueLabel(): string {
  if (filterKind.value === 'content') return t('ginkoCms.studio.activityPage.contentId')
  if (filterKind.value === 'collection') return t('ginkoCms.studio.activityPage.collectionSlug')
  if (filterKind.value === 'actor') return t('ginkoCms.studio.activityPage.actorId')
  return t('ginkoCms.studio.activityPage.operationKind')
}

function outcomeLabel(outcome: ActivityOutcome): string {
  return t(`ginkoCms.studio.activityPage.result_${outcome}`)
}

function applyFilter() {
  filterError.value = ''
  if (filterKind.value === 'all') {
    activeFilter.value = null
    return
  }

  if (filterKind.value === 'result') {
    activeFilter.value = { kind: 'result', outcome: resultOutcome.value }
    return
  }

  if (filterKind.value === 'time') {
    const from = Date.parse(timeFrom.value)
    const to = Date.parse(timeTo.value)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      filterError.value = t('ginkoCms.studio.activityPage.invalidTimeRange')
      return
    }
    activeFilter.value = { kind: 'time', from, to }
    return
  }

  const value = filterValue.value.trim()
  if (!value) {
    filterError.value = t('ginkoCms.studio.activityPage.filterValueRequired')
    return
  }
  if (filterKind.value === 'content') {
    activeFilter.value = { kind: 'content', entryId: value }
  } else if (filterKind.value === 'collection') {
    activeFilter.value = { kind: 'collection', collection: value }
  } else if (filterKind.value === 'actor') {
    activeFilter.value = { kind: 'actor', appIdentityId: value }
  } else {
    activeFilter.value = { kind: 'operation', operationKind: value }
  }
}

function clearFilter() {
  filterKind.value = 'all'
  filterValue.value = ''
  resultOutcome.value = 'applied'
  timeFrom.value = ''
  timeTo.value = ''
  filterError.value = ''
  activeFilter.value = null
}

function entryLink(item: ActivityItem): string | null {
  if (item.entryId && item.collection) {
    return `${contentRoute}/${item.collection}/${item.entryId}`
  }
  return null
}
function collectionBadge(item: ActivityItem): string | null {
  return item.collectionLabel ?? item.collection ?? null
}
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader
        :title="t('ginkoCms.studio.activityPage.title')"
        :description="t('ginkoCms.studio.activityPage.description')"
      >
        <template #actions>
          <Activity class="ginko:size-4 ginko:text-muted-foreground" aria-hidden="true" />
        </template>
      </StudioPageHeader>
    </template>

    <ScrollArea class="ginko:flex-1">
      <StudioPageBody>
        <StudioNotice
          v-if="pageError"
          tone="danger"
          :title="t('ginkoCms.studio.activityPage.loadError')"
          :description="pageError"
          class="ginko:mb-4"
        />

        <StudioEmptyState
          v-if="ready && !canPublishEntries"
          :title="t('ginkoCms.studio.activityPage.accessRequired')"
          :description="t('ginkoCms.studio.activityPage.accessRequiredDescription')"
        >
          <template #icon>
            <Activity class="ginko:size-5" aria-hidden="true" />
          </template>
        </StudioEmptyState>

        <template v-else>
          <form
            v-if="ready"
            class="ginko:mb-4 ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card ginko:p-4"
            @submit.prevent="applyFilter"
          >
            <fieldset
              class="ginko:grid ginko:gap-3 ginko:@3xl:grid-cols-[12rem_minmax(0,1fr)_auto] ginko:@3xl:items-end"
            >
              <legend class="ginko:sr-only">
                {{ t('ginkoCms.studio.activityPage.filters') }}
              </legend>
              <div class="ginko:grid ginko:gap-1.5">
                <Label for="activity-filter-kind">
                  {{ t('ginkoCms.studio.activityPage.filterBy') }}
                </Label>
                <Select v-model="filterKind">
                  <SelectTrigger id="activity-filter-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{{
                      t('ginkoCms.studio.activityPage.filterAll')
                    }}</SelectItem>
                    <SelectItem value="content">{{
                      t('ginkoCms.studio.activityPage.filterContent')
                    }}</SelectItem>
                    <SelectItem value="collection">{{
                      t('ginkoCms.studio.activityPage.filterCollection')
                    }}</SelectItem>
                    <SelectItem value="actor">{{
                      t('ginkoCms.studio.activityPage.filterActor')
                    }}</SelectItem>
                    <SelectItem value="operation">{{
                      t('ginkoCms.studio.activityPage.filterOperation')
                    }}</SelectItem>
                    <SelectItem value="result">{{
                      t('ginkoCms.studio.activityPage.filterResult')
                    }}</SelectItem>
                    <SelectItem value="time">{{
                      t('ginkoCms.studio.activityPage.filterTime')
                    }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div
                v-if="filterKind !== 'all' && filterKind !== 'result' && filterKind !== 'time'"
                class="ginko:grid ginko:gap-1.5"
              >
                <Label for="activity-filter-value">{{ filterValueLabel() }}</Label>
                <Input
                  id="activity-filter-value"
                  v-model="filterValue"
                  :placeholder="filterValueLabel()"
                  autocomplete="off"
                />
              </div>

              <div v-else-if="filterKind === 'result'" class="ginko:grid ginko:gap-1.5">
                <Label for="activity-result-outcome">{{
                  t('ginkoCms.studio.activityPage.result')
                }}</Label>
                <Select v-model="resultOutcome">
                  <SelectTrigger id="activity-result-outcome">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="applied">{{
                      t('ginkoCms.studio.activityPage.result_applied')
                    }}</SelectItem>
                    <SelectItem value="failed">{{
                      t('ginkoCms.studio.activityPage.result_failed')
                    }}</SelectItem>
                    <SelectItem value="blocked">{{
                      t('ginkoCms.studio.activityPage.result_blocked')
                    }}</SelectItem>
                    <SelectItem value="stale">{{
                      t('ginkoCms.studio.activityPage.result_stale')
                    }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div
                v-else-if="filterKind === 'time'"
                class="ginko:grid ginko:gap-3 ginko:@xl:grid-cols-2"
              >
                <div class="ginko:grid ginko:gap-1.5">
                  <Label for="activity-time-from">{{
                    t('ginkoCms.studio.activityPage.timeFrom')
                  }}</Label>
                  <Input id="activity-time-from" v-model="timeFrom" type="datetime-local" />
                </div>
                <div class="ginko:grid ginko:gap-1.5">
                  <Label for="activity-time-to">{{
                    t('ginkoCms.studio.activityPage.timeTo')
                  }}</Label>
                  <Input id="activity-time-to" v-model="timeTo" type="datetime-local" />
                </div>
              </div>

              <div class="ginko:flex ginko:flex-wrap ginko:gap-2">
                <Button type="submit" size="sm">
                  {{ t('ginkoCms.studio.activityPage.applyFilter') }}
                </Button>
                <Button
                  v-if="hasActiveFilter"
                  type="button"
                  variant="ghost"
                  size="sm"
                  @click="clearFilter"
                >
                  {{ t('ginkoCms.studio.activityPage.clearFilter') }}
                </Button>
              </div>
            </fieldset>
            <p
              v-if="filterError"
              class="ginko:mt-2 ginko:text-sm ginko:text-destructive"
              role="alert"
            >
              {{ filterError }}
            </p>
          </form>

          <!-- Loading skeleton -->
          <div
            v-if="rows.length === 0 && isLoading"
            class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
          >
            <div
              v-for="i in 8"
              :key="`skeleton-activity-${i}`"
              class="ginko:flex ginko:items-center ginko:gap-3 ginko:border-b ginko:border-border/60 ginko:px-4 ginko:py-3 ginko:last:border-b-0"
            >
              <div class="ginko:min-w-0 ginko:flex-1 ginko:space-y-2">
                <Skeleton class="ginko:h-4" :style="{ width: `${40 + ((i * 11) % 40)}%` }" />
                <div class="ginko:flex ginko:items-center ginko:gap-2">
                  <Skeleton class="ginko:h-4 ginko:w-14 ginko:rounded-full" />
                  <Skeleton class="ginko:h-3 ginko:w-20" />
                </div>
              </div>
              <Skeleton class="ginko:h-3 ginko:w-24 ginko:shrink-0" />
            </div>
          </div>

          <!-- Empty state -->
          <StudioEmptyState
            v-else-if="rows.length === 0 && !isLoading"
            :title="
              hasActiveFilter
                ? t('ginkoCms.studio.activityPage.emptyFiltered')
                : t('ginkoCms.studio.activityPage.empty')
            "
            :description="
              hasActiveFilter
                ? t('ginkoCms.studio.activityPage.emptyFilteredDescription')
                : t('ginkoCms.studio.activityPage.emptyDescription')
            "
          >
            <template #icon>
              <Activity class="ginko:size-5" aria-hidden="true" />
            </template>
            <template v-if="hasActiveFilter" #action>
              <Button type="button" variant="outline" size="sm" @click="clearFilter">
                {{ t('ginkoCms.studio.activityPage.clearFilter') }}
              </Button>
            </template>
          </StudioEmptyState>

          <!-- Activity list -->
          <div
            v-else
            class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
          >
            <div
              class="ginko:hidden ginko:grid-cols-[minmax(0,1fr)_12rem] ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground ginko:@3xl:grid"
            >
              <div>{{ t('ginkoCms.studio.activityPage.columnActivity') }}</div>
              <div class="ginko:text-right">{{ t('ginkoCms.studio.activityPage.columnWhen') }}</div>
            </div>
            <div
              v-for="item in rows"
              :key="item._id"
              class="ginko:grid ginko:gap-3 ginko:border-b ginko:border-border/60 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:last:border-b-0 ginko:hover:bg-muted/30 ginko:@3xl:grid-cols-[minmax(0,1fr)_12rem] ginko:@3xl:items-center"
            >
              <div class="ginko:min-w-0 ginko:flex-1">
                <RouterLink
                  v-if="entryLink(item)"
                  :to="entryLink(item) || ''"
                  class="ginko:text-sm ginko:font-medium ginko:hover:underline"
                >
                  {{ item.displaySummary }}
                </RouterLink>
                <div v-else class="ginko:text-sm ginko:font-medium">
                  {{ item.displaySummary }}
                </div>
                <div
                  class="ginko:mt-0.5 ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2 ginko:text-xs ginko:text-muted-foreground"
                >
                  <Badge v-if="collectionBadge(item)" variant="outline" class="ginko:text-xs">
                    {{ collectionBadge(item) }}
                  </Badge>
                  <Badge variant="outline" class="ginko:text-xs">
                    {{ outcomeLabel(item.outcome) }}
                  </Badge>
                  <span v-if="item.entrySlug" class="ginko:font-mono">{{ item.entrySlug }}</span>
                  <span v-if="item.actorLabel">{{ item.actorLabel }}</span>
                </div>
                <StudioDeveloperDetails class="ginko:mt-2" :framed="false">
                  <div class="ginko:mt-2 ginko:flex ginko:flex-wrap ginko:gap-2 ginko:text-xs">
                    <code class="ginko:rounded ginko:bg-muted ginko:px-2 ginko:py-1">{{
                      item.kind || 'activity'
                    }}</code>
                    <code
                      v-if="item.locale"
                      class="ginko:rounded ginko:bg-muted ginko:px-2 ginko:py-1"
                      >{{ item.locale }}</code
                    >
                    <code class="ginko:rounded ginko:bg-muted ginko:px-2 ginko:py-1">{{
                      item.appIdentityId
                    }}</code>
                  </div>
                </StudioDeveloperDetails>
              </div>
              <div
                class="ginko:text-xs ginko:tabular-nums ginko:text-muted-foreground ginko:@3xl:text-right"
              >
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

          <!-- Load more -->
          <div v-if="hasMore" class="ginko:flex ginko:justify-center ginko:py-4">
            <Button variant="ghost" size="sm" :disabled="isLoadingMore" @click="loadMore">
              <Loader2 v-if="isLoadingMore" class="ginko:mr-2 ginko:size-3.5 ginko:animate-spin" />
              {{ t('ginkoCms.common.loadMore') }}
            </Button>
          </div>
        </template>
      </StudioPageBody>
    </ScrollArea>
  </StudioWorkspace>
</template>
