import { ref, watch } from 'vue'

const STORAGE_KEY = 'ginko-cms:studio:advanced-editor'
const advancedEditor = ref(false)
let loaded = false

// "More details" preference for the editor's details panel (workflow spine,
// track card, technical receipt). This is a plain persisted user preference:
// the panel toggle is itself the explicit path UI-REVISION requires for
// advanced information. It is deliberately NOT tied to the `?diagnostics=1`
// URL flag — that gate previously made the visible toggle a no-op for normal
// users (design review follow-up). The raw editor DebugPanel keeps its own
// separate `settings.enableDebug` gate.
function loadAdvancedEditorPreference() {
  if (loaded) return
  loaded = true
  if (typeof localStorage === 'undefined') return
  advancedEditor.value = localStorage.getItem(STORAGE_KEY) === 'true'
}

export function useStudioAdvancedEditor() {
  loadAdvancedEditorPreference()

  watch(advancedEditor, (value) => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, String(value))
  })

  return advancedEditor
}
