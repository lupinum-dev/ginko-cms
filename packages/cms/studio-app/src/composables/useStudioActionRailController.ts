import { createGlobalState, useLocalStorage, useMediaQuery } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'ginko-cms:studio:action-rail-open'
const RAIL_AS_COLUMN_QUERY = '(min-width: 1280px)'

export const useStudioActionRailController = createGlobalState(() => {
  const open = useLocalStorage(STORAGE_KEY, true)
  const sheetOpen = ref(false)
  const railAsColumn = useMediaQuery(RAIL_AS_COLUMN_QUERY)
  const collapsed = computed(() => railAsColumn.value && !open.value)
  const showSheet = computed(() => sheetOpen.value && !railAsColumn.value)
  const toggleLabel = computed(() =>
    railAsColumn.value && open.value ? 'Hide details' : 'Show details',
  )

  watch(railAsColumn, (value) => {
    if (value) sheetOpen.value = false
  })

  function setOpen(value: boolean) {
    open.value = value
  }

  function setSheetOpen(value: boolean) {
    sheetOpen.value = value
  }

  function toggle() {
    if (railAsColumn.value) {
      open.value = !open.value
      return
    }
    sheetOpen.value = true
  }

  return {
    open,
    collapsed,
    railAsColumn,
    sheetOpen,
    showSheet,
    toggle,
    setOpen,
    setSheetOpen,
    toggleLabel,
  }
})
