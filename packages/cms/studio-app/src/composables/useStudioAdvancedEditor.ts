import { ref, watch } from 'vue'

const STORAGE_KEY = 'ginko-cms:studio:advanced-editor'
const advancedEditor = ref(false)
let loaded = false

function diagnosticsEnabledByUrl() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('diagnostics') === '1'
}

function loadAdvancedEditorPreference() {
  if (!diagnosticsEnabledByUrl()) {
    advancedEditor.value = false
    return
  }
  if (loaded) return
  loaded = true
  if (typeof localStorage === 'undefined') return
  advancedEditor.value = localStorage.getItem(STORAGE_KEY) === 'true'
}

export function useStudioAdvancedEditor() {
  loadAdvancedEditorPreference()

  watch(
    advancedEditor,
    (value) => {
      if (!diagnosticsEnabledByUrl()) {
        if (value) advancedEditor.value = false
        return
      }
      if (typeof localStorage === 'undefined') return
      localStorage.setItem(STORAGE_KEY, String(value))
    },
    { immediate: true },
  )

  return advancedEditor
}
