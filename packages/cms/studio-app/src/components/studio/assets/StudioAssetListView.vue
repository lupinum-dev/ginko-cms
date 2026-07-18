<script setup lang="ts">
import { Check, Folder } from '@lucide/vue'

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
          item.type === 'asset' &&
          (finder.selectedAssetId.value === item.asset.id || pick.isChosen(item.asset.id))
            ? 'ginko:bg-primary/8'
            : 'ginko:hover:bg-muted/40'
        "
        @click="flow.handleItemClick(item)"
        @dblclick="flow.handleItemDoubleClick(item)"
      >
        <td class="ginko:py-1.5 ginko:pl-4 ginko:pr-2" @click.stop>
          <template v-if="item.type === 'asset'">
            <input
              v-if="mode.mode.value === 'manage'"
              type="checkbox"
              class="ginko:size-4 ginko:rounded ginko:border-border ginko:align-middle"
              :checked="finder.selectedAssetIds.value.includes(item.asset.id)"
              @change="finder.toggleAssetSelection(item.asset.id)"
            />
            <button
              v-else
              class="ginko:inline-flex ginko:size-5 ginko:items-center ginko:justify-center ginko:rounded-full ginko:border ginko:text-xs"
              :class="
                pick.isChosen(item.asset.id)
                  ? 'ginko:border-primary ginko:bg-primary ginko:text-primary-foreground'
                  : 'ginko:border-border ginko:text-muted-foreground'
              "
              @click="pick.togglePickerSelection(item.asset)"
            >
              <Check v-if="pick.isChosen(item.asset.id)" class="ginko:size-3" />
            </button>
          </template>
        </td>
        <td class="ginko:px-4 ginko:py-1.5">
          <div class="ginko:flex ginko:items-center ginko:gap-2.5">
            <template v-if="item.type === 'folder'">
              <Folder class="ginko:size-5 ginko:shrink-0 ginko:text-muted-foreground" />
              <span class="ginko:truncate ginko:font-medium">{{ item.label }}</span>
            </template>
            <template v-else>
              <div
                class="ginko:flex ginko:size-10 ginko:shrink-0 ginko:items-center ginko:justify-center ginko:overflow-hidden ginko:rounded-lg ginko:border ginko:border-border/50 ginko:bg-muted/60"
              >
                <img
                  v-if="presentation.canShowPreview(item.asset)"
                  :src="item.asset.thumbnailUrl ?? undefined"
                  alt=""
                  class="ginko:size-full ginko:object-cover"
                  @error="presentation.markPreviewFailed(item.asset)"
                />
                <Icon
                  v-else
                  :name="finder.mimeIcon(item.asset.mimeType)"
                  class="ginko:size-4 ginko:text-muted-foreground"
                />
              </div>
              <span class="ginko:min-w-0">
                <span
                  class="ginko:block ginko:truncate"
                  :class="
                    item.asset.deletedAt ? 'ginko:line-through ginko:text-muted-foreground' : ''
                  "
                >
                  {{ item.asset.filename }}
                </span>
                <span
                  class="ginko:block ginko:truncate ginko:text-xs ginko:text-muted-foreground/60"
                >
                  {{ presentation.ownerPathLabel(item.asset) }}
                </span>
                <span
                  v-if="item.asset.mimeType.startsWith('image/')"
                  class="ginko:block ginko:truncate ginko:text-xs"
                  :class="
                    metadata.coverage(item.asset).complete
                      ? 'ginko:text-success-fg/80'
                      : 'ginko:text-warning-fg'
                  "
                >
                  {{ metadata.coverageLabel(item.asset) }}
                </span>
              </span>
            </template>
          </div>
        </td>
        <td
          class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:tabular-nums ginko:text-muted-foreground"
        >
          <template v-if="item.type === 'asset'">{{
            finder.formatDate(item.asset.updatedAt ?? item.asset.createdAt)
          }}</template>
          <template v-else>{{
            item.modifiedAt ? finder.formatDate(item.modifiedAt) : '-'
          }}</template>
        </td>
        <td
          class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:text-right ginko:tabular-nums ginko:text-muted-foreground"
        >
          <template v-if="item.type === 'folder'">{{
            t(
              item.count === 1
                ? 'ginkoCms.studio.assetBrowser.folderItemsOne'
                : 'ginkoCms.studio.assetBrowser.folderItemsOther',
              { count: item.count },
            )
          }}</template>
          <template v-else>{{ finder.formatFileSize(item.asset.size) }}</template>
        </td>
        <td class="ginko:whitespace-nowrap ginko:px-3 ginko:py-1.5 ginko:text-muted-foreground">
          {{
            item.type === 'folder'
              ? t('ginkoCms.studio.assetBrowser.folderKind')
              : mimeKind(item.asset.mimeType)
          }}
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
