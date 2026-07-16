<script setup lang="ts">
import { useStudioAssetBrowserContext } from '../../../composables/internal/studioAssetBrowserContext'
import { useCmsI18n } from '../../../composables/useCmsI18n'

// Manage-mode bulk action bar (tag, share, trash, clear) for the current
// visible selection. The shell mounts it only when a selection exists.
const { t } = useCmsI18n()
const { finder, tags, selection, flow } = useStudioAssetBrowserContext()
</script>

<template>
  <div
    class="ginko:flex ginko:shrink-0 ginko:items-center ginko:gap-2 ginko:border-b ginko:bg-muted/20 ginko:px-3 ginko:py-2"
  >
    <Badge variant="outline" class="ginko:text-xs">{{
      t('ginkoCms.studio.assetBrowser.selectedCount', {
        count: finder.selectedVisibleAssetIds.value.length,
      })
    }}</Badge>
    <Input
      v-model="tags.bulkTagInput.value"
      :placeholder="t('ginkoCms.studio.assetBrowser.tagSelectedPlaceholder')"
      class="ginko:h-8 ginko:max-w-48 ginko:text-xs"
      @keydown="tags.handleBulkTagKeydown"
    />
    <Button
      size="sm"
      variant="outline"
      class="ginko:h-8 ginko:text-xs"
      :disabled="finder.actionPending.value"
      @click="tags.commitBulkTag('add')"
    >
      {{ t('ginkoCms.studio.assetBrowser.addTag') }}
    </Button>
    <Button
      size="sm"
      variant="outline"
      class="ginko:h-8 ginko:text-xs"
      :disabled="finder.actionPending.value"
      @click="tags.commitBulkTag('remove')"
    >
      {{ t('ginkoCms.studio.assetBrowser.removeTag') }}
    </Button>
    <Button
      v-if="selection.canBulkShareInCollection.value"
      size="sm"
      variant="outline"
      class="ginko:h-8 ginko:text-xs"
      :disabled="finder.actionPending.value"
      @click="finder.moveAssetsToCollection([...finder.selectedVisibleAssetIds.value])"
    >
      {{ t('ginkoCms.studio.assetBrowser.makeAvailableCollection') }}
    </Button>
    <Button
      v-if="selection.canBulkMakeGlobal.value"
      size="sm"
      variant="outline"
      class="ginko:h-8 ginko:text-xs"
      :disabled="finder.actionPending.value"
      @click="finder.moveAssetsToGlobal([...finder.selectedVisibleAssetIds.value])"
    >
      {{ t('ginkoCms.studio.assetBrowser.makeAvailableEverywhere') }}
    </Button>
    <Button
      size="sm"
      variant="outline"
      class="ginko:h-8 ginko:text-xs ginko:text-destructive ginko:hover:text-destructive"
      :disabled="finder.actionPending.value"
      @click="flow.requestTrashSelectedAssets"
    >
      {{ t('ginkoCms.studio.assetBrowser.moveToTrash') }}
    </Button>
    <Button
      size="sm"
      variant="ghost"
      class="ginko:ml-auto ginko:h-8 ginko:text-xs"
      :disabled="finder.actionPending.value"
      @click="finder.clearAssetSelection"
    >
      {{ t('ginkoCms.studio.assetBrowser.clear') }}
    </Button>
  </div>
</template>
