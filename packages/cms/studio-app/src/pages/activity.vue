<script setup lang="ts">
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { Activity, AlertCircle, Loader2 } from 'lucide-vue-next'
import { computed } from 'vue'

import { api } from '../boundary/api'
import { useCmsConfig } from '../composables/useCmsConfig'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioPaginatedQuery } from '../composables/useCmsStudioPaginatedQuery'

useCmsStudioAccess()
type ActivityItem = {
  _id: string
  summary: string
  kind: string
  entryId: string | null
  collectionId: string | null
  locale: string | null
  createdAt: number
}

const { t, dateLocale } = useCmsI18n()
const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const pageSize = 50
const activityQuery = useCmsStudioPaginatedQuery(
  api.ginkoCms.editor.listActivity,
  {},
  {
    initialNumItems: pageSize,
  },
)
const rows = computed<ActivityItem[]>(() => activityQuery.results.value)
const hasMore = computed(() => activityQuery.hasNextPage.value)
const isLoading = computed(() => activityQuery.isLoading.value)
const isLoadingMore = computed(() => rows.value.length > 0 && isLoading.value)
const pageError = computed(() =>
  activityQuery.error.value
    ? getCmsErrorMessage(activityQuery.error.value, t('ginkoCms.studio.activityPage.loadError'))
    : '',
)
function loadMore() {
  activityQuery.loadMore(pageSize)
}
function kindLabel(kind: string): string {
  return kind
    .replace(/\./g, ' ')
    .replace('entry ', '')
    .replace('asset ', '')
    .replace('siteData ', 'site data ')
}
function entryLink(item: ActivityItem): string | null {
  if (item.entryId && item.collectionId) {
    return `${contentRoute}/${item.collectionId}/${item.entryId}`
  }
  return null
}
</script>

<template>
  <StudioWorkspace class="ginko:h-full">
    <template #header>
      <StudioPageHeader
        :title="t('ginkoCms.studio.activityPage.title')"
        eyebrow="Timeline"
        description="Editorial, publish, import, asset, and revalidation history."
      >
        <template #actions>
          <Activity class="ginko:size-4 ginko:text-muted-foreground" />
        </template>
      </StudioPageHeader>
    </template>

    <ScrollArea class="ginko:flex-1">
      <div class="studio-page-content ginko:p-4 ginko:sm:p-5 ginko:lg:p-6">
        <div
          v-if="pageError"
          class="ginko:mb-4 ginko:flex ginko:items-center ginko:gap-2 ginko:rounded-md ginko:border ginko:border-destructive/25 ginko:bg-destructive/10 ginko:p-3 ginko:text-sm ginko:text-destructive-fg"
        >
          <AlertCircle class="ginko:size-4 ginko:shrink-0" />
          {{ pageError }}
        </div>

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
          :title="t('ginkoCms.studio.activityPage.empty')"
          :description="t('ginkoCms.studio.activityPage.emptyDescription')"
        >
          <template #icon>
            <Activity class="ginko:size-5" aria-hidden="true" />
          </template>
        </StudioEmptyState>

        <!-- Activity list -->
        <div
          v-else
          class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
        >
          <div
            class="ginko:hidden ginko:grid-cols-[minmax(0,1fr)_9rem_12rem] ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-2 ginko:text-[11px] ginko:font-medium ginko:uppercase ginko:text-muted-foreground ginko:md:grid"
          >
            <div>Activity</div>
            <div>Type</div>
            <div class="ginko:text-right">When</div>
          </div>
          <component
            :is="entryLink(item) ? 'NuxtLink' : 'div'"
            v-for="item in rows"
            :key="item._id"
            :to="entryLink(item) || void 0"
            class="ginko:grid ginko:gap-3 ginko:border-b ginko:border-border/60 ginko:px-4 ginko:py-3 ginko:transition-colors ginko:last:border-b-0 ginko:md:grid-cols-[minmax(0,1fr)_9rem_12rem] ginko:md:items-center"
            :class="entryLink(item) ? 'ginko:hover:bg-muted/50 ginko:cursor-pointer' : ''"
          >
            <div class="ginko:min-w-0 ginko:flex-1">
              <div class="ginko:text-sm ginko:font-medium">
                {{ item.summary }}
              </div>
              <div
                class="ginko:mt-0.5 ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2 ginko:text-xs ginko:text-muted-foreground"
              >
                <Badge v-if="item.collectionId" variant="outline" class="ginko:text-[10px]">
                  {{ item.collectionId }}
                </Badge>
                <span
                  v-if="item.locale"
                  class="ginko:font-mono ginko:text-[10px] ginko:bg-muted ginko:px-1.5 ginko:py-0.5 ginko:rounded"
                  >{{ item.locale }}</span
                >
              </div>
            </div>
            <div class="ginko:text-xs ginko:capitalize ginko:text-muted-foreground">
              {{ item.kind ? kindLabel(item.kind) : 'Activity' }}
            </div>
            <div
              class="ginko:text-xs ginko:tabular-nums ginko:text-muted-foreground ginko:md:text-right"
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
          </component>
        </div>

        <!-- Load more -->
        <div v-if="hasMore" class="ginko:flex ginko:justify-center ginko:py-4">
          <Button variant="ghost" size="sm" :disabled="isLoadingMore" @click="loadMore">
            <Loader2 v-if="isLoadingMore" class="ginko:mr-2 ginko:size-3.5 ginko:animate-spin" />
            {{ t('ginkoCms.common.loadMore') }}
          </Button>
        </div>
      </div>
    </ScrollArea>
  </StudioWorkspace>
</template>
