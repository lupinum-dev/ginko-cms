<script setup lang="ts">
import { Check } from '@lucide/vue'

import { mimeKind } from '../../../composables/internal/assetFinderUtils'
import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'

// List (table) view of the current finder items. Injects the browser context.
const { t } = useCmsI18n()
const { finder, mode, pick, presentation, metadata, flow } = useStudioAssetBrowserContext()
</script>

<template>
  <table class="ginko:w-full ginko:text-xs">
    <thead class="ginko:sticky ginko:top-0 ginko:z-10 ginko:bg-card ginko:text-left">
      <tr class="ginko:border-b">
        <th class="ginko:w-10 ginko:py-2 ginko:pl-4 ginko:pr-2">
          <input
            v-if="mode.mode.value === 'manage'"
            type="checkbox"
            class="ginko:size-4 ginko:rounded ginko:border-border ginko:align-middle"
            :checked="finder.allVisibleAssetsSelected.value"
            :disabled="finder.assetCount.value === 0"
            @change="finder.toggleAllVisibleAssets"
          />
        </th>
        <th
          class="ginko:w-[45%] ginko:px-4 ginko:py-2 ginko:font-medium ginko:text-muted-foreground/70"
        >
          {{ t('ginkoCms.studio.assetBrowser.columnName') }}
        </th>
        <th class="ginko:px-3 ginko:py-2 ginko:font-medium ginko:text-muted-foreground/70">
          {{ t('ginkoCms.studio.assetBrowser.columnDateModified') }}
        </th>
        <th
          class="ginko:px-3 ginko:py-2 ginko:text-right ginko:font-medium ginko:text-muted-foreground/70"
        >
          {{ t('ginkoCms.studio.assetBrowser.columnSize') }}
        </th>
        <th class="ginko:px-3 ginko:py-2 ginko:font-medium ginko:text-muted-foreground/70">
          {{ t('ginkoCms.studio.assetBrowser.columnKind') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="item in finder.currentItems.value"
        :key="presentation.itemKey(item)"
        class="ginko:cursor-pointer ginko:border-b ginko:border-border/30 studio-motion-fast"
        :class="
          finder.selectedAssetId.value === item.id || pick.isChosen(item.id)
            ? 'ginko:bg-primary/8'
            : 'ginko:hover:bg-muted/40'
        "
        @click="flow.handleItemClick(item)"
        @dblclick="flow.handleItemDoubleClick(item)"
      >
        <td class="ginko:py-1.5 ginko:pl-4 ginko:pr-2" @click.stop>
          <input
            v-if="mode.mode.value === 'manage'"
            type="checkbox"
            class="ginko:size-4 ginko:rounded ginko:border-border ginko:align-middle"
            :checked="finder.selectedAssetIds.value.includes(item.id)"
            @change="finder.toggleAssetSelection(item.id)"
          />
          <button
            v-else
            class="ginko:inline-flex ginko:size-5 ginko:items-center ginko:justify-center ginko:rounded-full ginko:border ginko:text-xs"
            :class="
              pick.isChosen(item.id)
                ? 'ginko:border-primary ginko:bg-primary ginko:text-primary-foreground'
                : 'ginko:border-border ginko:text-muted-foreground'
            "
            @click="pick.togglePickerSelection(item)"
          >
            <Check v-if="pick.isChosen(item.id)" class="ginko:size-3" />
          </button>
        </td>
        <td class="ginko:px-4 ginko:py-1.5">
          <div class="ginko:flex ginko:items-center ginko:gap-2.5">
            <div
              class="ginko:flex ginko:size-10 ginko:shrink-0 ginko:items-center ginko:justify-center ginko:overflow-hidden ginko:rounded-lg ginko:border ginko:border-border/50 ginko:bg-muted/60"
            >
              <img
                v-if="presentation.canShowPreview(item)"
                :src="item.thumbnailUrl ?? undefined"
                alt=""
                class="ginko:size-full ginko:object-cover"
                @error="presentation.markPreviewFailed(item)"
              />
              <Icon
                v-else
                :name="finder.mimeIcon(item.mimeType)"
                class="ginko:size-4 ginko:text-muted-foreground"
              />
            </div>
            <span class="ginko:min-w-0">
              <span
                class="ginko:block ginko:truncate"
                :class="item.deletedAt ? 'ginko:line-through ginko:text-muted-foreground' : ''"
              >
                {{ item.filename }}
              </span>
              <span class="ginko:block ginko:truncate ginko:text-xs ginko:text-muted-foreground/60">
                {{ presentation.ownerPathLabel(item) }}
              </span>
              <span
                v-if="item.mimeType.startsWith('image/')"
                class="ginko:block ginko:truncate ginko:text-xs"
                :class="
                  metadata.coverage(item).complete
                    ? 'ginko:text-success-fg/80'
                    : 'ginko:text-warning-fg'
                "
              >
                {{ metadata.coverageLabel(item) }}
              </span>
            </span>
          </div>
        </td>
        <td
          class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:tabular-nums ginko:text-muted-foreground"
        >
          {{ finder.formatDate(item.updatedAt ?? item.createdAt) }}
        </td>
        <td
          class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:text-right ginko:tabular-nums ginko:text-muted-foreground"
        >
          {{ finder.formatFileSize(item.size) }}
        </td>
        <td class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:text-muted-foreground">
          {{ mimeKind(item.mimeType) }}
        </td>
      </tr>
    </tbody>
    <tfoot v-if="finder.hasMoreAssets.value">
      <tr>
        <td colspan="5" class="ginko:py-4 ginko:text-center">
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
        </td>
      </tr>
    </tfoot>
  </table>
</template>
