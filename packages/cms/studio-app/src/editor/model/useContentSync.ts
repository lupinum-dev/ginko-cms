/**
 * Content Synchronization
 *
 * Bidirectional sync between MDC markdown and Tiptap JSON.
 * Handles external updates, editor changes, and transformation pipeline.
 *
 * @domain editor
 * @scope Editor/Tiptap content sync
 * @state Local (new state per call)
 * @mutations syncFromExternal, syncToParent, handleEditorUpdate
 */

import type { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/vue-3'
import type { ComputedRef, Ref } from 'vue'
import { ref, shallowRef, watch } from 'vue'

import type {
  ConversionErrorPayload,
  ConversionHealthState,
  ConversionPhase,
  ConversionRecoveredPayload,
  ConversionResult,
} from '../lib/conversionPipeline'
import { applyMarkdownToEditor, convertTiptapDocToMarkdown } from '../lib/conversionPipeline'
import {
  getHealthStatusFromIssues,
  maybeBuildRecoveryPayload,
  selectPrimaryIssue,
  toConversionErrorPayload,
} from '../lib/conversionState'
import { editorDebug } from '../lib/debug'

export interface UseContentSyncOptions {
  disabled: ComputedRef<boolean>
  editor: Ref<Editor | undefined>
  emit: (value: string) => void
  isUpdating?: Ref<boolean>
  lastEmittedValue?: Ref<string>
  lastStableValue?: Ref<string>
  lastTiptapJson?: Ref<JSONContent | null>
  modelValue: ComputedRef<string>
  syncDebounceMs?: number
  outputOptions: ComputedRef<{
    enableDebug: boolean
    fileOutput: 'markdown' | 'mdc'
    imageOutput: 'markdown' | 'mdc'
    videoOutput: 'html' | 'mdc'
  }>
  syncRawContent: (value: string) => void
  onConversionError?: (payload: ConversionErrorPayload) => void
  onConversionRecovered?: (payload: ConversionRecoveredPayload) => void
}

export function useContentSync(options: UseContentSyncOptions) {
  const { disabled, editor, emit, modelValue, outputOptions, syncRawContent } = options

  const isUpdating = options.isUpdating ?? ref(false)
  const lastTiptapJson = options.lastTiptapJson ?? ref<JSONContent | null>(null)
  const lastEmittedValue = options.lastEmittedValue ?? ref<string>('')
  const lastStableValue = options.lastStableValue ?? ref<string>('')
  const syncDebounceMs = options.syncDebounceMs ?? 120
  const restorePending = ref(false)
  const pendingSync = ref(false)
  const pendingSyncEditor = shallowRef<Editor | null>(null)
  const disableTimeout = ref<null | number>(null)
  const disableApplied = ref(false)
  let syncTimeout: ReturnType<typeof setTimeout> | null = null
  const conversionHealth = ref<ConversionHealthState>({
    lastGoodDoc: null,
    lastGoodMarkdown: '',
    status: 'ok',
  })
  const lastConversionError = ref<ConversionErrorPayload | null>(null)
  const lastConversionRecovery = ref<ConversionRecoveredPayload | null>(null)

  function updateHealthFromSuccess(
    traceId: string,
    markdown: string,
    doc: JSONContent,
    issues: ConversionResult<unknown>['issues'],
  ) {
    const previousStatus = conversionHealth.value.status
    const nextStatus = getHealthStatusFromIssues(issues)

    lastConversionError.value = null
    conversionHealth.value = {
      ...conversionHealth.value,
      lastError: undefined,
      lastGoodDoc: doc,
      lastGoodMarkdown: markdown,
      status: nextStatus,
    }

    const payload = maybeBuildRecoveryPayload(previousStatus, nextStatus, traceId)
    if (payload) {
      lastConversionRecovery.value = payload
      options.onConversionRecovered?.(payload)
    }
  }

  function handleConversionFailure(
    result: ConversionResult<unknown>,
    fallbackPhase: ConversionPhase,
    fallbackMessage: string,
    recoverable = true,
  ) {
    const payload = toConversionErrorPayload(result, {
      fallbackMessage,
      fallbackPhase,
      recoverable,
    })
    const primaryIssue = selectPrimaryIssue(payload.issues)
    lastConversionError.value = payload
    conversionHealth.value = {
      ...conversionHealth.value,
      lastError: primaryIssue,
      status: 'failed',
    }
    options.onConversionError?.(payload)
  }

  async function convertEditorToMarkdown(
    editorInstance: Editor,
  ): Promise<ConversionResult<string>> {
    const json = editorInstance.getJSON()
    lastTiptapJson.value = json

    if (outputOptions.value.enableDebug) {
      editorDebug.log('TipTap JSON:', JSON.stringify(json, null, 2))
    }

    const result = await convertTiptapDocToMarkdown(json, {
      enableDebug: outputOptions.value.enableDebug,
      fileOutput: outputOptions.value.fileOutput,
      imageOutput: outputOptions.value.imageOutput,
      videoOutput: outputOptions.value.videoOutput,
    })

    return result
  }

  async function updateEditorFromMarkdown(
    value: string,
  ): Promise<ConversionResult<JSONContent> | null> {
    if (!editor.value) {
      return null
    }

    const result = await applyMarkdownToEditor(editor.value, value)
    if (result.ok && result.value) {
      lastTiptapJson.value = result.value
    }

    return result
  }

  async function runEditorUpdate(editorInstance: Editor): Promise<void> {
    try {
      isUpdating.value = true
      const result = await convertEditorToMarkdown(editorInstance)
      if (!result.ok) {
        handleConversionFailure(
          result,
          'tiptap_to_mdc',
          'Failed to convert TipTap document to markdown',
        )
        return
      }

      const markdown = result.value ?? ''
      lastEmittedValue.value = markdown
      lastStableValue.value = markdown
      updateHealthFromSuccess(result.traceId, markdown, editorInstance.getJSON(), result.issues)
      emit(markdown)
    } catch (error) {
      console.error('[Ginko Editor] Failed to convert to MDC:', error)
    } finally {
      isUpdating.value = false
    }
  }

  async function flushPendingEditorUpdate(): Promise<void> {
    if (syncTimeout) {
      clearTimeout(syncTimeout)
      syncTimeout = null
    }

    const editorInstance = pendingSyncEditor.value
    if (!editorInstance) {
      pendingSync.value = false
      return
    }

    if (isUpdating.value) {
      pendingSync.value = true
      return
    }

    pendingSync.value = false
    await runEditorUpdate(editorInstance)

    if (pendingSync.value && pendingSyncEditor.value) {
      scheduleEditorUpdate(pendingSyncEditor.value, true)
    }
  }

  function scheduleEditorUpdate(editorInstance: Editor, immediate = false): Promise<void> | void {
    pendingSync.value = true
    pendingSyncEditor.value = editorInstance

    if (syncTimeout) {
      clearTimeout(syncTimeout)
      syncTimeout = null
    }

    if (immediate || syncDebounceMs <= 0) {
      return flushPendingEditorUpdate()
    }

    syncTimeout = setTimeout(() => {
      void flushPendingEditorUpdate()
    }, syncDebounceMs)
  }

  async function handleEditorUpdate(editorInstance: Editor, docChanged: boolean): Promise<void> {
    editorDebug.log('Editor update triggered', {
      docChanged,
      isUpdating: isUpdating.value,
    })

    if (isUpdating.value) {
      editorDebug.log('Skipping update - isUpdating flag is set')
      return
    }

    if (docChanged !== true) {
      editorDebug.log('Skipping update - no document changes')
      return
    }

    await scheduleEditorUpdate(editorInstance)
  }

  async function initializeContent(): Promise<void> {
    editorDebug.log('Component mounted', {
      hasEditor: !!editor.value,
      hasValue: !!modelValue.value,
      valueLength: modelValue.value?.length ?? 0,
    })

    if (modelValue.value && editor.value) {
      try {
        isUpdating.value = true
        editorDebug.log('Parsing initial MDC content:', modelValue.value)

        const result = await updateEditorFromMarkdown(modelValue.value)
        if (!result) {
          return
        }
        if (!result.ok || !result.value) {
          handleConversionFailure(result, 'parse_mdc', 'Failed to parse initial MDC content')
        } else {
          updateHealthFromSuccess(result.traceId, modelValue.value, result.value, result.issues)
          editorDebug.log('Content set in editor')
        }
      } catch (error) {
        console.error('[Ginko Editor] Failed to parse MDC:', error)
      } finally {
        isUpdating.value = false
      }
    }

    syncRawContent(modelValue.value || '')
  }

  watch(modelValue, async (newValue, oldValue) => {
    editorDebug.log('modelValue changed', {
      hasEditor: !!editor.value,
      isUpdating: isUpdating.value,
      matchesLastEmit: newValue === lastEmittedValue.value,
      newLength: newValue?.length ?? 0,
      same: newValue === oldValue,
    })

    if (isUpdating.value || !editor.value) {
      return
    }

    if (newValue === oldValue) {
      return
    }

    if (newValue === lastEmittedValue.value) {
      editorDebug.log('Skipping - value matches last emitted (feedback loop prevention)')
      return
    }

    const editorText = editor.value?.getText().trim() || ''
    if (disabled.value && editorText.length > 0 && newValue !== lastEmittedValue.value) {
      editorDebug.warn('Skipping update during save - preserving editor content', {
        editorTextLength: editorText.length,
        oldLength: oldValue?.length ?? 0,
      })
      restorePending.value = true
      return
    }

    if (!newValue) {
      if (editorText.length > 0) {
        editorDebug.warn('Skipping empty value update - preserving editor content', {
          editorTextLength: editorText.length,
          oldLength: oldValue?.length ?? 0,
        })
        restorePending.value = true
        return
      }
    }

    syncRawContent(newValue || '')

    try {
      isUpdating.value = true
      const result = await updateEditorFromMarkdown(newValue)
      if (!result) {
        return
      }
      if (!result.ok || !result.value) {
        handleConversionFailure(result, 'parse_mdc', 'Failed to apply markdown update')
        return
      }
      updateHealthFromSuccess(result.traceId, newValue, result.value, result.issues)
    } catch (error) {
      console.error('[Ginko Editor] Failed to update from MDC:', error)
    } finally {
      isUpdating.value = false
    }
  })

  watch(disabled, (isDisabled) => {
    editorDebug.log('Disabled state changed:', isDisabled)

    if (disableTimeout.value) {
      window.clearTimeout(disableTimeout.value)
      disableTimeout.value = null
    }

    if (isDisabled) {
      disableApplied.value = false
      disableTimeout.value = window.setTimeout(() => {
        disableApplied.value = true
        editor.value?.setEditable(false)
        editorDebug.log('Applied disabled state after debounce')
      }, 200)
    } else {
      editor.value?.setEditable(true)
      if (disableApplied.value) {
        editorDebug.log('Re-enabled editor after debounce')
      } else {
        editorDebug.log('Editor enabled without debounce')
      }
      disableApplied.value = false
    }

    if (!isDisabled && restorePending.value && lastEmittedValue.value) {
      editorDebug.warn('Restoring content after save', {
        length: lastStableValue.value.length,
      })
      restorePending.value = false
      const restoreValue = lastStableValue.value || lastEmittedValue.value
      if (restoreValue) {
        syncRawContent(restoreValue)
        emit(restoreValue)
      }
    }
  })

  function cleanup(): void {
    editorDebug.log('Component unmounting')
    if (syncTimeout) {
      clearTimeout(syncTimeout)
    }
    if (disableTimeout.value) {
      window.clearTimeout(disableTimeout.value)
    }
  }

  return {
    cleanup,
    conversionHealth,
    flushPendingEditorUpdate,
    handleEditorUpdate,
    initializeContent,
    isUpdating,
    lastConversionError,
    lastConversionRecovery,
    lastEmittedValue,
    lastStableValue,
    lastTiptapJson,
  }
}
