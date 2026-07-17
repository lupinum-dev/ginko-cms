<script setup lang="ts">
import { AlertTriangle, ArrowUp, Globe, Link, Trash2, Undo2, X } from '@lucide/vue'
import { computed } from 'vue'

import { mimeKind } from '../../../composables/internal/assetFinderUtils'
import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { humanizeFieldPath } from '../../../lib/fieldLabel'
import Sheet from '../../ui/sheet/Sheet.vue'
import SheetContent from '../../ui/sheet/SheetContent.vue'
import SheetDescription from '../../ui/sheet/SheetDescription.vue'
import SheetHeader from '../../ui/sheet/SheetHeader.vue'
import SheetTitle from '../../ui/sheet/SheetTitle.vue'
import type { StudioAssetInfoRow } from './StudioAssetInfoList.vue'

const { t } = useCmsI18n()
const { finder, presentation, selection, flow, tags } = useStudioAssetBrowserContext()

const selected = finder.selectedAsset

const basicRows = computed<StudioAssetInfoRow[]>(() => {
  const current = selected.value
  if (!current) return []
  const rows: StudioAssetInfoRow[] = [
    {
      label: t('ginkoCms.studio.assetBrowser.filename'),
      value: current.filename,
      valueClass: 'ginko:ml-2 ginko:max-w-[200px] ginko:truncate ginko:font-mono',
    },
    { label: t('ginkoCms.studio.assetBrowser.kind'), value: mimeKind(current.mimeType) },
    { label: t('ginkoCms.studio.assetBrowser.size'), value: finder.formatFileSize(current.size) },
  ]
  if (current.width)
    rows.push({
      label: t('ginkoCms.studio.assetBrowser.dimensions'),
      value: `${current.width} x ${current.height}`,
    })
  rows.push({
    label: t('ginkoCms.studio.assetBrowser.created'),
    value: finder.formatDate(current.createdAt),
  })
  if (current.updatedAt)
    rows.push({
      label: t('ginkoCms.studio.assetBrowser.modified'),
      value: finder.formatDate(current.updatedAt),
    })
  return rows
})

function countLabel(count: number, one: string, other: string) {
  return t(count === 1 ? one : other, { count })
}

const selectedTagCountLabel = computed(() =>
  countLabel(
    finder.selectedAssetTags.value.length,
    'ginkoCms.studio.assetBrowser.tagsCountOne',
    'ginkoCms.studio.assetBrowser.tagsCountOther',
  ),
)

const locationRows = computed<StudioAssetInfoRow[]>(() => {
  const current = selected.value
  if (!current) return []
  return [
    {
      label: t('ginkoCms.studio.assetBrowser.ownership'),
      value: presentation.ownershipLabel(current),
    },
    {
      label: t('ginkoCms.studio.assetBrowser.ownerPath'),
      value: presentation.ownerPathLabel(current),
    },
    ...(current.collectionLabel
      ? [{ label: t('ginkoCms.studio.assetBrowser.collection'), value: current.collectionLabel }]
      : []),
    ...(current.entryTitle
      ? [{ label: t('ginkoCms.studio.assetBrowser.entry'), value: current.entryTitle }]
      : []),
  ]
})

const usageCountLabel = computed(() =>
  countLabel(
    selected.value?.usages.length ?? 0,
    'ginkoCms.studio.assetBrowser.usedInOne',
    'ginkoCms.studio.assetBrowser.usedInOther',
  ),
)
</script>

<template>
  <Sheet v-model:open="selection.drawerOpen.value">
    <SheetContent side="right" class="ginko:p-0">
      <template v-if="selected">
        <SheetHeader class="ginko:border-b ginko:pr-12">
          <SheetTitle class="ginko:truncate ginko:text-sm">{{ selected.filename }}</SheetTitle>
          <SheetDescription>{{ presentation.ownershipLabel(selected) }}</SheetDescription>
        </SheetHeader>
        <ScrollArea class="ginko:flex-1">
          <div class="ginko:space-y-5 ginko:p-5">
            <div
              class="ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/50 ginko:bg-muted/40"
            >
              <img
                v-if="presentation.canShowPreview(selected)"
                :src="selected.thumbnailUrl ?? undefined"
                :alt="selected.filename"
                class="ginko:max-h-56 ginko:w-full ginko:object-contain"
                @error="presentation.markPreviewFailed(selected)"
              />
              <div v-else class="ginko:flex ginko:items-center ginko:justify-center ginko:py-12">
                <Icon
                  :name="finder.mimeIcon(selected.mimeType)"
                  class="ginko:size-16 ginko:text-muted-foreground/40"
                />
              </div>
            </div>
            <div class="ginko:space-y-2">
              <div class="ginko:flex ginko:items-center ginko:justify-between ginko:gap-2">
                <h4
                  class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
                >
                  {{ t('ginkoCms.studio.assetBrowser.tags') }}
                </h4>
                <span
                  class="ginko:text-xs ginko:text-muted-foreground/50"
                  v-text="selectedTagCountLabel"
                />
              </div>
              <div
                v-if="finder.selectedAssetTags.value.length > 0"
                class="ginko:flex ginko:flex-wrap ginko:gap-1.5"
              >
                <button
                  v-for="tag in finder.selectedAssetTags.value"
                  :key="tag"
                  class="ginko:inline-flex ginko:items-center ginko:gap-1 ginko:rounded-full ginko:bg-muted/60 ginko:px-2 ginko:py-0.5 ginko:text-xs ginko:transition-colors ginko:hover:bg-muted"
                  :disabled="finder.actionPending.value"
                  @click="finder.removeTagFromSelectedAsset(tag)"
                >
                  <div
                    class="ginko:size-[6px] ginko:rounded-full"
                    :style="{
                      backgroundColor:
                        finder.sidebarTags.value.find((sidebarTag) => sidebarTag.key === tag)
                          ?.color ?? 'oklch(0 0 0 / 18%)',
                    }"
                  />
                  <span>{{
                    finder.sidebarTags.value.find((sidebarTag) => sidebarTag.key === tag)?.label ??
                    tag
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
            <StudioAssetInfoList :rows="basicRows" />
            <Separator />
            <div class="ginko:space-y-2">
              <h4
                class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
              >
                {{ t('ginkoCms.studio.assetBrowser.details') }}
              </h4>
              <StudioAssetMetadataFields
                :asset="selected"
                show-coverage
                show-copy-button
                show-locale-default
                show-spinner
                disable-inputs
                input-class="ginko:h-8 ginko:text-xs"
              />
            </div>
            <Separator />
            <div class="ginko:space-y-2.5">
              <h4
                class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
              >
                {{ t('ginkoCms.studio.assetBrowser.location') }}
              </h4>
              <StudioAssetInfoList :rows="locationRows" />
            </div>
            <Separator />
            <div class="ginko:space-y-2">
              <h4
                class="ginko:text-xs ginko:font-semibold ginko:uppercase ginko:text-muted-foreground/60"
              >
                {{ t('ginkoCms.studio.assetBrowser.usage') }}
              </h4>
              <div
                v-if="selected.usages.length === 0"
                class="ginko:flex ginko:items-center ginko:gap-1.5 ginko:text-xs ginko:text-warning-fg"
              >
                <AlertTriangle class="ginko:size-3.5" />
                {{ t('ginkoCms.studio.assetBrowser.notUsedAnywhere') }}
              </div>
              <template v-else>
                <p class="ginko:text-xs ginko:text-muted-foreground/60">{{ usageCountLabel }}</p>
                <div
                  v-for="(usage, i) in selected.usages.slice(0, 5)"
                  :key="`${usage.entryId}:${usage.fieldPath}:${i}`"
                  class="ginko:flex ginko:items-start ginko:gap-2 ginko:border-b ginko:border-border/30 ginko:py-1.5 ginko:text-xs ginko:last:border-0"
                >
                  <Link
                    class="ginko:mt-0.5 ginko:size-3 ginko:shrink-0 ginko:text-muted-foreground/50"
                  />
                  <div class="ginko:min-w-0">
                    <div class="ginko:truncate ginko:font-medium">{{ usage.entryTitle }}</div>
                    <div class="ginko:text-xs ginko:text-muted-foreground/50">
                      {{ humanizeFieldPath(usage.fieldPath) }}
                    </div>
                  </div>
                </div>
              </template>
            </div>
            <Separator />
            <div class="ginko:space-y-1.5">
              <template v-if="selected.deletedAt">
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
                  v-if="selected.scope === 'entry' && selected.collectionId"
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
                  v-if="selected.scope !== 'global'"
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
                  @click="flow.requestTrashAsset(selected)"
                >
                  <Trash2 class="ginko:mr-2 ginko:size-3.5" />
                  {{ t('ginkoCms.studio.assetBrowser.moveToTrash') }}
                </Button>
              </template>
            </div>
          </div>
        </ScrollArea>
      </template>
    </SheetContent>
  </Sheet>
</template>
