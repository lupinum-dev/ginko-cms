import { ref, watch } from 'vue'

const STORAGE_KEY = 'ginko-cms:studio:inspector-visible'
const inspectorVisible = ref(true)
let loaded = false

function loadInspectorVisiblePreference() {
  if (loaded) return
  loaded = true
  if (typeof localStorage === 'undefined') return
  const raw = localStorage.getItem(STORAGE_KEY)
  inspectorVisible.value = raw === null ? true : raw === 'true'
}

export function useStudioInspectorVisible() {
  loadInspectorVisiblePreference()

  watch(
    inspectorVisible,
    (value) => {
      if (typeof localStorage === 'undefined') return
      localStorage.setItem(STORAGE_KEY, String(value))
    },
    { immediate: true },
  )

  return inspectorVisible
}
