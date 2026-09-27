<script setup lang="ts">
import { collectStoredMdcAssetReferences } from '@lupinum/ginko-content/portability'

import '@lupinum/ginko-editor/style.css'
import {
  createAuthoringKit,
  type AssetProvider,
  type AuthoringKitSourceV1,
  type AuthoringKitV1,
  type EditorAssetRequest,
  type EditorFile,
  type GinkoEditorHandle,
  type ImagePicker,
  type ImageUploadHandler,
  GinkoEditor as RichtextEditor,
} from '@lupinum/ginko-editor'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, toRaw, useId, watch } from 'vue'

import { api } from '../../../boundary/api'
import { useOptionalStudioRichtextFlush } from '../../../composables/internal/studioRichtextFlush'
import type { StudioAssetContext, StudioAssetRecord } from '../../../composables/internal/types'
import { useSharedEntryBody } from '../../../composables/internal/useSharedEntryBody'
import { useCmsI18n } from '../../../composables/useCmsI18n'
import { useCmsStudioQuery } from '../../../composables/useCmsStudioQuery'
import StudioAssetMetadataDialog from '../StudioAssetMetadataDialog.vue'
import StudioAssetPicker from '../StudioAssetPicker.vue'
import { mapStudioAssetToFileInfo } from './richtextAssetMapping'
import StudioRichtextImageLibrary from './StudioRichtextImageLibrary.vue'
import StudioRichtextPreview from './StudioRichtextPreview.vue'
import type { FieldDefinition } from './useFieldCommon'

const props = defineProps<{
  field: FieldDefinition
  fieldPath?: string
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
const shared = useSharedEntryBody(
  computed(() =>
    props.assetContext?.bodyField === props.field.key &&
    (!props.fieldPath || props.fieldPath === props.field.key)
      ? props.assetContext
      : undefined,
  ),
  computed(() => props.disabled === true),
)
const sharedPreviewSource = ref('')
watch(
  shared.mountKey,
  () => {
    sharedPreviewSource.value = typeof props.modelValue === 'string' ? props.modelValue : ''
  },
  { immediate: true },
)
const value = computed({
  get: () =>
    shared.mode.value === 'shared'
      ? sharedPreviewSource.value
      : typeof props.modelValue === 'string'
        ? props.modelValue
        : '',
  set: (v: string) => {
    if (props.disabled) return
    if (shared.mode.value === 'shared') sharedPreviewSource.value = v
    else emit('update:modelValue', v)
  },
})

const richtextPreview = ref(false)
const conversionStatus = ref<'ok' | 'failed'>('ok')
const previewError = ref('')
const previewPending = ref(false)
const imageLibrary = ref<{ pick: ImagePicker; upload: ImageUploadHandler }>()
const metadataDialogOpen = ref(false)
const metadataAssetId = ref<string | null>(null)
const filePickerOpen = ref(false)
const authoringKit = shallowRef<AuthoringKitV1>()
const editorRef = ref<GinkoEditorHandle | null>(null)
const richtextFlush = useOptionalStudioRichtextFlush()
const flushId = `${props.field.key}:${props.assetContext?.locale ?? ''}:${useId()}`
watch(
  [shared.mode, () => props.assetContext?.locale],
  ([mode, locale]) => richtextFlush?.setSharedBody(flushId, mode === 'shared' ? locale : undefined),
  { immediate: true },
)
watch(
  shared.ready,
  (ready) => {
    richtextFlush?.setPending(flushId, !ready)
  },
  { immediate: true },
)

const authoringPending = ref(Boolean(props.assetContext?.authoringSource))
let authoringRevision = 0
let pendingFileRequest: EditorAssetRequest<EditorFile> | undefined
// The picker already owns the URL. Make it available before TipTap paints a
// newly inserted stable id, rather than waiting for the source query to catch up.
const selectedAssetUrls = ref(new Map<string, string>())
const maxResolvedAssetIds = 200

const referencedAssetIds = shallowRef<string[]>([])
const referencesPending = ref(true)
let referenceRevision = 0
watch(
  [value, authoringKit],
  async ([source, kit]) => {
    const current = ++referenceRevision
    referencesPending.value = true
    try {
      const references = await collectStoredMdcAssetReferences(
        source,
        kit?.policy ?? { version: 2, components: {} },
      )
      if (current !== referenceRevision) return
      const next = [...new Set(references)].slice(0, maxResolvedAssetIds)
      // Preserve identity while typing so Convex does not resubscribe to the same ids.
      if (
        next.length !== referencedAssetIds.value.length ||
        next.some((id, index) => id !== referencedAssetIds.value[index])
      )
        referencedAssetIds.value = next
    } catch {
      // A partially typed/invalid source must remain editable. Content and Editor
      // own its diagnostic; retain the last successfully resolved references.
    } finally {
      if (current === referenceRevision) referencesPending.value = false
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  referenceRevision++
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
// latch: once the editor is live, a pending Content parse or re-resolution
// must not unmount the focused editor, which would
// drop keystrokes and steal focus.
const editorEverReady = ref(false)
const editorReady = computed(() => {
  if (editorEverReady.value) return true
  if (authoringPending.value) return false
  if (!props.assetContext) return true
  if (referencesPending.value) return false
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

const assetProvider = reactive<AssetProvider>({
  buildUrl: () => '',
  parseUrl(url) {
    if (!url) return null
    const storedId = /^[\w;:-]{1,512}$/.test(url) ? url : undefined
    return { id: storedId ?? assetIdByUrl.value.get(url), url }
  },
})
// Keep the provider identity stable so resolving an image cannot cancel another
// upload. Its reactive method change tells Editor to repaint existing media.
watch(
  [() => assetUrlsQuery.data?.value, selectedAssetUrls],
  () => {
    assetProvider.buildUrl = (asset) => {
      const explicitUrl = typeof asset.url === 'string' ? asset.url : ''
      const assetId = typeof asset.id === 'string' && asset.id.length > 0 ? asset.id : explicitUrl
      const urls = assetUrlsQuery.data?.value as Record<string, string | null> | undefined
      if (urls && Object.hasOwn(urls, assetId)) return urls[assetId] ?? ''
      return selectedAssetUrls.value.get(assetId) || explicitUrl
    }
  },
  { immediate: true },
)

const unregisterEditor = richtextFlush?.register(flushId, {
  async flush() {
    if (!shared.ready.value || !editorRef.value)
      return {
        ok: false,
        error: {
          code: 'collaboration_pending',
          phase: 'validate',
          recoverable: true,
          message: shared.error.value || 'Wait for the body editor to open before continuing.',
          traceId: 'cms-body',
          issues: [],
          timeline: [],
        },
      }
    return editorRef.value.flush()
  },
  hasPendingChanges: () => !shared.ready.value || (editorRef.value?.hasPendingChanges() ?? false),
  removeSelectedMedia: () => editorRef.value?.removeSelectedMedia() ?? false,
  focus: (position) => editorRef.value?.focus(position),
  getEditor: () => editorRef.value?.getEditor(),
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

function rememberAssetUrl(id: string, url: string) {
  selectedAssetUrls.value = new Map(selectedAssetUrls.value).set(id, url)
}
const previewUrls = computed(() => ({
  ...Object.fromEntries(selectedAssetUrls.value),
  ...(assetUrlsQuery.data?.value as Record<string, string | null> | undefined),
}))
const pickImage: ImagePicker = (context) =>
  imageLibrary.value?.pick(context) ?? Promise.resolve(null)
const uploadImage: ImageUploadHandler = (file, context) => {
  if (!imageLibrary.value) return Promise.reject(new Error('Image uploads are unavailable.'))
  return imageLibrary.value.upload(file, context)
}

function selectFileAsset(asset: StudioAssetRecord) {
  if (props.disabled) return
  if (asset.url) rememberAssetUrl(asset._id, asset.url)
  const locale =
    typeof props.assetContext?.locale === 'string' ? props.assetContext.locale : undefined
  pendingFileRequest?.complete(mapStudioAssetToFileInfo(asset, locale))
  pendingFileRequest = undefined
  filePickerOpen.value = false
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

function openFilePicker(request: EditorAssetRequest<EditorFile>) {
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

async function toggleRichtextPreview() {
  if (richtextPreview.value) {
    richtextPreview.value = false
    return
  }
  if (previewPending.value || !editorRef.value) return
  previewPending.value = true
  previewError.value = ''
  try {
    const result = await editorRef.value.flush()
    if (!result.ok) {
      previewError.value = result.error.message
      return
    }
    richtextPreview.value = true
  } finally {
    previewPending.value = false
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
        :disabled="previewPending || !editorReady"
        @click="toggleRichtextPreview"
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
        v-if="editorReady && shared.ready.value"
        :id="field.key"
        :key="shared.mountKey.value"
        ref="editorRef"
        v-model="value"
        :collaboration="shared.session.value"
        :asset-provider="assetProvider"
        :authoring-kit="authoringKit"
        :aria-label="label"
        :placeholder="field.description || t('ginkoCms.studio.fieldRenderer.richtextPlaceholder')"
        :enable-files="!!assetContext"
        :enable-images="!!assetContext"
        :enable-image-metadata="!!assetContext"
        :enable-video="false"
        :disabled="props.disabled === true"
        :aria-invalid="fieldError ? true : undefined"
        :image-upload="assetContext ? uploadImage : undefined"
        :image-picker="assetContext ? pickImage : undefined"
        @conversion-error="onConversionError"
        @conversion-recovered="onConversionRecovered"
        @pending-change="richtextFlush?.setPending(flushId, $event)"
        @request-image-metadata="assetContext ? openImageMetadata($event) : void 0"
        @request-file="assetContext ? openFilePicker($event) : $event.complete(null)"
      />
      <div
        v-else-if="shared.mode.value === 'error'"
        role="alert"
        class="ginko:rounded-lg ginko:border ginko:p-4 ginko:space-y-3"
      >
        <p>{{ shared.error.value }}</p>
        <label v-if="shared.recoveryMarkdown.value" class="ginko:block ginko:space-y-2">
          <span>Recovered Markdown for manual merge</span>
          <textarea
            readonly
            :value="shared.recoveryMarkdown.value"
            class="ginko:w-full ginko:min-h-40 ginko:rounded ginko:border ginko:p-2"
          />
        </label>
        <Button variant="outline" size="sm" @click="shared.retry()">Retry</Button>
        <Button
          v-if="shared.recoverySource.value"
          variant="outline"
          size="sm"
          @click="shared.downloadRecovery()"
        >
          Download recovery
        </Button>
        <Button
          v-if="shared.recoverySource.value"
          variant="outline"
          size="sm"
          @click="shared.keepRecoveryAndReopen()"
        >
          Download recovery and reopen
        </Button>
      </div>
      <div
        v-else
        role="status"
        aria-label="Opening editor"
        class="ginko:min-h-[260px] ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card"
      />
      <Button
        v-if="
          shared.mode.value !== 'error' &&
          shared.state.value?.pendingSteps &&
          ['stale', 'error', 'closed'].includes(shared.state.value.status)
        "
        variant="outline"
        size="sm"
        @click="shared.downloadRecovery()"
      >
        Download recovery
      </Button>
      <Button
        v-if="
          shared.mode.value !== 'error' &&
          shared.state.value &&
          ['stale', 'error', 'closed'].includes(shared.state.value.status)
        "
        variant="outline"
        size="sm"
        @click="shared.reopen()"
      >
        {{
          shared.state.value.pendingSteps ? 'Download recovery and reopen' : 'Reopen shared body'
        }}
      </Button>
      <div v-if="shared.archivedRecoveries.value.length" class="ginko:space-y-2">
        <p class="ginko:text-sm ginko:text-muted-foreground">
          Recovery copies remain in this browser tab. They are never replayed into the draft.
        </p>
        <Button
          v-for="(copy, index) in shared.archivedRecoveries.value"
          :key="copy.key"
          variant="outline"
          size="sm"
          @click="shared.downloadArchivedRecovery(copy.key)"
        >
          Download saved recovery {{ index + 1 }}
        </Button>
      </div>
      <StudioAssetMetadataDialog
        v-if="assetContext && !disabled"
        :asset-id="metadataAssetId"
        :asset-context="assetContext"
        :open="metadataDialogOpen"
        @update:open="setMetadataDialogOpen"
      />
      <StudioRichtextImageLibrary
        v-if="assetContext"
        ref="imageLibrary"
        :asset-context="assetContext"
        :disabled="disabled"
        @resolved="rememberAssetUrl"
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
        <StudioRichtextPreview
          :source="value"
          :kit="authoringKit"
          :urls="previewUrls"
          :locale="assetContext?.locale"
        />
      </div>
    </div>
    <p v-if="previewError" role="alert" class="ginko:text-xs ginko:text-destructive">
      {{ previewError }}
    </p>
    <p
      v-if="conversionStatus === 'failed'"
      class="ginko:text-xs ginko:leading-5 ginko:text-destructive"
    >
      Conversion needs attention before publishing.
    </p>
  </StudioFieldShell>
</template>
