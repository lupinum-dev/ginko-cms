<script setup lang="ts">
import { useConvex } from '@lupinum/better-convex-vue'
import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_SIZE_BYTES,
} from '@lupinum/ginko-cms-contract/shared/assetPolicy.js'
import {
  GinkoImagePicker,
  type EditorImage,
  type EditorImagePickerItem,
  type ImagePicker,
  type ImageUploadHandler,
} from '@lupinum/ginko-editor'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { api } from '../../../boundary/api'
import { finderAssetToStudioAsset } from '../../../composables/internal/assetFinderUtils'
import type { StudioAssetContext } from '../../../composables/internal/types'
import { useCmsStudioPaginatedQuery } from '../../../composables/useCmsStudioPaginatedQuery'
import { useConvexAction, useConvexUpload } from '../../../composables/useStudioConvex'
import { mapStudioAssetToImageInfo } from './richtextAssetMapping'

const props = defineProps<{ assetContext: StudioAssetContext; disabled?: boolean }>()
const emit = defineEmits<{ resolved: [id: string, url: string] }>()
const host = ref<HTMLElement>()
const overlayContainer = ref<HTMLElement>()
onMounted(() => {
  overlayContainer.value = host.value?.closest<HTMLElement>('.ginko-cms--studio') ?? host.value
})
const open = ref(false)
const query = ref('')
let finishPicker: ((image: EditorImage | null) => void) | undefined
let disposed = false
const convex = useConvex()
const upload = useConvexUpload(
  api.ginkoCms.assets.createAssetUploadSession,
  api.ginkoCms.assets.claimAssetUploadSession,
  {
    allowedTypes: ALLOWED_ASSET_MIME_TYPES.filter((type) => type.startsWith('image/')),
    maxSizeBytes: MAX_ASSET_SIZE_BYTES,
  },
)
const finalizeUpload = useConvexAction(api.ginkoCms.assets.finalizeAssetUploadSession)
const assets = useCmsStudioPaginatedQuery(
  api.ginkoCms.assets.getAssetManagerData,
  () =>
    open.value
      ? {
          kind: 'image' as const,
          deleted: 'active' as const,
          location: 'accessible' as const,
          collection: props.assetContext.collection,
          entryId: props.assetContext.entryId,
          search: query.value.trim() || undefined,
          sort: 'name' as const,
        }
      : 'skip',
  { initialNumItems: 40 },
)
const images = computed<EditorImagePickerItem[]>(() =>
  (assets.data.value ?? []).map((asset) => ({
    key: asset.id,
    label: asset.filename,
    image: {
      ...mapStudioAssetToImageInfo(finderAssetToStudioAsset(asset), props.assetContext.locale),
      id: asset.id,
    },
    thumbnailUrl: asset.url ?? undefined,
  })),
)

const pick: ImagePicker = ({ signal }) => {
  finishPicker?.(null)
  if (signal.aborted || props.disabled || disposed) return Promise.resolve(null)
  open.value = true
  query.value = ''
  return new Promise((resolve) => {
    const finish = (image: EditorImage | null) => {
      signal.removeEventListener('abort', cancel)
      if (finishPicker === finish) {
        finishPicker = undefined
        open.value = false
      }
      resolve(image)
    }
    const cancel = () => finish(null)
    finishPicker = finish
    signal.addEventListener('abort', cancel, { once: true })
  })
}
function select(image: EditorImage) {
  if (props.disabled) return
  if (image.id && image.url) emit('resolved', image.id, image.url)
  finishPicker?.(image)
}

// The existing uploader has one operation scope. Serialize its use so two
// editor placeholders cannot retire one another's upload session.
let uploadQueue: Promise<unknown> = Promise.resolve()
const uploadImage: ImageUploadHandler = (file, { signal }) => {
  const context = props.assetContext
  const operation = uploadQueue
    .catch(() => {})
    .then(async () => {
      signal.throwIfAborted()
      if (disposed || props.disabled) throw new Error('Image upload is unavailable.')
      const claim = await upload.upload(file)
      if (Array.isArray(claim)) throw new Error('Expected one image upload session.')
      signal.throwIfAborted()
      if (disposed || props.disabled) throw new Error('Image upload was cancelled.')
      const scope = context.entryId ? 'entry' : context.collection ? 'collection' : 'global'
      const id = await finalizeUpload({
        sessionId: claim.sessionId,
        token: claim.token,
        filename: file.name,
        scope,
        ...(scope === 'entry' ? { entryId: context.entryId } : {}),
        ...(scope !== 'global' ? { collection: context.collection } : {}),
      })
      // Before finalization, abandoned sessions are reclaimed by CMS maintenance.
      // After finalization this is a reusable library asset: cancelling insertion
      // must not delete it. Register its ownership even if the editor was closed.
      await context.onAssetRegistered?.(id, scope)
      signal.throwIfAborted()
      if (disposed) throw new Error('Image upload was cancelled.')
      const urls = await convex.query(api.ginkoCms.assets.resolveAssetUrls, { assetIds: [id] })
      signal.throwIfAborted()
      const url = urls[id]
      if (url) emit('resolved', id, url)
      return { id, alt: file.name }
    })
  uploadQueue = operation
  return operation
}

watch(
  () => [
    props.disabled,
    props.assetContext.collection,
    props.assetContext.entryId,
    props.assetContext.locale,
  ],
  () => finishPicker?.(null),
)
onBeforeUnmount(() => {
  disposed = true
  finishPicker?.(null)
})
defineExpose({ pick, upload: uploadImage })
</script>

<template>
  <div ref="host" class="ginko-cms">
    <GinkoImagePicker
      :overlay-container="overlayContainer"
      :open="open"
      :images="images"
      :query="query"
      :loading="assets.pending.value"
      :error="assets.error.value?.message"
      :has-more="assets.canLoadMore.value"
      :enable-upload="false"
      @update:open="!$event && finishPicker?.(null)"
      @update:query="query = $event"
      @load-more="assets.loadMore(40)"
      @select="select"
    />
  </div>
</template>
