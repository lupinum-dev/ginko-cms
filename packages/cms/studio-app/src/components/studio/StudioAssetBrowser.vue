<script setup lang="ts">
import { FolderOpen, Loader2, Upload } from '@lucide/vue'
import { computed, ref } from 'vue'

import { api } from '../../boundary/api'
import type { StudioAssetBrowserMode } from '../../composables/internal/assetFinderTypes'
import {
  createStudioAssetBrowserContext,
  provideStudioAssetBrowserContext,
} from '../../composables/internal/studioAssetBrowserContext'
import type { StudioAssetContext, StudioAssetRecord } from '../../composables/internal/types'
import { useStudioAssetFinder } from '../../composables/internal/useStudioAssetFinder'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioSettings } from '../../composables/useCmsStudioSettings'
import { useConvexMutation } from '../../composables/useStudioConvex'
import StudioAssetBulkBar from './assets/StudioAssetBulkBar.vue'
import StudioAssetGridView from './assets/StudioAssetGridView.vue'
import StudioAssetListView from './assets/StudioAssetListView.vue'
import StudioAssetManageDrawer from './assets/StudioAssetManageDrawer.vue'
import StudioAssetMobileDetailsSheet from './assets/StudioAssetMobileDetailsSheet.vue'
import StudioAssetMobileFilters from './assets/StudioAssetMobileFilters.vue'
import StudioAssetMobileScopes from './assets/StudioAssetMobileScopes.vue'
import StudioAssetNav from './assets/StudioAssetNav.vue'
import StudioAssetPickDetails from './assets/StudioAssetPickDetails.vue'
import StudioAssetReplaceDialog from './assets/StudioAssetReplaceDialog.vue'
import StudioAssetToolbar from './assets/StudioAssetToolbar.vue'
import StudioAssetTrashDialog from './assets/StudioAssetTrashDialog.vue'

// Shell for the asset browser: owns props/defineExpose, the finder call, the
// context assembly + provide, the hidden upload input, the in-card header, the
// split-pane skeleton, and the loading/empty/view dispatch. Every focused
// surface lives in ./assets and injects the provided context.
const props = withDefaults(
  defineProps<{
    mode?: StudioAssetBrowserMode
    assetContext?: StudioAssetContext
    acceptedTypes?: string[]
    aspectRatio?: string | null
    modelValue?: string | string[] | null
    multiple?: boolean
    title?: string
    embedded?: boolean
  }>(),
  {
    mode: 'manage',
    aspectRatio: null,
    modelValue: null,
  },
)

const emit = defineEmits<{
  'select-asset': [asset: StudioAssetRecord]
  'update:modelValue': [value: string | string[]]
  uploaded: [assetId: string]
  close: []
}>()

const { t } = useCmsI18n()
const studioSettings = useCmsStudioSettings()
const updateAsset = useConvexMutation(api.ginkoCms.assets.updateAsset)

const acceptedTypesInit = (props.acceptedTypes?.filter(Boolean) ?? []) as string[]
const initialTypeFilter = acceptedTypesInit.some(
  (type) => type === 'image/*' || type.startsWith('image/'),
)
  ? 'image'
  : 'all'

const pendingUploadedAssetId = ref<string | null>(null)

const finder = useStudioAssetFinder({
  allowedTypes: acceptedTypesInit,
  aspectRatio: props.aspectRatio,
  assetContext: props.assetContext,
  initialTypeFilter,
  mode: props.mode,
  onAssetUploaded: (assetId) => {
    pendingUploadedAssetId.value = assetId
    emit('uploaded', assetId)
  },
})

const { uploadInput, replacementInput, uploading, handleUpload, handleReplacementUpload } = finder

const context = createStudioAssetBrowserContext({
  finder,
  props,
  emit,
  t,
  studioSettings,
  updateAsset,
  pendingUploadedAssetId,
})
provideStudioAssetBrowserContext(context)

const { mode: browserMode, presentation, flow, trash } = context
const isPickMode = browserMode.isPickMode
const inputAccept = browserMode.inputAccept
const hasError = computed(() => !!(finder.error.value || flow.localError.value))

defineExpose({
  uploadInput,
  uploading,
})
</script>

<template>
  <div
    class="ginko:flex ginko:min-h-0 ginko:flex-1 ginko:flex-col ginko:overflow-hidden"
    :class="props.embedded ? 'ginko:h-full' : ''"
  >
    <input
      ref="uploadInput"
      type="file"
      :multiple="props.mode === 'manage'"
      class="ginko:hidden"
      :accept="inputAccept"
      @change="handleUpload"
    />
    <input
      ref="replacementInput"
      type="file"
      class="ginko:hidden"
      :accept="finder.selectedAsset.value?.mimeType"
      @change="handleReplacementUpload"
    />
    <div
      v-if="!props.embedded"
      class="ginko:flex ginko:min-h-12 ginko:shrink-0 ginko:items-center ginko:justify-between ginko:gap-3 ginko:border-b ginko:px-4 ginko:py-2"
    >
      <div class="ginko:min-w-0">
        <h3 class="ginko:truncate studio-text-title">{{ browserMode.title.value }}</h3>
        <p v-if="isPickMode" class="ginko:truncate ginko:text-xs ginko:text-muted-foreground">
          {{ t('ginkoCms.studio.assetBrowser.pickerHint') }}
        </p>
      </div>
      <Button size="sm" :disabled="uploading" @click="uploadInput?.click()">
        <Loader2 v-if="uploading" class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin" />
        <Upload v-else class="ginko:mr-1.5 ginko:size-3.5" />
        {{ t('ginkoCms.common.upload') }}
      </Button>
    </div>

    <StudioSplitPane
      storage-id="ginko-studio-assets-split"
      :nav-default-size="16"
      class="ginko:overflow-hidden"
    >
      <template #nav>
        <StudioAssetNav />
      </template>

      <div class="ginko:flex ginko:min-h-0 ginko:min-w-0 ginko:flex-1 ginko:flex-col">
        <StudioAssetToolbar />

        <StudioAssetBulkBar
          v-if="browserMode.mode.value === 'manage' && finder.hasAssetSelection.value"
        />

        <ScrollArea class="ginko:flex-1">
          <div v-if="hasError" class="ginko:px-6 ginko:pt-4">
            <StudioNotice
              tone="danger"
              :description="flow.localError.value || finder.error.value"
            />
          </div>

          <div
            v-if="finder.isLoading.value"
            class="ginko:grid ginko:grid-cols-1 ginko:gap-2 ginko:p-6"
          >
            <Skeleton v-for="index in 12" :key="index" class="ginko:h-9" />
          </div>

          <StudioEmptyState
            v-else-if="finder.currentItems.value.length === 0"
            class="ginko:m-6 ginko:border-0 ginko:bg-transparent"
            :title="t('ginkoCms.studio.assetBrowser.emptyTitle')"
            :description="
              finder.activeFilterCount.value > 0
                ? t('ginkoCms.studio.assetBrowser.emptyFilterHint')
                : undefined
            "
          >
            <template #icon>
              <FolderOpen class="ginko:size-5" aria-hidden="true" />
            </template>
            <template v-if="finder.activeFilterCount.value === 0" #action>
              <Button size="sm" :disabled="uploading" @click="uploadInput?.click()">
                <Loader2 v-if="uploading" class="ginko:mr-1.5 ginko:size-3.5 ginko:animate-spin" />
                <Upload v-else class="ginko:mr-1.5 ginko:size-3.5" />
                Upload
              </Button>
            </template>
          </StudioEmptyState>

          <StudioAssetListView v-else-if="finder.viewMode.value === 'list'" />
          <StudioAssetGridView v-else />
        </ScrollArea>

        <div
          class="ginko:shrink-0 ginko:border-t ginko:px-4 ginko:py-1.5 ginko:text-xs ginko:tabular-nums ginko:text-muted-foreground/60"
        >
          {{ presentation.statusText.value }}
        </div>
      </div>

      <StudioAssetPickDetails />

      <StudioAssetMobileScopes
        v-model:open="flow.mobileScopesOpen.value"
        :mode="browserMode.mode.value"
        :collections="finder.sidebarCollections.value"
        :tags="finder.sidebarTags.value"
        :full-views="finder.sidebarFullViews.value"
        :trash-count="finder.trashCount.value"
        :is-active="finder.isSidebarActive"
        @select="flow.selectMobileSidebar"
      />

      <StudioAssetMobileFilters
        v-model:open="flow.mobileFiltersOpen.value"
        v-model:view-mode="finder.viewMode.value"
        v-model:sort-by="finder.sortBy.value"
        v-model:type-filter="finder.typeFilter.value"
        v-model:time-filter="finder.timeFilter.value"
        v-model:usage-filter="finder.usageFilter.value"
        v-model:size-filter="finder.sizeFilter.value"
        @clear="finder.clearFilters"
      />

      <StudioAssetMobileDetailsSheet />

      <StudioAssetManageDrawer />
    </StudioSplitPane>
  </div>

  <StudioAssetTrashDialog
    :action="trash.pendingDestructiveAssetAction.value"
    @update:open="trash.handleDestructiveDialogOpen"
    @confirm="trash.confirmDestructiveAssetAction"
  />
  <StudioAssetReplaceDialog
    :replacement="finder.pendingAssetReplacement.value"
    :pending="finder.replacing.value"
    @update:open="finder.handleReplacementDialogOpen"
    @confirm="finder.confirmAssetReplacement"
  />
</template>
