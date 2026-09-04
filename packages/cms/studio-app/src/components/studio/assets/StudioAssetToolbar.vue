<script setup lang="ts">
import {
  Grid3x3,
  List,
  Loader2,
  Menu,
  PanelRight,
  Search,
  SlidersHorizontal,
  Upload,
} from '@lucide/vue'
import { computed, ref } from 'vue'

import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'

// Breadcrumb + view/sort/filter controls + search for the content pane. Owns
// the on-demand filter row state; every viewport variant is expressed as a
// container query against the split pane's content container.
const { t } = useCmsI18n()
const { finder, mode, pick, selection, flow } = useStudioAssetBrowserContext()

const viewSegments = [
  { value: 'list', label: t('ginkoCms.studio.assetBrowser.viewList'), icon: List },
  { value: 'grid', label: t('ginkoCms.studio.assetBrowser.viewGrid'), icon: Grid3x3 },
]

// On-demand filter row; pins itself open while any filter is active.
const filtersOpen = ref(false)
const showFilterRow = computed(() => filtersOpen.value || finder.activeFilterCount.value > 0)
</script>

<template>
  <div>
    <div
      class="ginko:flex ginko:h-auto ginko:min-h-11 ginko:shrink-0 ginko:flex-wrap ginko:items-center ginko:gap-2 ginko:border-b ginko:px-3 ginko:py-2"
    >
      <Button
        variant="ghost"
        size="sm"
        class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:@3xl:hidden"
        :aria-label="t('ginkoCms.studio.assetBrowser.browseAriaLabel')"
        @click="flow.mobileScopesOpen.value = true"
      >
        <Menu class="ginko:size-4" />
      </Button>

      <div
        class="ginko:flex ginko:min-w-32 ginko:flex-1 ginko:items-center ginko:gap-1 ginko:text-sm"
      >
        <span class="ginko:truncate ginko:font-semibold ginko:text-foreground">
          {{ finder.locationLabel.value }}
        </span>
      </div>

      <StudioSegmentedControl
        :model-value="finder.viewMode.value"
        :items="viewSegments"
        :aria-label="t('ginkoCms.studio.assetBrowser.viewModeAriaLabel')"
        collapse-labels
        class="ginko:hidden ginko:@2xl:inline-flex"
        @update:model-value="finder.viewMode.value = $event as 'list' | 'grid'"
      />

      <Select v-model="finder.sortBy.value">
        <SelectTrigger
          size="sm"
          class="ginko:hidden ginko:text-xs ginko:@2xl:flex"
          :aria-label="t('ginkoCms.studio.assetBrowser.sortAriaLabel')"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">{{ t('ginkoCms.studio.assetBrowser.sortName') }}</SelectItem>
          <SelectItem value="date">{{ t('ginkoCms.studio.assetBrowser.sortDate') }}</SelectItem>
          <SelectItem value="size">{{ t('ginkoCms.studio.assetBrowser.sortSize') }}</SelectItem>
          <SelectItem value="kind">{{ t('ginkoCms.studio.assetBrowser.sortKind') }}</SelectItem>
        </SelectContent>
      </Select>

      <Separator orientation="vertical" class="ginko:hidden ginko:h-5 ginko:@5xl:block" />

      <Button
        variant="ghost"
        size="sm"
        class="ginko:hidden ginko:h-7 ginko:gap-1.5 ginko:px-2 ginko:@2xl:inline-flex"
        :aria-expanded="showFilterRow"
        :aria-label="t('ginkoCms.studio.assetBrowser.toggleFiltersAriaLabel')"
        @click="filtersOpen = !filtersOpen"
      >
        <SlidersHorizontal class="ginko:size-3.5" />
        <Badge
          v-if="finder.activeFilterCount.value > 0"
          variant="secondary"
          class="ginko:h-4 ginko:px-1 ginko:text-xs"
          >{{ finder.activeFilterCount.value }}</Badge
        >
      </Button>

      <Button
        variant="ghost"
        size="sm"
        class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:@2xl:hidden"
        :aria-label="t('ginkoCms.studio.assetBrowser.filterAssetsAriaLabel')"
        @click="flow.mobileFiltersOpen.value = true"
      >
        <SlidersHorizontal class="ginko:size-4" />
      </Button>

      <div
        class="ginko:relative ginko:ml-auto ginko:min-w-0 ginko:flex-1 ginko:@2xl:w-56 ginko:@2xl:flex-none"
      >
        <Search
          class="ginko:pointer-events-none ginko:absolute ginko:left-2.5 ginko:top-1/2 ginko:size-3.5 ginko:-translate-y-1/2 ginko:text-muted-foreground/60"
        />
        <Input
          v-model="finder.searchQuery.value"
          :placeholder="t('ginkoCms.studio.assetBrowser.searchPlaceholder')"
          class="ginko:h-8 ginko:w-full ginko:border-border/40 ginko:bg-card ginko:pl-8 ginko:text-sm ginko:shadow-none"
        />
      </div>

      <Button
        v-if="selection.selectedAssetForDetails.value"
        variant="ghost"
        size="sm"
        class="ginko:h-7 ginko:w-7 ginko:p-0 ginko:@5xl:hidden"
        :aria-label="t('ginkoCms.studio.assetBrowser.inspectSelectedAriaLabel')"
        @click="flow.mobileDetailsOpen.value = true"
      >
        <PanelRight class="ginko:size-4" />
      </Button>

      <Button
        v-if="mode.isPickMode.value && mode.embedded.value"
        size="sm"
        class="ginko:h-7"
        :disabled="finder.uploading.value"
        @click="finder.uploadInput.value?.click()"
      >
        <Loader2
          v-if="finder.uploading.value"
          class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin"
        />
        <Upload v-else class="ginko:mr-1.5 ginko:size-3.5" />
        {{ t('ginkoCms.common.upload') }}
      </Button>
      <Select
        v-if="mode.isPickMode.value && mode.embedded.value"
        v-model="finder.uploadDestination.value"
      >
        <SelectTrigger
          size="sm"
          class="ginko:max-w-40 ginko:text-xs"
          :aria-label="t('ginkoCms.studio.assetBrowser.uploadDestinationAriaLabel')"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="destination in pick.uploadDestinations.value"
            :key="destination.value"
            :value="destination.value"
            :disabled="destination.disabled"
          >
            {{ destination.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- On-demand filter row (design review S3); pinned open while a filter is active. -->
    <div
      v-if="showFilterRow"
      class="ginko:hidden ginko:shrink-0 ginko:flex-wrap ginko:items-center ginko:gap-1.5 ginko:border-b ginko:px-3 ginko:py-2 ginko:@2xl:flex"
    >
      <Select v-model="finder.typeFilter.value">
        <SelectTrigger
          size="sm"
          class="ginko:text-xs"
          :aria-label="t('ginkoCms.studio.assetBrowser.filterTypeAriaLabel')"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{{ t('ginkoCms.studio.assetBrowser.typeAll') }}</SelectItem>
          <SelectItem value="image">{{ t('ginkoCms.studio.assetBrowser.typeImages') }}</SelectItem>
          <SelectItem value="document">{{
            t('ginkoCms.studio.assetBrowser.typeDocuments')
          }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="finder.timeFilter.value">
        <SelectTrigger
          size="sm"
          class="ginko:hidden ginko:text-xs ginko:@5xl:flex"
          :aria-label="t('ginkoCms.studio.assetBrowser.filterTimeAriaLabel')"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{{ t('ginkoCms.studio.assetBrowser.timeAny') }}</SelectItem>
          <SelectItem value="24h">{{ t('ginkoCms.studio.assetBrowser.time24h') }}</SelectItem>
          <SelectItem value="7d">{{ t('ginkoCms.studio.assetBrowser.time7d') }}</SelectItem>
          <SelectItem value="30d">{{ t('ginkoCms.studio.assetBrowser.time30d') }}</SelectItem>
          <SelectItem value="90d">{{ t('ginkoCms.studio.assetBrowser.time90d') }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="finder.usageFilter.value">
        <SelectTrigger
          size="sm"
          class="ginko:hidden ginko:text-xs ginko:@7xl:flex"
          :aria-label="t('ginkoCms.studio.assetBrowser.filterUsageAriaLabel')"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{{ t('ginkoCms.studio.assetBrowser.usageAll') }}</SelectItem>
          <SelectItem value="used">{{ t('ginkoCms.studio.assetBrowser.usageUsed') }}</SelectItem>
          <SelectItem value="unused-verified">{{
            t('ginkoCms.studio.assetBrowser.usageUnusedVerified')
          }}</SelectItem>
          <SelectItem value="unknown-stale">{{
            t('ginkoCms.studio.assetBrowser.usageUnknownStale')
          }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="finder.sizeFilter.value">
        <SelectTrigger
          size="sm"
          class="ginko:hidden ginko:text-xs ginko:@7xl:flex"
          :aria-label="t('ginkoCms.studio.assetBrowser.filterSizeAriaLabel')"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{{ t('ginkoCms.studio.assetBrowser.sizeAny') }}</SelectItem>
          <SelectItem value="small">{{ t('ginkoCms.studio.assetBrowser.sizeSmall') }}</SelectItem>
          <SelectItem value="medium">{{ t('ginkoCms.studio.assetBrowser.sizeMedium') }}</SelectItem>
          <SelectItem value="large">{{ t('ginkoCms.studio.assetBrowser.sizeLarge') }}</SelectItem>
        </SelectContent>
      </Select>
      <button
        v-if="finder.activeFilterCount.value > 0"
        class="ginko:h-6 ginko:rounded-full ginko:px-2 ginko:text-xs ginko:text-muted-foreground ginko:transition-colors ginko:hover:bg-muted/60 ginko:hover:text-foreground"
        @click="finder.clearFilters"
      >
        {{ t('ginkoCms.studio.assetBrowser.clear') }}
      </button>
    </div>
  </div>
</template>
