<script setup lang="ts">
import type { Editor as TiptapEditor, JSONContent } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { Editor as TiptapVueEditor } from '@tiptap/vue-3'
import { onKeyStroke, useLocalStorage, useScrollLock } from '@vueuse/core'
import { Pencil, RefreshCw } from 'lucide-vue-next'
import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { studioPrompt } from '../../composables/internal/useStudioPrompt'
import {
  createEditorExtensions,
  isCurrentlyNormalizingTable,
  normalizeTableCells,
} from '../lib/config/editorConfig'
import type { ConversionErrorPayload, ConversionRecoveredPayload } from '../lib/conversionPipeline'
import {
  clearEditorDebugEvents,
  getEditorDebugEvents,
  editorDebug,
  pushEditorDebugEvent,
  serializeDebugPayload,
  setDebugEnabled,
} from '../lib/debug'
import { defaultAssetProvider } from '../model/default-asset-provider'
import { useContentSync } from '../model/useContentSync'
import { useDebugExport } from '../model/useDebugExport'
import { useRawMode } from '../model/useRawMode'
import type { AssetInfo, AssetProvider } from '../types'
import DebugPanel from './DebugPanel.vue'
import RichTextToolbar from './Toolbar.vue'

defineOptions({
  name: 'GinkoEditor',
})

const props = withDefaults(
  defineProps<{
    codeBlockTheme?:
      | 'atom-dark'
      | 'dark'
      | 'default'
      | 'github-dark'
      | 'github-dim'
      | 'github-light'
      | 'visual-studio-dark'
    assetProvider?: AssetProvider
    disabled?: boolean
    enableDebug?: boolean
    enableFiles?: boolean
    enableVideo?: boolean
    fileOutput?: 'markdown' | 'mdc'
    imageOutput?: 'markdown' | 'mdc'
    modelValue: string
    placeholder?: string
    showMarkdownMarkers?: boolean
    videoOutput?: 'html' | 'mdc'
  }>(),
  {
    codeBlockTheme: 'github-dark',
    disabled: false,
    enableDebug: false,
    enableFiles: true,
    enableVideo: true,
    fileOutput: 'mdc',
    imageOutput: 'mdc',
    showMarkdownMarkers: false,
    videoOutput: 'mdc',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'conversion-error': [payload: ConversionErrorPayload]
  'conversion-recovered': [payload: ConversionRecoveredPayload]
  'request-file': []
  'request-image': []
  'request-image-metadata': [assetId: string]
}>()

const settings = computed(() => ({
  codeBlockTheme: props.codeBlockTheme,
  enableDebug: props.enableDebug,
  enableFiles: props.enableFiles,
  enableVideo: props.enableVideo,
  fileOutput: props.fileOutput,
  imageOutput: props.imageOutput,
  showMarkdownMarkers: props.showMarkdownMarkers,
  videoOutput: props.videoOutput,
}))
const assetProvider = computed(() => props.assetProvider ?? defaultAssetProvider)
const debugEvents = getEditorDebugEvents()
const showDebug = computed(() => settings.value.enableDebug)

watch(
  () => settings.value.enableDebug,
  (enabled) => {
    setDebugEnabled(enabled)
  },
  { immediate: true },
)

const modelValueRef = computed(() => props.modelValue)
const isUpdating = ref(false)
const lastEmittedValue = ref('')
const lastStableValue = ref('')
const lastTiptapJson = ref<JSONContent | null>(null)
const conversionBanner = ref<ConversionErrorPayload | null>(null)
const lastRecoveryEvent = ref<ConversionRecoveredPayload | null>(null)
const editorSurfaceShell = ref<HTMLElement | null>(null)
const selectedImageOverlay = ref<{
  assetId: string
  filename: string
  left: number
  top: number
  visible: boolean
}>({
  assetId: '',
  filename: '',
  left: 0,
  top: 0,
  visible: false,
})

const isFocusMode = ref(false)
const isTypewriterMode = useLocalStorage('ginko.editor.typewriterMode', false)
const bodyScrollLocked = useScrollLock(typeof document !== 'undefined' ? document.body : null)
function toggleFocusMode() {
  if (props.disabled) return
  isFocusMode.value = !isFocusMode.value
  bodyScrollLocked.value = isFocusMode.value
  if (isFocusMode.value && isTypewriterMode.value) {
    void nextTick(() => scrollCaretIntoMiddle())
  }
}
function toggleTypewriterMode() {
  isTypewriterMode.value = !isTypewriterMode.value
  if (isFocusMode.value && isTypewriterMode.value) {
    void nextTick(() => scrollCaretIntoMiddle())
  }
}
function scrollCaretIntoMiddle() {
  if (!isFocusMode.value || !isTypewriterMode.value) return
  const editorInstance = editor.value
  if (!editorInstance) return
  const view = editorInstance.view
  if (!view) return
  const container = editorSurfaceShell.value?.closest(
    '.ginko-richtext-editor__content',
  ) as HTMLElement | null
  if (!container) return
  try {
    const head = view.state.selection.head
    const coords = view.coordsAtPos(head)
    const containerRect = container.getBoundingClientRect()
    const containerCenterY = containerRect.top + containerRect.height / 2
    const caretCenterY = (coords.top + coords.bottom) / 2
    const delta = caretCenterY - containerCenterY
    if (Math.abs(delta) < 1) return
    container.scrollTop += delta
  } catch {
    // coordsAtPos can throw on certain transient selections; safe to ignore
  }
}
onKeyStroke('Escape', (event) => {
  if (!isFocusMode.value) return
  event.preventDefault()
  isFocusMode.value = false
  bodyScrollLocked.value = false
})

function handleConversionError(payload: ConversionErrorPayload) {
  conversionBanner.value = payload
  emit('conversion-error', payload)
}

function handleConversionRecovered(payload: ConversionRecoveredPayload) {
  conversionBanner.value = null
  lastRecoveryEvent.value = payload
  emit('conversion-recovered', payload)
}

const handleEditorUpdate = async (editor: TiptapEditor, docChanged: boolean) => {
  await contentSyncResult.handleEditorUpdate(editor, docChanged)
}

const editor = useEditor({
  content: { content: [{ type: 'paragraph' }], type: 'doc' },
  editable: !props.disabled,
  extensions: createEditorExtensions({
    assetProvider: assetProvider.value,
    codeBlockTheme: settings.value.codeBlockTheme,
    enableDebug: settings.value.enableDebug,
    enableFiles: settings.value.enableFiles,
    enableVideo: settings.value.enableVideo,
    fileOutput: settings.value.fileOutput,
    imageOutput: settings.value.imageOutput,
    placeholder: props.placeholder,
    showMarkdownMarkers: settings.value.showMarkdownMarkers,
    videoOutput: settings.value.videoOutput,
  }),
  onUpdate: async ({ editor, transaction }) => {
    if (!isCurrentlyNormalizingTable() && normalizeTableCells(editor)) {
      return
    }
    await handleEditorUpdate(editor, transaction.docChanged)
  },
  onCreate: ({ editor }) => {
    editorDebug.log('Editor created', {
      editable: editor.isEditable,
      extensions: editor.extensionManager.extensions.map((extension) => extension.name),
    })
  },
  onFocus: ({ event, editor }) => {
    pushEditorDebugEvent({
      level: 'log',
      message: 'Editor focus',
      payload: {
        doc: summarizeDoc(editor.getJSON()),
        selection: serializeSelection(editor),
        type: event.type,
      },
      source: 'editor.focus',
    })
  },
  onBlur: ({ event, editor }) => {
    void contentSyncResult.flushPendingEditorUpdate()
    pushEditorDebugEvent({
      level: 'log',
      message: 'Editor blur',
      payload: {
        doc: summarizeDoc(editor.getJSON()),
        selection: serializeSelection(editor),
        type: event.type,
      },
      source: 'editor.blur',
    })
  },
  onSelectionUpdate: ({ editor }) => {
    void updateSelectedImageOverlay(editor)
    scrollCaretIntoMiddle()
    pushEditorDebugEvent({
      level: 'log',
      message: 'Selection updated',
      payload: serializeSelection(editor),
      source: 'editor.selection',
    })
  },
  onTransaction: ({ editor, transaction }) => {
    if (transaction.docChanged || transaction.selectionSet) {
      void updateSelectedImageOverlay(editor)
    }
    if (transaction.docChanged) {
      scrollCaretIntoMiddle()
    }
    pushEditorDebugEvent({
      level: transaction.docChanged ? 'warn' : 'log',
      message: transaction.docChanged ? 'Document transaction' : 'Selection/meta transaction',
      payload: {
        doc: summarizeDoc(editor.getJSON()),
        metaKeys: getTransactionMetaKeys(transaction),
        selection: serializeSelection(editor),
        selectionSet: transaction.selectionSet,
        stepCount: transaction.steps.length,
        steps: transaction.steps.map((step) => serializeDebugPayload(step.toJSON())),
      },
      source: 'editor.transaction',
    })
  },
}) as unknown as Ref<TiptapVueEditor | undefined>

const coreEditor = editor as unknown as Ref<TiptapEditor | undefined>

const {
  conversionHealth: rawConversionHealth,
  lastConversionError: rawLastConversionError,
  lastConversionRecovery: rawLastConversionRecovery,
  onRawChange,
  rawContent,
  switchToVisual,
  syncRawContent,
  viewMode,
} = useRawMode({
  editor: coreEditor,
  emit: (value: string) => emit('update:modelValue', value),
  isUpdating,
  lastEmittedValue,
  lastStableValue,
  lastTiptapJson,
  modelValue: modelValueRef,
  onConversionError: handleConversionError,
  onConversionRecovered: handleConversionRecovered,
})

const contentSyncResult = useContentSync({
  disabled: computed(() => props.disabled ?? false),
  editor: coreEditor,
  emit: (value: string) => emit('update:modelValue', value),
  isUpdating,
  lastEmittedValue,
  lastStableValue,
  lastTiptapJson,
  modelValue: modelValueRef,
  onConversionError: handleConversionError,
  onConversionRecovered: handleConversionRecovered,
  outputOptions: settings,
  syncRawContent,
})

const {
  cleanup,
  conversionHealth: contentConversionHealth,
  flushPendingEditorUpdate,
  initializeContent,
  lastConversionError: contentLastConversionError,
  lastConversionRecovery: contentLastConversionRecovery,
} = contentSyncResult

const conversionDiagnostics = computed(() => {
  const failedHealth = [contentConversionHealth.value, rawConversionHealth.value].find(
    (state) => state.status === 'failed',
  )
  const degradedHealth = [contentConversionHealth.value, rawConversionHealth.value].find(
    (state) => state.status === 'degraded',
  )
  const health = failedHealth ?? degradedHealth ?? contentConversionHealth.value

  const lastError =
    conversionBanner.value ??
    rawLastConversionError.value ??
    contentLastConversionError.value ??
    null
  const lastRecovery =
    lastRecoveryEvent.value ??
    rawLastConversionRecovery.value ??
    contentLastConversionRecovery.value ??
    null

  return { health, lastError, lastRecovery }
})
const wordCount = computed(() => {
  const text = props.modelValue.replace(/[`#*_>()[\]{}|:-]+/g, ' ').trim()
  return text ? text.split(/\s+/).length : 0
})
const conversionStatusLabel = computed(() => {
  const status = conversionDiagnostics.value.health.status
  if (status === 'failed') return 'Needs attention'
  if (status === 'degraded') return 'Recovered'
  return 'Synced'
})

const { exportDebugData } = useDebugExport({
  editor: coreEditor,
  isUpdating,
  lastEmittedValue,
  lastStableValue,
  lastTiptapJson,
  modelValue: modelValueRef,
  rawContent,
  viewMode,
  conversionDiagnostics,
})

watch(
  () => props.disabled,
  (disabled) => {
    editor.value?.setEditable(!disabled)
  },
)

onMounted(() => {
  clearEditorDebugEvents()
  pushEditorDebugEvent({
    level: 'log',
    message: 'Editor mounted',
    payload: {
      enableDebug: settings.value.enableDebug,
      enableFiles: settings.value.enableFiles,
      enableVideo: settings.value.enableVideo,
      modelLength: props.modelValue.length,
    },
    source: 'editor.lifecycle',
  })
  initializeContent()
  window.addEventListener('resize', refreshSelectedImageOverlay)
  window.addEventListener('scroll', refreshSelectedImageOverlay, true)
})

onBeforeUnmount(() => {
  bodyScrollLocked.value = false
  window.removeEventListener('resize', refreshSelectedImageOverlay)
  window.removeEventListener('scroll', refreshSelectedImageOverlay, true)
  void flushPendingEditorUpdate()
  pushEditorDebugEvent({
    level: 'log',
    message: 'Editor unmounting',
    payload: {
      eventCount: debugEvents.value.length,
    },
    source: 'editor.lifecycle',
  })
  cleanup()
  editor.value?.destroy()
})

function insertImageAsset(asset: Partial<AssetInfo>) {
  const instance = editor.value
  if (!instance) {
    return
  }

  const src = asset.url || assetProvider.value.buildUrl(asset)
  const payload = {
    alt: asset.alt,
    filename: asset.filename,
    height: asset.height,
    id: asset.id,
    src,
    title: asset.title,
    width: asset.width,
  }
  pushEditorDebugEvent({
    level: 'log',
    message: instance.isActive('image') ? 'Replacing selected image' : 'Inserting image',
    payload,
    source: 'editor.media.image',
  })
  if (instance.isActive('image')) {
    instance.chain().focus().updateAttributes('image', { props: payload }).run()
    return
  }

  const chain = instance.chain().focus() as unknown as {
    setImage: (options: Record<string, unknown>) => { run: () => void }
  }
  chain.setImage(payload).run()
}

async function updateSelectedImageOverlay(instance: TiptapEditor | undefined = editor.value) {
  if (!instance || viewMode.value !== 'visual') {
    selectedImageOverlay.value = { ...selectedImageOverlay.value, visible: false }
    return
  }

  await nextTick()

  const selection = instance.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') {
    selectedImageOverlay.value = { ...selectedImageOverlay.value, visible: false }
    return
  }

  const dom = instance.view.nodeDOM(selection.from)
  const imageElement =
    dom instanceof HTMLImageElement
      ? dom
      : dom instanceof HTMLElement
        ? dom.querySelector('img')
        : null
  const shell = editorSurfaceShell.value
  if (!imageElement || !shell) {
    selectedImageOverlay.value = { ...selectedImageOverlay.value, visible: false }
    return
  }

  const imageRect = imageElement.getBoundingClientRect()
  const shellRect = shell.getBoundingClientRect()
  const props = selection.node.attrs.props || {}
  selectedImageOverlay.value = {
    assetId: typeof props.id === 'string' ? props.id : '',
    filename: typeof props.filename === 'string' ? props.filename : '',
    left: Math.max(8, imageRect.right - shellRect.left - 92),
    top: Math.max(8, imageRect.top - shellRect.top + 8),
    visible: true,
  }
}

function refreshSelectedImageOverlay() {
  void updateSelectedImageOverlay()
}

function requestSelectedImageReplacement() {
  emit('request-image')
}

function requestSelectedImageMetadata() {
  if (!selectedImageOverlay.value.assetId) return
  emit('request-image-metadata', selectedImageOverlay.value.assetId)
}

function insertFileAsset(asset: Partial<AssetInfo>) {
  const instance = editor.value
  if (!instance) {
    return
  }

  const src = asset.url || assetProvider.value.buildUrl(asset)
  const payload = {
    filename: asset.filename,
    id: asset.id,
    size: asset.size,
    src,
    title: asset.title || asset.filename,
    type: asset.mimeType,
  }
  pushEditorDebugEvent({
    level: 'log',
    message: instance.isActive('file') ? 'Replacing selected file' : 'Inserting file',
    payload,
    source: 'editor.media.file',
  })
  if (instance.isActive('file')) {
    instance.chain().focus().updateAttributes('file', { props: payload }).run()
    return
  }

  const chain = instance.chain().focus() as unknown as {
    setFile: (options: Record<string, unknown>) => { run: () => void }
  }
  chain.setFile(payload).run()
}

async function insertVideoFromPrompt() {
  const src = (
    await studioPrompt({
      title: 'Insert video',
      label: 'Video URL',
      placeholder: 'https://example.com/video.mp4',
      confirmLabel: 'Continue',
    })
  )?.trim()
  if (!src || !editor.value) {
    return
  }

  const title =
    (
      await studioPrompt({
        title: 'Video title',
        label: 'Title',
        description: 'Optional.',
        confirmLabel: 'Insert video',
      })
    )?.trim() || undefined
  const payload = { src, title }
  pushEditorDebugEvent({
    level: 'log',
    message: editor.value.isActive('video') ? 'Updating selected video' : 'Inserting video',
    payload,
    source: 'editor.media.video',
  })
  if (editor.value.isActive('video')) {
    editor.value
      .chain()
      .focus()
      .updateAttributes('video', {
        props: payload,
        src,
        title,
      })
      .run()
    return
  }

  const chain = editor.value.chain().focus() as unknown as {
    setVideo: (attrs: Record<string, unknown>) => { run: () => void }
  }
  chain.setVideo(payload).run()
}

function removeSelectedMedia() {
  const instance = editor.value
  if (!instance) {
    return
  }

  if (!instance.isActive('image') && !instance.isActive('file') && !instance.isActive('video')) {
    return
  }

  pushEditorDebugEvent({
    level: 'warn',
    message: 'Removing selected media node',
    payload: {
      selection: serializeSelection(instance),
    },
    source: 'editor.media.remove',
  })
  const tr = instance.state.tr.deleteSelection()
  instance.view.dispatch(tr)
}

function serializeSelection(editor: {
  state: { selection: { empty: boolean; from: number; to: number } }
}) {
  return {
    empty: editor.state.selection.empty,
    from: editor.state.selection.from,
    to: editor.state.selection.to,
  }
}

function summarizeDoc(doc: JSONContent | null | undefined) {
  if (!doc) {
    return {
      nodeCount: 0,
      textLength: 0,
      type: 'unknown',
    }
  }

  return {
    nodeCount: countNodes(doc),
    textLength: countTextLength(doc),
    type: doc.type ?? 'unknown',
  }
}

function countNodes(node: JSONContent): number {
  return 1 + (node.content?.reduce((count, child) => count + countNodes(child), 0) ?? 0)
}

function countTextLength(node: JSONContent): number {
  return (
    (node.text?.length ?? 0) +
    (node.content?.reduce((count, child) => count + countTextLength(child), 0) ?? 0)
  )
}

function getTransactionMetaKeys(transaction: object) {
  const meta = Reflect.get(transaction, 'meta')
  return meta && typeof meta === 'object' ? Object.keys(meta as Record<string, unknown>) : []
}

defineExpose({
  conversionDiagnostics,
  editor,
  insertFileAsset,
  insertImageAsset,
  insertVideoFromPrompt,
  removeSelectedMedia,
  exportDebugData,
  lastTiptapJson,
  rawContent,
  viewMode,
})
</script>

<template>
  <div
    class="ginko-richtext-editor"
    :data-focus-mode="isFocusMode ? 'true' : undefined"
    :data-typewriter="isTypewriterMode ? 'true' : undefined"
  >
    <div
      :class="[
        'ginko-richtext-editor__frame ginko:overflow-hidden',
        isFocusMode
          ? 'ginko:fixed ginko:inset-0 ginko:z-50 ginko:bg-background ginko:border-0 ginko:rounded-none'
          : 'ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card',
        { 'ginko:opacity-60 ginko:pointer-events-none': disabled },
      ]"
    >
      <div
        v-show="!isFocusMode"
        class="ginko:flex ginko:items-center ginko:gap-2 ginko:border-b ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-1.5"
      >
        <div
          class="ginko:inline-flex ginko:rounded-lg ginko:border ginko:border-border/40 ginko:bg-muted/50 ginko:p-0.5"
        >
          <button
            type="button"
            class="ginko:h-7 ginko:rounded-md ginko:px-3 ginko:text-xs ginko:font-medium ginko:transition-colors"
            :class="
              viewMode === 'visual'
                ? 'ginko:bg-background ginko:text-foreground'
                : 'ginko:text-muted-foreground ginko:hover:text-foreground ginko:hover:bg-muted'
            "
            @click="switchToVisual"
          >
            Visual
          </button>
          <button
            type="button"
            class="ginko:h-7 ginko:rounded-md ginko:px-3 ginko:text-xs ginko:font-medium ginko:transition-colors"
            :class="
              viewMode === 'raw'
                ? 'ginko:bg-background ginko:text-foreground'
                : 'ginko:text-muted-foreground ginko:hover:text-foreground ginko:hover:bg-muted'
            "
            @click="viewMode = 'raw'"
          >
            Markdown
          </button>
        </div>
        <div
          class="ginko:ml-auto ginko:text-xs"
          :class="
            conversionDiagnostics.health.status === 'failed'
              ? 'ginko:text-destructive'
              : 'ginko:text-muted-foreground'
          "
        >
          {{ conversionStatusLabel }}
        </div>
        <Button
          v-if="showDebug"
          size="sm"
          variant="outline"
          class="ginko:h-8"
          @click="exportDebugData"
        >
          Export diagnostics
        </Button>
      </div>

      <div
        v-if="conversionBanner && !isFocusMode"
        class="ginko:border-b ginko:border-warning/20 ginko:bg-warning/10 ginko:px-3 ginko:py-2 ginko:text-warning-fg"
      >
        <p class="ginko:text-sm ginko:font-medium">Conversion guard active</p>
        <p class="ginko:text-xs ginko:leading-5">
          {{ conversionBanner.message }}
        </p>
        <p class="ginko:mt-1 ginko:text-xs ginko:opacity-80">
          Trace: <code>{{ conversionBanner.traceId }}</code>
        </p>
      </div>

      <div
        v-show="viewMode === 'visual'"
        :class="[
          'ginko-richtext-editor__content',
          isFocusMode && 'ginko:flex ginko:h-full ginko:flex-col ginko:overflow-y-auto',
        ]"
      >
        <RichTextToolbar
          :editor="editor ?? null"
          :enable-files="enableFiles"
          :enable-video="enableVideo"
          :is-focus-mode="isFocusMode"
          :is-typewriter-mode="isTypewriterMode"
          @open-file="emit('request-file')"
          @open-image="emit('request-image')"
          @open-video="insertVideoFromPrompt"
          @remove-media="removeSelectedMedia"
          @toggle-focus="toggleFocusMode"
          @toggle-typewriter="toggleTypewriterMode"
        />
        <div
          ref="editorSurfaceShell"
          :class="[
            'ginko:relative',
            isFocusMode && 'ginko:mx-auto ginko:w-full ginko:max-w-prose ginko:px-6',
            isFocusMode &&
              (isTypewriterMode ? 'ginko:pt-[50vh] ginko:pb-[50vh]' : 'ginko:py-16 ginko:md:py-24'),
          ]"
        >
          <EditorContent
            :editor="editor"
            :class="[
              'ginko-richtext-editor__surface',
              isFocusMode ? 'ginko:min-h-[60vh]' : 'ginko:min-h-[260px] ginko:px-4 ginko:py-3',
            ]"
          />
          <div
            v-if="selectedImageOverlay.visible"
            class="ginko-richtext-editor__asset-overlay"
            :style="{
              left: `${selectedImageOverlay.left}px`,
              top: `${selectedImageOverlay.top}px`,
            }"
            @mousedown.prevent.stop
          >
            <button
              type="button"
              class="ginko-richtext-editor__asset-overlay-button"
              title="Replace asset"
              aria-label="Replace asset"
              @click.stop="requestSelectedImageReplacement"
            >
              <RefreshCw class="ginko:size-3.5" />
            </button>
            <button
              type="button"
              class="ginko-richtext-editor__asset-overlay-button"
              :disabled="!selectedImageOverlay.assetId"
              title="Edit image details"
              aria-label="Edit image details"
              @click.stop="requestSelectedImageMetadata"
            >
              <Pencil class="ginko:size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div
        v-show="viewMode === 'raw'"
        :class="
          isFocusMode
            ? 'ginko:mx-auto ginko:w-full ginko:max-w-prose ginko:px-6 ginko:py-16'
            : 'ginko:border-t ginko:border-border/70'
        "
      >
        <Textarea
          :model-value="rawContent"
          :disabled="disabled"
          class="ginko:min-h-[260px] ginko:resize-y ginko:rounded-none ginko:border-0 ginko:font-mono ginko:text-sm ginko:shadow-none ginko:focus-visible:ring-0"
          @update:model-value="onRawChange"
        />
      </div>

      <div
        v-if="!isFocusMode"
        class="ginko:flex ginko:items-center ginko:justify-between ginko:border-t ginko:border-border/40 ginko:bg-muted/30 ginko:px-3 ginko:py-2 ginko:text-xs ginko:text-muted-foreground"
      >
        <span>{{ wordCount }} word{{ wordCount === 1 ? '' : 's' }}</span>
        <span>{{ viewMode === 'visual' ? 'Visual editor' : 'Markdown source' }}</span>
      </div>

      <DebugPanel
        v-if="showDebug && !isFocusMode"
        :events="debugEvents"
        @clear="clearEditorDebugEvents"
        @export="exportDebugData"
      />
    </div>
  </div>
</template>

<style scoped>
.ginko-richtext-editor__content {
  background: var(--card);
}

.ginko-richtext-editor__frame {
  box-shadow: none;
}

.ginko-richtext-editor[data-focus-mode='true'] .ginko-richtext-editor__content {
  background: var(--background);
}

.ginko-richtext-editor[data-focus-mode='true'] .ginko-richtext-editor__frame {
  box-shadow: none;
}

.ginko-richtext-editor__surface :deep(.ProseMirror) {
  min-height: 220px;
  color: var(--foreground);
  outline: none;
  font-size: 0.95rem;
  line-height: 1.7;
}

.ginko-richtext-editor__surface :deep(.ProseMirror > *) {
  margin-top: 0;
}

.ginko-richtext-editor__surface :deep(.ProseMirror > *:first-child) {
  margin-top: 0;
}

.ginko-richtext-editor__surface :deep(.ProseMirror > *:last-child) {
  margin-bottom: 0;
}

.ginko-richtext-editor__surface :deep(.ProseMirror p) {
  margin: 0 0 1rem;
  line-height: 1.7;
}

.ginko-richtext-editor__surface :deep(.ProseMirror p.is-empty) {
  min-height: 1.75rem;
}

.ginko-richtext-editor__surface :deep(.ProseMirror h1),
.ginko-richtext-editor__surface :deep(.ProseMirror h2),
.ginko-richtext-editor__surface :deep(.ProseMirror h3),
.ginko-richtext-editor__surface :deep(.ProseMirror h4),
.ginko-richtext-editor__surface :deep(.ProseMirror h5),
.ginko-richtext-editor__surface :deep(.ProseMirror h6) {
  margin: 1.5rem 0 0.75rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0;
}

.ginko-richtext-editor__surface :deep(.ProseMirror h1) {
  font-size: 2rem;
}

.ginko-richtext-editor__surface :deep(.ProseMirror h2) {
  font-size: 1.625rem;
}

.ginko-richtext-editor__surface :deep(.ProseMirror h3) {
  font-size: 1.35rem;
}

.ginko-richtext-editor__surface :deep(.ProseMirror h4) {
  font-size: 1.125rem;
}

.ginko-richtext-editor__surface :deep(.ProseMirror h5),
.ginko-richtext-editor__surface :deep(.ProseMirror h6) {
  font-size: 1rem;
}

.ginko-richtext-editor__surface :deep(.ProseMirror ul),
.ginko-richtext-editor__surface :deep(.ProseMirror ol) {
  margin: 1rem 0 1rem 0.25rem;
  padding-left: 1.5rem;
}

.ginko-richtext-editor__surface :deep(.ProseMirror li) {
  margin: 0.25rem 0;
}

.ginko-richtext-editor__surface :deep(.ProseMirror a) {
  color: var(--primary);
  text-decoration: underline;
  text-decoration-color: color-mix(in oklch, var(--primary) 38%, transparent);
  text-underline-offset: 0.18em;
}

.ginko-richtext-editor__surface :deep(.ProseMirror a:hover) {
  color: var(--primary);
  text-decoration-color: color-mix(in oklch, var(--primary) 70%, transparent);
}

.ginko-richtext-editor__surface :deep(.ProseMirror code) {
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  background: var(--muted);
  color: var(--foreground);
  padding: 0.12rem 0.38rem;
  font-size: 0.88em;
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    Liberation Mono,
    monospace;
}

.ginko-richtext-editor__surface :deep(.ProseMirror pre) {
  margin: 1.25rem 0;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--muted);
  color: var(--foreground);
  padding: 1rem 1.1rem;
  box-shadow: none;
}

.ginko-richtext-editor__surface :deep(.ProseMirror pre code) {
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: 0.92rem;
  line-height: 1.75;
}

.ginko-richtext-editor__surface :deep(.ProseMirror blockquote) {
  border-left: 1px solid var(--border);
  margin: 1.25rem 0;
  padding: 0.15rem 0 0.15rem 1rem;
  color: var(--muted-foreground);
  font-style: normal;
  background: transparent;
}

.ginko-richtext-editor__surface :deep(.ProseMirror hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 1.5rem 0;
}

.ginko-richtext-editor__surface :deep(.ProseMirror table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1.25rem 0;
  overflow: hidden;
  border-radius: 0.8rem;
  border-style: hidden;
  box-shadow: 0 0 0 1px var(--border);
  background: var(--card);
}

.ginko-richtext-editor__surface :deep(.ProseMirror th),
.ginko-richtext-editor__surface :deep(.ProseMirror td) {
  border: 1px solid var(--border);
  padding: 0.7rem 0.8rem;
  vertical-align: top;
}

.ginko-richtext-editor__surface :deep(.ProseMirror th) {
  background: var(--muted);
  font-weight: 600;
  text-align: left;
}

.ginko-richtext-editor__surface :deep(.ProseMirror img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.25rem 0;
  border-radius: 0.625rem;
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--border) 84%, transparent);
}

.ginko-richtext-editor__surface :deep(.ProseMirror a[data-type='file']) {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: fit-content;
  max-width: 100%;
  margin: 1rem 0;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--card);
  box-shadow: none;
  color: var(--foreground);
  text-decoration: none;
}

.ginko-richtext-editor__surface :deep(.ProseMirror a[data-type='file']::before) {
  content: 'FILE';
  flex: none;
  border-radius: 999px;
  background: var(--foreground);
  color: var(--background);
  padding: 0.2rem 0.48rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0;
}

.ginko-richtext-editor__surface :deep(.ProseMirror div[data-type='video']) {
  margin: 1.25rem 0;
  border: 1px dashed var(--border);
  border-radius: 0.75rem;
  background: var(--muted);
  min-height: 13rem;
  position: relative;
  overflow: hidden;
}

.ginko-richtext-editor__surface :deep(.ProseMirror div[data-type='video']::before) {
  content: attr(title);
  position: absolute;
  left: 1rem;
  right: 1rem;
  bottom: 1rem;
  color: var(--muted-foreground);
  font-size: 0.9rem;
}

.ginko-richtext-editor__surface :deep(.ProseMirror div[data-type='video']::after) {
  content: 'Video';
  position: absolute;
  top: 1rem;
  left: 1rem;
  border-radius: 999px;
  background: var(--card);
  color: var(--muted-foreground);
  padding: 0.2rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ginko-richtext-editor__surface :deep(.ProseMirror .ProseMirror-selectednode) {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.ginko-richtext-editor__asset-overlay {
  position: absolute;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--popover);
  padding: 0.25rem;
  box-shadow: none;
}

.ginko-richtext-editor__asset-overlay-button {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.35rem;
  color: var(--popover-foreground);
  transition:
    background-color 120ms ease,
    color 120ms ease,
    opacity 120ms ease;
}

.ginko-richtext-editor__asset-overlay-button:hover:not(:disabled),
.ginko-richtext-editor__asset-overlay-button:focus-visible {
  background: var(--muted);
}

.ginko-richtext-editor__asset-overlay-button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.ginko-richtext-editor__surface :deep(.mdc-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--muted-foreground);
  float: left;
  height: 0;
  pointer-events: none;
}

@media (max-width: 640px) {
  .ginko-richtext-editor__surface {
    padding-left: 1rem !important;
    padding-right: 1rem !important;
  }

  .ginko-richtext-editor__surface :deep(.ProseMirror) {
    font-size: 0.95rem;
  }

  .ginko-richtext-editor__surface :deep(.ProseMirror h1) {
    font-size: 1.6rem;
  }

  .ginko-richtext-editor__surface :deep(.ProseMirror h2) {
    font-size: 1.35rem;
  }
}
</style>
