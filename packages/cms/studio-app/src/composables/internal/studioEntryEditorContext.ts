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

// For components that render both inside and outside the entry editor trees
// (or in isolated component tests): missing context degrades affordances
// instead of throwing.
export function useOptionalStudioEntryEditorContext() {
  return inject<StudioEntryEditorContext | null>(studioEntryEditorContextKey, null)
}
