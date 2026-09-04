<script setup lang="ts">
import { injectListboxRootContext } from 'reka-ui'
import { watch } from 'vue'

// Renderless helper for the command palette. Keystrokes already re-highlight
// the first item (reka's ListboxFilter), but debounced server results land
// without an input event; when the previously highlighted item was filtered
// away, Enter would silently do nothing. Watch the rendered-list signal and
// restore a highlight so Enter always opens the top visible result.
const props = defineProps<{ signal: string }>()

const listbox = injectListboxRootContext()

watch(
  () => props.signal,
  () => {
    if (listbox.highlightedElement.value?.isConnected) return
    listbox.highlightFirstItem()
  },
  { flush: 'post' },
)
</script>

<template>
  <slot />
</template>
