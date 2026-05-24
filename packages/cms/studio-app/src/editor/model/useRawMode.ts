/**
 * Raw Markdown Mode
 *
 * Toggles between visual (Tiptap) and raw (Monaco) editing modes.
 * Syncs content when switching modes and detects dirty state.
 *
 * @domain editor
 * @scope Editor editor raw mode toggle
 * @state Local (new state per call)
 * @mutations toggleRawMode, applyRawChanges, discardRawChanges
 */

import type { Editor, JSONContent } from '@tiptap/core'
import type { Ref } from 'vue'
import { ref, watch } from 'vue'

import type {
  ConversionErrorPayload,
  ConversionHealthState,
  ConversionRecoveredPayload,
} from '../lib/conversionPipeline'
import { applyMarkdownToEditor } from '../lib/conversionPipeline'
import {
  getHealthStatusFromIssues,
  maybeBuildRecoveryPayload,
  selectPrimaryIssue,
  toConversionErrorPayload,
} from '../lib/conversionState'
import { editorDebug } from '../lib/debug'

export interface UseRawModeOptions {
  editor: Ref<Editor | undefined>
  emit: (value: string) => void
  isUpdating: Ref<boolean>
  lastEmittedValue: Ref<string>
  lastStableValue: Ref<string>
  lastTiptapJson: Ref<JSONContent | null>
  modelValue: Ref<string>
  onConversionError?: (payload: ConversionErrorPayload) => void
  onConversionRecovered?: (payload: ConversionRecoveredPayload) => void
}

export function useRawMode(options: UseRawModeOptions) {
  const {
    editor,
    emit,
    isUpdating,
    lastEmittedValue,
    lastStableValue,
    lastTiptapJson,
    modelValue,
  } = options

  const viewMode = ref<'raw' | 'visual'>('visual')
  const rawContent = ref('')
  const rawDirty = ref(false)
  const conversionHealth = ref<ConversionHealthState>({
    lastGoodDoc: null,
    lastGoodMarkdown: '',
    status: 'ok',
  })
  const lastConversionError = ref<ConversionErrorPayload | null>(null)
  const lastConversionRecovery = ref<ConversionRecoveredPayload | null>(null)

  // Sync raw content when switching to raw mode
  watch(viewMode, (mode) => {
    editorDebug.log('View mode changed to:', mode)
    if (mode === 'raw') {
      rawContent.value = modelValue.value || ''
    }
  })

  function onRawChange(value: string): void {
    rawContent.value = value
    rawDirty.value = true
    editorDebug.log('Raw content updated, length:', value.length)
    lastEmittedValue.value = value
    lastStableValue.value = value
    emit(value)
  }

  // Switch from raw back to visual - need to re-parse
  async function switchToVisual() {
    editorDebug.log('Switching to visual mode')

    if (editor.value && rawDirty.value) {
      try {
        isUpdating.value = true
        editorDebug.log('Parsing raw content on mode switch', {
          length: rawContent.value.length,
        })

        const result = await applyMarkdownToEditor(editor.value, rawContent.value)
        if (!result.ok || !result.value) {
          const payload = toConversionErrorPayload(result, {
            fallbackCode: 'switch_to_visual_failed',
            fallbackMessage: 'Failed to switch raw content to visual mode',
            fallbackPhase: 'parse_mdc',
            recoverable: true,
          })
          const primaryIssue = selectPrimaryIssue(payload.issues)
          conversionHealth.value = {
            ...conversionHealth.value,
            lastError: primaryIssue,
            status: 'failed',
          }
          lastConversionError.value = payload
          options.onConversionError?.(payload)
          viewMode.value = 'raw'
          return
        }

        const previousStatus = conversionHealth.value.status
        const nextStatus = getHealthStatusFromIssues(result.issues)
        conversionHealth.value = {
          lastGoodDoc: result.value,
          lastGoodMarkdown: rawContent.value,
          status: nextStatus,
        }

        const recovery = maybeBuildRecoveryPayload(previousStatus, nextStatus, result.traceId)
        if (recovery) {
          lastConversionRecovery.value = recovery
          options.onConversionRecovered?.(recovery)
        }

        lastTiptapJson.value = result.value
        rawDirty.value = false
        viewMode.value = 'visual'
      } catch (error) {
        console.error('[Ginko Editor] Failed to parse raw content:', error)
        viewMode.value = 'raw'
      } finally {
        isUpdating.value = false
      }
      return
    }

    viewMode.value = 'visual'
  }

  function syncRawContent(value: string): void {
    rawContent.value = value
    editorDebug.log('Raw content synced from modelValue', {
      length: rawContent.value.length,
    })
  }

  return {
    onRawChange,
    rawContent,
    rawDirty,
    conversionHealth,
    lastConversionError,
    lastConversionRecovery,
    switchToVisual,
    syncRawContent,
    viewMode,
  }
}
