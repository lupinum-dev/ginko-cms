import { inject, provide } from 'vue'

import type { useStudioEntryEditor } from './useStudioEntryEditor'

const studioEntryEditorContextKey = Symbol('studio-entry-editor-context')

export type StudioEntryEditorContext = ReturnType<typeof useStudioEntryEditor>

export function provideStudioEntryEditorContext(context: StudioEntryEditorContext) {
  provide(studioEntryEditorContextKey, context)
}

export function useStudioEntryEditorContext() {
  const context = inject<StudioEntryEditorContext | null>(studioEntryEditorContextKey, null)
  if (!context) {
    throw new Error('Studio entry editor context is not available')
  }
  return context
}
