<script setup lang="ts">
import { File, ImagePlus, X } from '@lucide/vue'
import { computed, ref } from 'vue'

import { api } from '../../boundary/api'
import type { StudioAssetContext, StudioAssetRecord } from '../../composables/internal/types'
import { useCmsI18n } from '../../composables/useCmsI18n'
import { useCmsStudioQuery } from '../../composables/useCmsStudioQuery'

const props = withDefaults(
  defineProps<{
    modelValue: string | string[] | null
    multiple?: boolean
    kind?: string
    accept?: string[]
    aspectRatio?: string | null
    label?: string
    open?: boolean
    showTrigger?: boolean
    disabled?: boolean
    assetContext: StudioAssetContext
  }>(),
  {
    open: undefined,
    showTrigger: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | string[] | null]
  'update:open': [value: boolean]
  'select-asset': [asset: StudioAssetRecord]
}>()

const openState = ref(false)
const { t } = useCmsI18n()

const acceptedTypes = computed(() =>
  props.accept?.length ? props.accept : props.kind === 'image' ? ['image/*'] : undefined,
)

const open = computed({
  get: () => props.open ?? openState.value,
  set: (value: boolean) => {
    openState.value = value
    emit('update:open', value)
  },
})

const normalizedValue = computed(() => {
  if (Array.isArray(props.modelValue)) return props.modelValue
  if (typeof props.modelValue === 'string' && props.modelValue.length > 0) return [props.modelValue]
  return []
})

const managerDataQuery = useCmsStudioQuery(api.ginkoCms.assets.getAssetManagerData, {
  paginationOpts: { cursor: null, numItems: 100 },
})

const previewAssets = computed<StudioAssetRecord[]>(() => {
  const data = managerDataQuery.data?.value
  const page = Array.isArray(data) ? data : data?.page
  if (!Array.isArray(page)) return []
  return page.map((asset) => ({
    _id: asset.id ?? asset._id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    url: asset.url,
    alt: asset.alt,
    caption: asset.caption,
    entryId: asset.entryId,
    collectionId: asset.collectionId,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  }))
})

const assetsById = computed(() => {
  const map = /* @__PURE__ */ new Map<string, StudioAssetRecord>()
  for (const asset of previewAssets.value) {
    map.set(asset._id, asset)
  }
  return map
})

function handleSelectAsset(asset: StudioAssetRecord) {
  if (props.disabled) return
  emit('select-asset', asset)
}

function removeAsset(assetId: string) {
  if (props.disabled) return
  if (props.multiple) {
    emit(
      'update:modelValue',
      normalizedValue.value.filter((item) => item !== assetId),
    )
    return
  }
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="ginko:space-y-2">
    <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
      <div
        v-for="assetId in normalizedValue"
        :key="assetId"
        class="ginko:flex ginko:items-center ginko:gap-1.5 ginko:rounded-md ginko:border ginko:px-1.5 ginko:py-1"
      >
        <img
          v-if="
            assetsById.get(assetId)?.mimeType?.startsWith('image/') && assetsById.get(assetId)?.url
          "
          :src="assetsById.get(assetId)?.url ?? undefined"
          :alt="assetsById.get(assetId)?.filename"
          class="ginko:size-8 ginko:rounded ginko:object-cover"
        />
        <File v-else class="ginko:size-4 ginko:text-muted-foreground" />
        <span
          class="ginko:max-w-[120px] ginko:truncate ginko:font-mono ginko:text-xs ginko:text-muted-foreground"
        >
          {{ assetsById.get(assetId)?.filename ?? assetId }}
        </span>
        <Button
          v-if="!disabled"
          type="button"
          size="icon"
          variant="ghost"
          class="ginko:size-5"
          :aria-label="
            t('ginkoCms.studio.assetPicker.removeAsset', {
              name: assetsById.get(assetId)?.filename ?? assetId,
            })
          "
          @click="removeAsset(assetId)"
        >
          <X class="ginko:size-3" />
        </Button>
      </div>
      <Button
        v-if="showTrigger && !disabled"
        data-testid="studio-asset-picker-trigger"
        size="sm"
        variant="outline"
        @click="open = true"
      >
        <ImagePlus class="ginko:mr-1.5 ginko:size-3.5" />
        {{
          multiple
            ? t('ginkoCms.studio.assetPicker.manageAssets')
            : t('ginkoCms.studio.assetPicker.chooseAsset')
        }}
      </Button>
    </div>

    <Dialog :open="open" @update:open="open = $event">
      <DialogContent
        size="full"
        class="ginko:h-[min(calc(100vh-2rem),40rem)] ginko:!w-[min(calc(100vw-2rem),72rem)] ginko:grid-rows-[auto_minmax(0,1fr)] ginko:gap-0 ginko:overflow-hidden ginko:p-0"
      >
        <DialogHeader class="ginko:border-b ginko:px-5 ginko:py-4 ginko:pr-14">
          <DialogTitle>{{ label ?? t('ginkoCms.studio.assetPicker.title') }}</DialogTitle>
          <DialogDescription>
            {{ t('ginkoCms.studio.assetPicker.description') }}
          </DialogDescription>
        </DialogHeader>
        <StudioAssetBrowser
          mode="pick"
          :title="label"
          :model-value="modelValue"
          :multiple="multiple"
          :asset-context="assetContext"
          :accepted-types="acceptedTypes"
          :aspect-ratio="aspectRatio"
          embedded
          class="ginko:min-h-0"
          @update:model-value="emit('update:modelValue', $event)"
          @select-asset="handleSelectAsset"
          @close="open = false"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>
