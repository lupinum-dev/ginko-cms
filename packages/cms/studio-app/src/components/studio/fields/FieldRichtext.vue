<script setup lang="ts">
import {
  createAuthoringKit,
  type AssetProvider,
  type AuthoringKitSourceV1,
  type AuthoringKitV1,
  type EditorAssetRequest,
  type GinkoEditorHandle,
  type AssetInfo,
  GinkoEditor as RichtextEditor,
} from '@lupinum/ginko-editor'

import '@lupinum/ginko-editor/style.css'
import { computed, onBeforeUnmount, ref, shallowRef, toRaw, useId, watch } from 'vue'

import { api } from '../../../boundary/api'
import { useOptionalStudioRichtextFlush } from '../../../composables/internal/studioRichtextFlush'
import type { StudioAssetContext, StudioAssetRecord } from '../../../composables/internal/types'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useCmsStudioQuery } from '../../../composables/useCmsStudioQuery'
import StudioAssetMetadataDialog from '../StudioAssetMetadataDialog.vue'
import StudioAssetPicker from '../StudioAssetPicker.vue'
import { mapStudioAssetToFileInfo, mapStudioAssetToImageInfo } from './richtextAssetMapping'
import type { FieldDefinition } from './useFieldCommon'

const props = defineProps<{
  field: FieldDefinition
  modelValue: unknown
  assetContext?: StudioAssetContext
  label: string
  fieldError: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const { t } = useCmsI18n()
const value = computed({
  get: () => (typeof props.modelValue === 'string' ? props.modelValue : ''),
  set: (v: string) => {
    if (props.disabled) return
    emit('update:modelValue', v)
  },
})

const richtextPreview = ref(false)
const conversionStatus = ref<'ok' | 'failed'>('ok')
const imagePickerOpen = ref(false)
const imagePickerAssetId = ref<string | null>(null)
const metadataDialogOpen = ref(false)
const metadataAssetId = ref<string | null>(null)
const filePickerOpen = ref(false)
const authoringKit = shallowRef<AuthoringKitV1>()
const editorRef = ref<GinkoEditorHandle | null>(null)
const richtextFlush = useOptionalStudioRichtextFlush()
const flushId = `${props.field.key}:${props.assetContext?.locale ?? ''}:${useId()}`
const authoringPending = ref(Boolean(props.assetContext?.authoringSource))
let authoringRevision = 0
let pendingImageRequest: EditorAssetRequest<Partial<AssetInfo>> | undefined
let pendingFileRequest: EditorAssetRequest<Partial<AssetInfo>> | undefined
const maxResolvedAssetIds = 200

const referencedAssetIds = computed<string[]>((previous) => {
  const ids = new Set<string>()
  const pattern = /[a-z0-9]{20,40}|[a-z0-9]+;[a-z_]+/gi
  for (const match of value.value.matchAll(pattern)) {
    ids.add(match[0])
    if (ids.size >= maxResolvedAssetIds) break
  }
  const next = Array.from(ids)
  // Keep the previous array identity when the id set is unchanged: `value`
  // updates on every keystroke, and a fresh array here would restart
  // assetUrlsQuery (a full Convex re-subscribe) mid-typing.
  if (previous && previous.length === next.length && previous.every((id, i) => id === next[i])) {
    return previous
  }
  return next
})

const assetUrlsQuery = useCmsStudioQuery(
  api.ginkoCms.assets.resolveAssetUrls,
  computed(() =>
    props.assetContext && referencedAssetIds.value.length > 0
      ? { assetIds: referencedAssetIds.value }
      : ('skip' as const),
  ),
)

// The readiness gate exists so the FIRST paint waits for asset URLs. It must
// latch: once the editor is live, a pending re-resolution (typing can extend
// a word into the asset-id pattern above) unmounting the focused editor would
// drop keystrokes and steal focus.
const editorEverReady = ref(false)
const editorReady = computed(() => {
  if (editorEverReady.value) return true
  if (authoringPending.value) return false
  if (!props.assetContext) return true
  if (referencedAssetIds.value.length === 0) return true
  const status = assetUrlsQuery.status?.value
  return status === 'success' || status === 'error'
})
watch(
  editorReady,
  (ready) => {
    if (ready) editorEverReady.value = true
  },
  { immediate: true },
)

const assetIdByUrl = computed(() => {
  const map = /* @__PURE__ */ new Map<string, string>()
  const urls = assetUrlsQuery.data?.value as Record<string, string | null> | undefined
  if (!urls) return map
  for (const [assetId, url] of Object.entries(urls)) {
    if (url) {
      map.set(url, assetId)
    }
  }
  return map
})

const assetProvider: AssetProvider = {
  buildUrl(asset) {
    const explicitUrl = typeof asset.url === 'string' ? asset.url : ''
    const assetId =
      typeof asset.id === 'string' && asset.id.length > 0
        ? asset.id
        : explicitUrl.length > 0
          ? explicitUrl
          : ''
    const urls = assetUrlsQuery.data?.value as Record<string, string | null> | undefined
    return urls?.[assetId] || explicitUrl
  },
  parseUrl(url) {
    if (!url) {
      return null
    }
    const storedId = /^[\w;:-]{1,512}$/.test(url) ? url : undefined
    return { id: storedId ?? assetIdByUrl.value.get(url), url }
  },
}

let unregisterEditor: (() => void) | undefined
watch(editorRef, (handle) => {
  unregisterEditor?.()
  unregisterEditor = handle ? richtextFlush?.register(flushId, handle) : undefined
})
onBeforeUnmount(() => unregisterEditor?.())

watch(
  () => props.assetContext?.authoringSource,
  async (source) => {
    const revision = ++authoringRevision
    authoringKit.value = undefined
    authoringPending.value = Boolean(source)
    if (!source) return
    try {
      const clone = structuredClone(toRaw(source)) as unknown as AuthoringKitSourceV1
      const resolved = await createAuthoringKit(clone)
      if (revision === authoringRevision) authoringKit.value = resolved
    } catch (error) {
      if (import.meta.dev) {
        console.debug('[ginko-cms] ignored invalid collection authoring metadata', error)
      }
    } finally {
      if (revision === authoringRevision) authoringPending.value = false
    }
  },
  { immediate: true },
)

function selectImageAsset(asset: StudioAssetRecord) {
  if (props.disabled) return
  const locale =
    typeof props.assetContext?.locale === 'string' ? props.assetContext.locale : undefined
  pendingImageRequest?.complete(mapStudioAssetToImageInfo(asset, locale))
  pendingImageRequest = undefined
  imagePickerOpen.value = false
  imagePickerAssetId.value = null
}

function selectFileAsset(asset: StudioAssetRecord) {
  if (props.disabled) return
  const locale =
    typeof props.assetContext?.locale === 'string' ? props.assetContext.locale : undefined
  pendingFileRequest?.complete(mapStudioAssetToFileInfo(asset, locale))
  pendingFileRequest = undefined
  filePickerOpen.value = false
}

function openImagePicker(request: EditorAssetRequest<Partial<AssetInfo>>) {
  if (props.disabled) return
  pendingImageRequest?.complete(null)
  pendingImageRequest = request
  imagePickerAssetId.value = null
  imagePickerOpen.value = true
}

function openImageMetadata(assetId: string) {
  if (props.disabled) return
  metadataAssetId.value = assetId
  metadataDialogOpen.value = true
}

function setMetadataDialogOpen(open: boolean) {
  metadataDialogOpen.value = open
  if (!open) metadataAssetId.value = null
}

function setImagePickerOpen(open: boolean) {
  imagePickerOpen.value = open
  if (!open) {
    pendingImageRequest?.complete(null)
    pendingImageRequest = undefined
    imagePickerAssetId.value = null
  }
}

function openFilePicker(request: EditorAssetRequest<Partial<AssetInfo>>) {
  if (props.disabled) return
  pendingFileRequest?.complete(null)
  pendingFileRequest = request
  filePickerOpen.value = true
}

function setFilePickerOpen(open: boolean) {
  filePickerOpen.value = open
  if (!open) {
    pendingFileRequest?.complete(null)
    pendingFileRequest = undefined
  }
}

function onConversionError(payload: { message?: string }) {
  conversionStatus.value = 'failed'
  if (import.meta.dev) {
    console.debug('[ginko-cms] richtext conversion failed', {
      field: props.field.key,
      message: payload.message,
    })
  }
}

function onConversionRecovered() {
  conversionStatus.value = 'ok'
  if (import.meta.dev) {
    console.debug('[ginko-cms] richtext conversion recovered', {
      field: props.field.key,
    })
  }
}
</script>

<template>
  <StudioFieldShell
    class="ginko:col-span-2"
    :for="field.key"
    :label="label"
    :required="field.required"
    :description="field.description"
    :error="fieldError"
  >
    <template #action>
      <Button
        variant="ghost"
        size="sm"
        class="ginko:h-7 ginko:text-xs"
        @click="richtextPreview = !richtextPreview"
      >
        <Icon
          :name="richtextPreview ? 'lucide:eye-off' : 'lucide:eye'"
          class="ginko:mr-1 ginko:size-3.5"
        />
        {{
          richtextPreview
            ? t('ginkoCms.studio.fieldRenderer.hidePreview')
            : t('ginkoCms.studio.fieldRenderer.preview')
        }}
      </Button>
    </template>
    <div
      :class="
        richtextPreview ? 'ginko:grid ginko:grid-cols-1 ginko:gap-3 ginko:@5xl:grid-cols-2' : ''
      "
    >
      <RichtextEditor
        v-if="editorReady"
        :id="field.key"
        ref="editorRef"
        v-model="value"
        :asset-provider="assetProvider"
        :authoring-kit="authoringKit"
        :aria-label="label"
        :placeholder="field.description || t('ginkoCms.studio.fieldRenderer.richtextPlaceholder')"
        :enable-files="!!assetContext"
        :enable-image-metadata="!!assetContext"
        :enable-video="true"
        :disabled="props.disabled === true"
        :aria-invalid="fieldError ? true : undefined"
        @conversion-error="onConversionError"
        @conversion-recovered="onConversionRecovered"
        @pending-change="richtextFlush?.setPending(flushId, $event)"
        @request-image="assetContext ? openImagePicker($event) : $event.complete(null)"
        @request-image-metadata="assetContext ? openImageMetadata($event) : void 0"
        @request-file="assetContext ? openFilePicker($event) : $event.complete(null)"
      />
      <div
        v-else
        class="ginko:min-h-[260px] ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
      />
      <StudioAssetMetadataDialog
        v-if="assetContext && !disabled"
        :asset-id="metadataAssetId"
        :asset-context="assetContext"
        :open="metadataDialogOpen"
        @update:open="setMetadataDialogOpen"
      />
      <StudioAssetPicker
        v-if="assetContext"
        :model-value="imagePickerAssetId"
        :open="imagePickerOpen"
        :show-trigger="false"
        kind="image"
        :label="t('ginkoCms.studio.assetPicker.insertImageTitle')"
        :asset-context="assetContext"
        :disabled="disabled"
        @update:open="setImagePickerOpen"
        @select-asset="selectImageAsset"
      />
      <StudioAssetPicker
        v-if="assetContext"
        :model-value="null"
        :open="filePickerOpen"
        :show-trigger="false"
        kind="file"
        :label="t('ginkoCms.studio.assetPicker.insertFileTitle')"
        :asset-context="assetContext"
        :disabled="disabled"
        @update:open="setFilePickerOpen"
        @select-asset="selectFileAsset"
      />
      <div
        v-if="richtextPreview"
        class="ginko:min-h-[260px] ginko:rounded-md ginko:border ginko:border-border/40 ginko:p-4 prose prose-sm dark:prose-invert ginko:max-w-none ginko:overflow-auto ginko:@7xl:min-h-[400px]"
      >
        <pre
          v-if="value"
          class="ginko:whitespace-pre-wrap ginko:break-words ginko:font-sans ginko:text-sm ginko:leading-6 ginko:text-foreground"
          >{{ value }}</pre
        >
        <p v-else class="ginko:text-muted-foreground ginko:italic">
          {{ t('ginkoCms.studio.fieldRenderer.nothingToPreview') }}
        </p>
      </div>
    </div>
    <p
      v-if="conversionStatus === 'failed'"
      class="ginko:text-xs ginko:leading-5 ginko:text-destructive"
    >
      Conversion needs attention before publishing.
    </p>
  </StudioFieldShell>
</template>
