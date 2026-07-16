<script setup lang="ts">
import { Check, Folder } from '@lucide/vue'

import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'

// Grid (thumbnail) view of the current finder items, with the load-more
// control. Injects the browser context.
const { t } = useCmsI18n()
const { finder, mode, pick, presentation, flow } = useStudioAssetBrowserContext()
</script>

<template>
  <div
    class="ginko:grid ginko:gap-x-4 ginko:gap-y-6 ginko:p-6"
    style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))"
  >
    <div
      v-for="item in finder.currentItems.value"
      :key="presentation.itemKey(item)"
      class="ginko:group ginko:relative ginko:flex ginko:cursor-pointer ginko:flex-col ginko:items-center ginko:rounded-xl ginko:p-3 studio-motion-fast"
      :class="
        item.type === 'asset' &&
        (finder.selectedAssetId.value === item.asset.id || pick.isChosen(item.asset.id))
          ? 'ginko:bg-primary/8 ginko:ring-1 ginko:ring-primary/20'
          : 'ginko:hover:bg-muted/50'
      "
      @click="flow.handleItemClick(item)"
      @dblclick="flow.handleItemDoubleClick(item)"
    >
      <button
        v-if="item.type === 'asset'"
        class="ginko:absolute ginko:left-2 ginko:top-2 ginko:z-10 ginko:inline-flex ginko:size-5 ginko:items-center ginko:justify-center ginko:rounded-full ginko:border ginko:bg-background/90 ginko:text-xs ginko:transition-colors"
        :class="
          (
            mode.mode.value === 'manage'
              ? finder.selectedAssetIds.value.includes(item.asset.id)
              : pick.isChosen(item.asset.id)
          )
            ? 'ginko:border-primary ginko:bg-primary ginko:text-primary-foreground'
            : 'ginko:border-border ginko:text-muted-foreground'
        "
        @click.stop="
          mode.mode.value === 'manage'
            ? finder.toggleAssetSelection(item.asset.id)
            : pick.togglePickerSelection(item.asset)
        "
      >
        <Check
          v-if="
            mode.mode.value === 'manage'
              ? finder.selectedAssetIds.value.includes(item.asset.id)
              : pick.isChosen(item.asset.id)
          "
          class="ginko:size-3"
        />
      </button>
      <template v-if="item.type === 'folder'">
        <div
          class="ginko:mb-2 ginko:flex ginko:aspect-[4/3] ginko:w-full ginko:items-center ginko:justify-center"
        >
          <Folder class="ginko:size-16 ginko:text-muted-foreground" />
        </div>
        <span
          class="ginko:line-clamp-2 ginko:w-full ginko:text-center ginko:text-xs ginko:font-medium ginko:leading-tight"
          >{{ item.label }}</span
        >
      </template>
      <template v-else>
        <div
          class="ginko:mb-2 ginko:flex ginko:aspect-square ginko:w-full ginko:items-center ginko:justify-center ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/50 ginko:bg-muted/40"
        >
          <img
            v-if="presentation.canShowPreview(item.asset)"
            :src="item.asset.thumbnailUrl ?? undefined"
            :alt="item.asset.filename"
            class="ginko:h-full ginko:w-full ginko:object-cover"
            @error="presentation.markPreviewFailed(item.asset)"
          />
          <Icon
            v-else
            :name="finder.mimeIcon(item.asset.mimeType)"
            class="ginko:size-10 ginko:text-muted-foreground/40"
          />
        </div>
        <span
          class="ginko:line-clamp-2 ginko:w-full ginko:text-center ginko:text-xs ginko:leading-tight"
          :class="item.asset.deletedAt ? 'ginko:line-through ginko:text-muted-foreground' : ''"
        >
          {{ item.asset.filename }}
        </span>
        <span class="ginko:mt-0.5 ginko:text-xs ginko:text-muted-foreground/60">{{
          finder.formatFileSize(item.asset.size)
        }}</span>
        <span
          class="ginko:mt-0.5 ginko:line-clamp-1 ginko:w-full ginko:text-center ginko:text-xs ginko:text-muted-foreground/60"
        >
          {{ presentation.ownerPathLabel(item.asset) }}
        </span>
      </template>
    </div>
    <div v-if="finder.hasMoreAssets.value" class="ginko:flex ginko:justify-center ginko:py-4">
      <Button
        variant="outline"
        size="sm"
        :disabled="finder.isLoadingMoreAssets.value"
        @click="finder.loadMoreAssets"
      >
        {{
          finder.isLoadingMoreAssets.value
            ? t('ginkoCms.studio.assetBrowser.loadingMore')
            : t('ginkoCms.common.loadMore')
        }}
      </Button>
    </div>
  </div>
</template>
