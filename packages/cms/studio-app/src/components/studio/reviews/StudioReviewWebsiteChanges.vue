<script setup lang="ts">
import { computed } from 'vue'

import { useCmsI18n } from '../../../composables/useCmsI18n'
import type { StudioReviewRequest } from '../../../lib/studioReviewRequests'
import { groupWebsiteChanges } from '../../../lib/websiteChangePresenter'

const props = defineProps<{
  request: StudioReviewRequest
}>()

const { t } = useCmsI18n()

const changeGroups = computed(() =>
  groupWebsiteChanges(props.request.preview.changes, {
    canonicalUrl: t('ginkoCms.studio.reviewsPage.changeLabelCanonicalUrl'),
    empty: t('ginkoCms.studio.reviewsPage.changeValueEmpty'),
    excluded: t('ginkoCms.studio.reviewsPage.changeValueExcluded'),
    included: t('ginkoCms.studio.reviewsPage.changeValueIncluded'),
    navigation: t('ginkoCms.studio.reviewsPage.changeLabelNavigation'),
    notSet: t('ginkoCms.studio.reviewsPage.changeValueNotSet'),
    oldUrlRedirect: t('ginkoCms.studio.reviewsPage.changeLabelOldUrlRedirect'),
    pageUrl: t('ginkoCms.studio.reviewsPage.changeLabelPageUrl'),
    search: t('ginkoCms.studio.reviewsPage.changeLabelSearch'),
    sitemap: t('ginkoCms.studio.reviewsPage.changeLabelSitemap'),
  }),
)

function countMessage(count: number, oneKey: string, otherKey: string): string {
  return t(count === 1 ? oneKey : otherKey, { count })
}

const hiddenPreviewChangesText = computed(() =>
  countMessage(
    changeGroups.value.hiddenChangeCount,
    'ginkoCms.studio.reviewsPage.hiddenChangesOne',
    'ginkoCms.studio.reviewsPage.hiddenChangesOther',
  ),
)
</script>

<template>
  <div class="ginko:mt-4">
    <div class="ginko:text-xs ginko:font-medium ginko:text-muted-foreground">
      {{ t('ginkoCms.studio.reviewsPage.fieldChanges') }}
    </div>
    <div v-if="request.preview.changes.length" class="ginko:mt-2 ginko:space-y-4">
      <div
        v-if="changeGroups.pageAddressRows.length"
        class="ginko:border-y ginko:border-border/60 ginko:py-2"
      >
        <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
          {{ t('ginkoCms.studio.reviewsPage.pageAddress') }}
        </div>
        <div class="ginko:mt-2 ginko:grid ginko:gap-2">
          <div
            v-for="change in changeGroups.pageAddressRows"
            :key="`page-address:${change.key}`"
            class="ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
              <Badge variant="outline" class="ginko:font-mono">{{ change.locale }}</Badge>
              <span class="ginko:font-medium ginko:text-foreground">{{ change.label }}</span>
            </div>
            <div class="ginko:min-w-0">
              <div class="ginko:font-medium">
                {{ t('ginkoCms.studio.reviewsPage.before') }}
              </div>
              <div class="ginko:mt-1 ginko:truncate ginko:font-mono">{{ change.before }}</div>
            </div>
            <div class="ginko:min-w-0">
              <div class="ginko:font-medium">{{ t('ginkoCms.studio.reviewsPage.after') }}</div>
              <div class="ginko:mt-1 ginko:truncate ginko:font-mono ginko:text-foreground">
                {{ change.after }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="changeGroups.searchPreviewRows.length"
        class="ginko:border-y ginko:border-border/60 ginko:py-2"
      >
        <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
          {{ t('ginkoCms.studio.reviewsPage.searchPreview') }}
        </div>
        <div
          v-for="change in changeGroups.searchPreviewRows"
          :key="change.key"
          class="ginko:mt-2 ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)_minmax(0,1fr)]"
        >
          <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
            <Badge variant="outline" class="ginko:h-fit ginko:w-fit ginko:font-mono">
              {{ change.locale }}
            </Badge>
            <span class="ginko:font-medium ginko:text-foreground">{{ change.label }}</span>
          </div>
          <div class="ginko:min-w-0">
            <div class="ginko:font-medium ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.reviewsPage.before') }}
            </div>
            <div class="ginko:mt-1 ginko:truncate ginko:font-mono ginko:text-muted-foreground">
              {{ change.before }}
            </div>
          </div>
          <div class="ginko:min-w-0">
            <div class="ginko:font-medium ginko:text-muted-foreground">
              {{ t('ginkoCms.studio.reviewsPage.after') }}
            </div>
            <div class="ginko:mt-1 ginko:truncate ginko:font-mono ginko:text-foreground">
              {{ change.after }}
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="changeGroups.visibilityRows.length"
        class="ginko:border-y ginko:border-border/60 ginko:py-2"
      >
        <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
          {{ t('ginkoCms.studio.reviewsPage.websiteVisibility') }}
        </div>
        <div class="ginko:mt-2 ginko:grid ginko:gap-2">
          <div
            v-for="change in changeGroups.visibilityRows"
            :key="`visibility:${change.key}`"
            class="ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
              <Badge variant="outline" class="ginko:font-mono">{{ change.locale }}</Badge>
              <span class="ginko:font-medium ginko:text-foreground">{{ change.label }}</span>
            </div>
            <div>
              <div class="ginko:font-medium">{{ t('ginkoCms.studio.reviewsPage.before') }}</div>
              {{ change.before }}
            </div>
            <div>
              <div class="ginko:font-medium">{{ t('ginkoCms.studio.reviewsPage.after') }}</div>
              <span class="ginko:text-foreground">{{ change.after }}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="changeGroups.seoSettingRows.length"
        class="ginko:border-y ginko:border-border/60 ginko:py-2"
      >
        <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
          {{ t('ginkoCms.studio.reviewsPage.seoSettings') }}
        </div>
        <div class="ginko:mt-2 ginko:grid ginko:gap-2">
          <div
            v-for="change in changeGroups.seoSettingRows"
            :key="`seo:${change.key}`"
            class="ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
              <Badge variant="outline" class="ginko:font-mono">{{ change.locale }}</Badge>
              <span class="ginko:font-medium ginko:text-foreground">{{ change.label }}</span>
            </div>
            <div>
              <div class="ginko:font-medium">{{ t('ginkoCms.studio.reviewsPage.before') }}</div>
              {{ change.before }}
            </div>
            <div>
              <div class="ginko:font-medium">{{ t('ginkoCms.studio.reviewsPage.after') }}</div>
              <span class="ginko:text-foreground">{{ change.after }}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="changeGroups.otherRows.length"
        class="ginko:border-y ginko:border-border/60 ginko:py-2"
      >
        <div class="ginko:text-xs ginko:font-medium ginko:text-foreground">
          {{ t('ginkoCms.studio.reviewsPage.otherWebsiteChanges') }}
        </div>
        <div class="ginko:mt-2 ginko:grid ginko:gap-2">
          <div
            v-for="change in changeGroups.otherRows"
            :key="`other:${change.key}`"
            class="ginko:grid ginko:gap-2 ginko:text-xs ginko:text-muted-foreground ginko:@xl:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
              <Badge variant="outline" class="ginko:font-mono">{{ change.locale }}</Badge>
              <span class="ginko:font-medium ginko:text-foreground">{{ change.label }}</span>
            </div>
            <div>
              <div class="ginko:font-medium">{{ t('ginkoCms.studio.reviewsPage.before') }}</div>
              {{ change.before }}
            </div>
            <div>
              <div class="ginko:font-medium">{{ t('ginkoCms.studio.reviewsPage.after') }}</div>
              <span class="ginko:text-foreground">{{ change.after }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="changeGroups.hiddenChangeCount" class="ginko:text-xs ginko:text-muted-foreground">
        {{ hiddenPreviewChangesText }}
      </div>
    </div>
    <p v-else class="ginko:mt-2 ginko:text-xs ginko:text-muted-foreground">
      {{ t('ginkoCms.studio.reviewsPage.noPreviewChanges') }}
    </p>
  </div>
</template>
