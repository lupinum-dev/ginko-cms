<script setup lang="ts">
import { Pencil, RefreshCw } from '@lucide/vue'
import type { Editor as TiptapEditor, JSONContent } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { Editor as TiptapVueEditor } from '@tiptap/vue-3'
import { onKeyStroke, useLocalStorage, useScrollLock } from '@vueuse/core'
import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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
import { useEditorMedia } from '../model/useEditorMedia'
import { useRawMode } from '../model/useRawMode'
import type { AssetProvider } from '../types'
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
    ariaLabel?: string
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
  editorProps: {
    attributes: {
      'aria-label': props.ariaLabel ?? 'Content',
    },
  },
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
const { insertFileAsset, insertImageAsset, insertVideoFromPrompt, removeSelectedMedia } =
  useEditorMedia({ assetProvider, editor: coreEditor })

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
            :aria-pressed="viewMode === 'visual'"
            :class="
              viewMode === 'visual'
                ? 'ginko:bg-background ginko:text-foreground'
                : 'ginko:text-foreground ginko:hover:bg-muted'
            "
            @click="switchToVisual"
          >
            Visual
          </button>
          <button
            type="button"
            class="ginko:h-7 ginko:rounded-md ginko:px-3 ginko:text-xs ginko:font-medium ginko:transition-colors"
            :aria-pressed="viewMode === 'raw'"
            :class="
              viewMode === 'raw'
                ? 'ginko:bg-background ginko:text-foreground'
                : 'ginko:text-foreground ginko:hover:bg-muted'
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
        class="ginko:border-b ginko:border-warning/20 ginko:bg-warning/10 ginko:dark:bg-warning/15 ginko:px-3 ginko:py-2 ginko:text-warning-fg"
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
            data-testid="cms-richtext-editor"
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
          :aria-label="`${ariaLabel ?? 'Content'} Markdown source`"
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

<style scoped src="./Editor.css"></style>
