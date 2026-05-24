import type { Editor, JSONContent } from '@tiptap/core'
import type { ComputedRef, Ref } from 'vue'

import type {
  ConversionErrorPayload,
  ConversionHealthState,
  ConversionRecoveredPayload,
} from '../lib/conversionPipeline'
import { getEditorDebugEvents } from '../lib/debug'
import { parseMdc, stringifyMdc } from '../lib/markdown'
import { mdcToTiptap } from '../lib/mdcToTiptap'
import type { MDCRoot } from '../lib/mdcTypes'
import { tiptapToMDC } from '../lib/tiptapToMdc'

export interface UseDebugExportOptions {
  editor: Ref<Editor | undefined>
  isUpdating: Ref<boolean>
  lastEmittedValue: Ref<string>
  lastStableValue: Ref<string>
  lastTiptapJson: Ref<JSONContent | null>
  modelValue: ComputedRef<string>
  rawContent: Ref<string>
  viewMode: Ref<'raw' | 'visual'>
  conversionDiagnostics: ComputedRef<{
    health: ConversionHealthState
    lastError: ConversionErrorPayload | null
    lastRecovery: ConversionRecoveredPayload | null
  }>
}

export function useDebugExport(options: UseDebugExportOptions) {
  const events = getEditorDebugEvents()

  async function exportDebugData() {
    const currentTiptapJson = options.editor.value?.getJSON() || null
    const currentMarkdown = options.modelValue.value || ''

    let mdcAst: MDCRoot | { error: string } | null = null
    let reconvertedTiptap: unknown = null
    let reconvertedMarkdown: null | string = null
    let tiptapToMdcAst: MDCRoot | { error: string } | null = null

    try {
      mdcAst = await parseMdc(currentMarkdown, { strict: false })
    } catch (error) {
      mdcAst = { error: String(error) }
    }

    try {
      if (currentTiptapJson) {
        const convertedAst = await tiptapToMDC(currentTiptapJson)
        tiptapToMdcAst = convertedAst
        reconvertedMarkdown = await stringifyMdc(convertedAst, { strict: false })
      }
    } catch (error) {
      tiptapToMdcAst = { error: String(error) }
    }

    try {
      if (mdcAst && !('error' in mdcAst)) {
        reconvertedTiptap = mdcToTiptap(mdcAst)
      }
    } catch (error) {
      reconvertedTiptap = { error: String(error) }
    }

    const debugData = {
      conversion: options.conversionDiagnostics.value,
      editor: {
        extensions:
          options.editor.value?.extensionManager.extensions.map((extension) => ({
            name: extension.name,
            type: extension.type,
          })) || [],
        htmlOutput: options.editor.value?.getHTML() || null,
        textOutput: options.editor.value?.getText() || null,
      },
      events: events.value,
      exportedAt: new Date().toISOString(),
      input: {
        modelValue: currentMarkdown,
        rawContent: options.rawContent.value,
      },
      mdc: {
        astFromMarkdown: mdcAst,
        astFromTiptap: tiptapToMdcAst,
      },
      roundTrip: {
        markdownFromTiptap: reconvertedMarkdown,
        tiptapFromMarkdown: reconvertedTiptap,
      },
      state: {
        isUpdating: options.isUpdating.value,
        lastEmittedValue: options.lastEmittedValue.value,
        lastStableValue: options.lastStableValue.value,
        lastTiptapJson: options.lastTiptapJson.value,
        viewMode: options.viewMode.value,
      },
      tiptap: {
        currentJson: currentTiptapJson,
      },
      version: 'debug-v2',
    }

    if (typeof window === 'undefined') {
      return debugData
    }

    const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `editor-debug-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return debugData
  }

  return { exportDebugData, events }
}
