<script setup lang="ts">
import { computed } from 'vue'

import { mimeKind } from '../../../composables/internal/assetFinderUtils'
import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import type { StudioAssetInfoRow } from './StudioAssetInfoList.vue'

// Picker-mode details rail (wide viewports): preview + choose action + metadata
// info + editable alt/caption. Injects the browser context.
const { t } = useCmsI18n()
const { finder, mode, pick, presentation, selection } = useStudioAssetBrowserContext()

const asset = selection.selectedAssetForDetails

const infoRows = computed<StudioAssetInfoRow[]>(() => {
  const current = asset.value
  if (!current) return []
  const rows: StudioAssetInfoRow[] = [
    {
      label: t('ginkoCms.studio.assetBrowser.filename'),
      value: current.filename,
      rowClass: 'ginko:flex ginko:justify-between ginko:gap-3',
      valueClass: 'ginko:truncate ginko:font-mono',
    },
    { label: t('ginkoCms.studio.assetBrowser.kind'), value: mimeKind(current.mimeType) },
    { label: t('ginkoCms.studio.assetBrowser.size'), value: finder.formatFileSize(current.size) },
  ]
  if (current.width) {
    rows.push({
      label: t('ginkoCms.studio.assetBrowser.dimensions'),
      value: `${current.width} x ${current.height}`,
    })
  }
  rows.push({
    label: t('ginkoCms.studio.assetBrowser.ownership'),
    value: presentation.ownershipLabel(current),
    badge: true,
  })
  rows.push({
    label: t('ginkoCms.studio.assetBrowser.ownerPath'),
    value: presentation.ownerPathLabel(current),
    rowClass: 'ginko:flex ginko:justify-between ginko:gap-3',
    valueClass: 'ginko:truncate',
  })
  if (current.collectionLabel) {
    rows.push({
      label: t('ginkoCms.studio.assetBrowser.collection'),
      value: current.collectionLabel,
      rowClass: 'ginko:flex ginko:justify-between ginko:gap-3',
      valueClass: 'ginko:truncate',
    })
  }
  if (current.entryTitle) {
    rows.push({
      label: t('ginkoCms.studio.assetBrowser.entry'),
      value: current.entryTitle,
      rowClass: 'ginko:flex ginko:justify-between ginko:gap-3',
      valueClass: 'ginko:truncate',
    })
  }
  rows.push({
    label: t('ginkoCms.studio.assetBrowser.usage'),
    value: t(
      current.usages.length === 1
        ? 'ginkoCms.studio.assetBrowser.usagePlacesOne'
        : 'ginkoCms.studio.assetBrowser.usagePlacesOther',
      { count: current.usages.length },
    ),
  })
  return rows
})
</script>

<template>
  <aside
    v-if="mode.isPickMode.value"
    class="ginko:hidden ginko:w-[280px] ginko:shrink-0 ginko:border-l ginko:bg-background ginko:@5xl:block"
  >
    <ScrollArea class="ginko:h-full">
      <div class="ginko:space-y-4 ginko:p-4">
        <template v-if="asset">
          <div
            class="ginko:overflow-hidden ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/40"
          >
            <img
              v-if="presentation.canShowPreview(asset)"
              :src="asset.thumbnailUrl ?? undefined"
              :alt="asset.filename"
              class="ginko:max-h-52 ginko:w-full ginko:object-contain"
              @error="presentation.markPreviewFailed(asset)"
            />
            <div v-else class="ginko:flex ginko:items-center ginko:justify-center ginko:py-12">
              <Icon
                :name="finder.mimeIcon(asset.mimeType)"
                class="ginko:size-12 ginko:text-muted-foreground/40"
              />
            </div>
          </div>
          <Button class="ginko:w-full" size="sm" @click="pick.chooseAsset(asset)">
            {{
              mode.multiple.value && pick.isChosen(asset.id)
                ? t('ginkoCms.common.remove')
                : t('ginkoCms.studio.assetBrowser.choose')
            }}
          </Button>
          <StudioAssetInfoList :rows="infoRows" />
          <Separator />
          <StudioAssetMetadataFields :asset="asset" />
        </template>
        <div v-else class="ginko:text-sm ginko:text-muted-foreground">
          {{ t('ginkoCms.studio.assetBrowser.inspectEmpty') }}
        </div>
      </div>
    </ScrollArea>
  </aside>
</template>
