<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  src: string
  id?: string
  filename?: string
  alt?: string
  title?: string
  width?: number | string
  height?: number | string
}>()
// Draft URLs may use local HTTP; public Content delivery separately requires HTTPS.
// Stored IDs and executable URL schemes never become browser image requests.
const source = computed(() => (/^https?:\/\//i.test(props.src) ? props.src : undefined))
// HTML-style YAML prop fences encode dimensions as strings; frontmatter uses numbers.
const dimension = (value: number | string | undefined) => {
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
</script>

<template>
  <img
    v-if="source"
    :src="source"
    :alt="alt ?? ''"
    :title="title"
    :width="dimension(width)"
    :height="dimension(height)"
    loading="lazy"
    decoding="async"
  />
</template>
