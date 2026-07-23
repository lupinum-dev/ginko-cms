import type { ReadinessAction } from '@lupinum/ginko-cms-contract/shared/readiness.js'

import type { StudioEntryEditorContext } from './studioEntryEditorContext'

// Plain factory — deliberately NOT a composable. The status rail mounts in
// tests with only the editor context provided, so this must not call inject()
// or other setup-scoped APIs. Everything it needs travels on the context:
// router via editor.loader.router, publish preview via editor.workflow.
//
// Readiness may suggest backend-produced next steps that are not executable
// from this surface. Only exact kinds with a truthful Studio operation get a
// click handler; suggestions remain label-only.
export function createReadinessActionHandler(editor: StudioEntryEditorContext) {
  function focusField(action: ReadinessAction): boolean {
    const fieldPath = typeof action.params.fieldPath === 'string' ? action.params.fieldPath : null
    if (!fieldPath) return false
    // Inputs carry id === field.key; nested paths anchor on their root field.
    // Duplicate ids across compare panes resolve to the primary panel because
    // it renders first (matching focusFirstValidationError's behaviour).
    const element = document.getElementById(fieldPath.split('.')[0] ?? fieldPath)
    if (!element) return false
    element.scrollIntoView({ block: 'center' })
    element.focus()
    return true
  }

  function focusEditor(): boolean {
    const surface = document.querySelector<HTMLElement>(
      '.studio-entry-locale-panels [contenteditable="true"]',
    )
    if (!surface) return false
    surface.scrollIntoView({ block: 'center' })
    surface.focus()
    return true
  }

  function canHandle(action: ReadinessAction | null | undefined): boolean {
    if (!action) return false
    switch (action.kind) {
      case 'fill_required_field':
      case 'fill_required_localized_field':
      case 'fill_required_shared_field':
        return typeof action.params.fieldPath === 'string'
      case 'continue_editing':
        return true
      case 'add_locale':
        return typeof action.locale === 'string' && action.locale.length > 0
      case 'open_review':
        return true
      case 'publish_locale':
        return editor.loader.canPublishEntries
      default:
        return false
    }
  }

  async function handle(action: ReadinessAction | null | undefined): Promise<void> {
    if (!action || !canHandle(action)) return
    switch (action.kind) {
      case 'fill_required_field':
      case 'fill_required_localized_field':
      case 'fill_required_shared_field':
        focusField(action)
        return
      case 'continue_editing':
        focusEditor()
        return
      case 'add_locale':
        await editor.locales.handleSwitchLocale(action.locale as string)
        return
      case 'open_review':
        await editor.loader.router.push('/reviews')
        return
      case 'publish_locale':
        // Mirrors StudioEntryDetailsPanel.openPublishDialog — all publish
        // paths must run through the preview/readiness flow.
        if (editor.publishing.handlePublish()) {
          void editor.workflow?.previewPublishImpact(editor.loader.currentLocale)
        }
        return
    }
  }

  return { canHandle, handle }
}
