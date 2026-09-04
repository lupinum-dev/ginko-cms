<script setup lang="ts">
import { ArrowUp, Globe, RefreshCw, Trash2, Undo2, X } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

import { mimeKind } from '../../../composables/internal/assetFinderUtils'
import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import Sheet from '../../ui/sheet/Sheet.vue'
import SheetContent from '../../ui/sheet/SheetContent.vue'
import SheetDescription from '../../ui/sheet/SheetDescription.vue'
import SheetHeader from '../../ui/sheet/SheetHeader.vue'
import SheetTitle from '../../ui/sheet/SheetTitle.vue'
import type { StudioAssetInfoRow } from './StudioAssetInfoList.vue'

// Bottom-sheet asset details for narrow viewports. The sheet is portaled to the
// body, where container queries can't reach the split pane, so the original
// `lg:hidden` becomes a useMediaQuery gate (mirroring StudioSplitPane) — no
// viewport CSS variant survives in this component.
const { t } = useCmsI18n()
const { finder, mode, pick, presentation, selection, flow, tags } = useStudioAssetBrowserContext()

const lgUp = useMediaQuery('(min-width: 1024px)')
const detailAsset = selection.selectedAssetForDetails

const open = computed({
  get: () => flow.mobileDetailsOpen.value && !lgUp.value,
  set: (value: boolean) => {
    flow.mobileDetailsOpen.value = value
  },
})

const infoRows = computed<StudioAssetInfoRow[]>(() => {
  const current = detailAsset.value
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
    rowClass: 'ginko:flex ginko:justify-between ginko:gap-3',
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
  return rows
})
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="bottom" class="ginko:max-h-[88dvh] ginko:rounded-t-xl ginko:p-0">
      <template v-if="detailAsset">
        <SheetHeader class="ginko:border-b ginko:pr-12">
          <SheetTitle class="ginko:truncate ginko:text-sm">{{ detailAsset.filename }}</SheetTitle>
          <SheetDescription>{{ presentation.ownershipLabel(detailAsset) }}</SheetDescription>
        </SheetHeader>
        <ScrollArea class="ginko:flex-1">
          <div class="ginko:space-y-4 ginko:p-4 ginko:pb-24">
            <div
              class="ginko:overflow-hidden ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/40"
            >
              <img
                v-if="presentation.canShowPreview(detailAsset)"
                :src="detailAsset.thumbnailUrl ?? undefined"
                :alt="detailAsset.filename"
                class="ginko:max-h-64 ginko:w-full ginko:object-contain"
                @error="presentation.markPreviewFailed(detailAsset)"
              />
              <div v-else class="ginko:flex ginko:items-center ginko:justify-center ginko:py-12">
                <Icon
                  :name="finder.mimeIcon(detailAsset.mimeType)"
                  class="ginko:size-12 ginko:text-muted-foreground/40"
                />
              </div>
            </div>

            <StudioAssetInfoList :rows="infoRows" />

            <Separator />

            <StudioAssetMetadataFields
              :asset="detailAsset"
              show-coverage
              show-copy-button
              show-spinner
              disable-inputs
              input-class="ginko:h-9 ginko:text-sm"
            />

            <template v-if="mode.mode.value === 'manage'">
              <Separator />
              <StudioAssetUsageList :asset="detailAsset" />

              <Separator />
              <div class="ginko:space-y-2">
                <h4
                  class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                >
                  {{ t('ginkoCms.studio.assetBrowser.tags') }}
                </h4>
                <div
                  v-if="finder.selectedAssetTags.value.length > 0"
                  class="ginko:flex ginko:flex-wrap ginko:gap-1.5"
                >
                  <button
                    v-for="tag in finder.selectedAssetTags.value"
                    :key="`mobile-detail-tag:${tag}`"
                    class="ginko:inline-flex ginko:items-center ginko:gap-1 ginko:rounded-full ginko:bg-muted/60 ginko:px-2 ginko:py-0.5 ginko:text-xs ginko:transition-colors ginko:hover:bg-muted"
                    :disabled="finder.actionPending.value"
                    @click="finder.removeTagFromSelectedAsset(tag)"
                  >
                    <span>{{
                      finder.sidebarTags.value.find((sidebarTag) => sidebarTag.key === tag)
                        ?.label ?? tag
                    }}</span>
                    <X class="ginko:size-3" />
                  </button>
                </div>
                <Input
                  v-model="tags.selectedTagInput.value"
                  :placeholder="t('ginkoCms.studio.assetBrowser.addTagPlaceholder')"
                  class="ginko:h-8 ginko:text-xs"
                  :disabled="finder.actionPending.value"
                  @keydown="tags.handleSelectedTagKeydown"
                />
              </div>

              <Separator />
              <div class="ginko:space-y-1.5">
                <template v-if="detailAsset.deletedAt">
                  <Button
                    variant="outline"
                    size="sm"
                    class="ginko:w-full ginko:justify-start ginko:text-xs"
                    :disabled="finder.actionPending.value"
                    @click="finder.restoreSelectedAsset"
                  >
                    <Undo2 class="ginko:mr-2 ginko:size-3.5" />
                    {{ t('ginkoCms.studio.assetBrowser.restore') }}
                  </Button>
                </template>
                <template v-else>
                  <Button
                    variant="outline"
                    size="sm"
                    class="ginko:w-full ginko:justify-start ginko:text-xs"
                    :disabled="finder.actionPending.value"
                    @click="finder.requestReplaceSelectedAsset"
                  >
                    <RefreshCw class="ginko:mr-2 ginko:size-3.5" aria-hidden="true" />
                    {{ t('ginkoCms.studio.assetBrowser.replaceFile') }}
                  </Button>
                  <Button
                    v-if="detailAsset.scope === 'entry' && detailAsset.collection"
                    variant="outline"
                    size="sm"
                    class="ginko:w-full ginko:justify-start ginko:text-xs"
                    :disabled="finder.actionPending.value"
                    @click="finder.moveSelectedAssetToCollection"
                  >
                    <ArrowUp class="ginko:mr-2 ginko:size-3.5" />
                    {{ t('ginkoCms.studio.assetBrowser.makeAvailableCollection') }}
                  </Button>
                  <Button
                    v-if="detailAsset.scope !== 'global'"
                    variant="outline"
                    size="sm"
                    class="ginko:w-full ginko:justify-start ginko:text-xs"
                    :disabled="finder.actionPending.value"
                    @click="finder.moveSelectedAssetToGlobal"
                  >
                    <Globe class="ginko:mr-2 ginko:size-3.5" />
                    {{ t('ginkoCms.studio.assetBrowser.makeAvailableEverywhere') }}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="ginko:w-full ginko:justify-start ginko:text-xs ginko:text-destructive ginko:hover:text-destructive"
                    :disabled="finder.actionPending.value"
                    @click="flow.requestTrashAsset(detailAsset)"
                  >
                    <Trash2 class="ginko:mr-2 ginko:size-3.5" />
                    {{ t('ginkoCms.studio.assetBrowser.moveToTrash') }}
                  </Button>
                </template>
              </div>
            </template>
          </div>
        </ScrollArea>
        <div
          v-if="mode.isPickMode.value"
          class="ginko:absolute ginko:inset-x-0 ginko:bottom-0 ginko:border-t ginko:bg-background ginko:p-4"
        >
          <Button class="ginko:w-full" @click="pick.chooseAsset(detailAsset)">
            {{
              mode.multiple.value && pick.isChosen(detailAsset.id)
                ? t('ginkoCms.common.remove')
                : t('ginkoCms.studio.assetBrowser.choose')
            }}
          </Button>
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>
