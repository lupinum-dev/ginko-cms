<script setup lang="ts">
import { Activity, Loader2 } from '@lucide/vue'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed } from 'vue'

import { api } from '../boundary/api'
import { cmsPermissionKeys } from '../composables/permissions'
import { useCmsConfig } from '../composables/useCmsConfig'
import { useCmsI18n } from '../composables/useCmsI18n'
import { useCmsStudioAccess } from '../composables/useCmsStudioAccess'
import { useCmsStudioPaginatedQuery } from '../composables/useCmsStudioPaginatedQuery'

type ActivityItem = {
  _id: string
  summary: string
  displaySummary: string
  kind: string
  entryId: string | null
  collectionId: string | null
  locale: string | null
  createdAt: number
}

const { t, dateLocale } = useCmsI18n()
const { ready, can } = useCmsStudioAccess()
const canManageSettings = can(cmsPermissionKeys.manageSettings)
const cmsConfig = useCmsConfig()
const studioRoute = cmsConfig.route.replace(/\/$/, '')
const contentRoute = `${studioRoute}/content`
const pageSize = 50
const activityQuery = useCmsStudioPaginatedQuery(
  api.ginkoCms.editor.listActivity,
  {},
  {
    initialNumItems: pageSize,
    requiredCapability: cmsPermissionKeys.manageSettings,
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
        :eyebrow="t('ginkoCms.studio.layout.operations')"
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
          v-if="ready && !canManageSettings"
          :title="t('ginkoCms.studio.activityPage.accessRequired')"
          :description="t('ginkoCms.studio.activityPage.accessRequiredDescription')"
        >
          <template #icon>
            <Activity class="ginko:size-5" aria-hidden="true" />
          </template>
        </StudioEmptyState>

        <!-- Loading skeleton -->
        <div
          v-else-if="rows.length === 0 && isLoading"
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
            class="ginko:hidden ginko:grid-cols-[minmax(0,1fr)_12rem] ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-4 ginko:py-2 ginko:text-xs ginko:font-medium ginko:uppercase ginko:text-muted-foreground ginko:md:grid"
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
              <NuxtLink
                v-if="entryLink(item)"
                :to="entryLink(item) || ''"
                class="ginko:text-sm ginko:font-medium ginko:hover:underline"
              >
                {{ item.displaySummary }}
              </NuxtLink>
              <div v-else class="ginko:text-sm ginko:font-medium">
                {{ item.displaySummary }}
              </div>
              <div
                class="ginko:mt-0.5 ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2 ginko:text-xs ginko:text-muted-foreground"
              >
                <Badge v-if="item.collectionId" variant="outline" class="ginko:text-xs">
                  {{ item.collectionId }}
                </Badge>
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
                    item.summary
                  }}</code>
                </div>
              </StudioDeveloperDetails>
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
          </div>
        </div>

        <!-- Load more -->
        <div v-if="hasMore" class="ginko:flex ginko:justify-center ginko:py-4">
          <Button variant="ghost" size="sm" :disabled="isLoadingMore" @click="loadMore">
            <Loader2 v-if="isLoadingMore" class="ginko:mr-2 ginko:size-3.5 ginko:animate-spin" />
            {{ t('ginkoCms.common.loadMore') }}
          </Button>
        </div>
      </StudioPageBody>
    </ScrollArea>
  </StudioWorkspace>
</template>
