<script setup lang="ts">
import ContentBodyRenderer from '@lupinum/ginko-content/body-renderer'
import {
  parseMdcBody,
  validatePublicMarkdownAst,
  type ParseMdcBodyResult,
} from '@lupinum/ginko-content/cms-contract'
import { rewriteStoredMdcAssetReferences } from '@lupinum/ginko-content/portability'
import type { AuthoringKitV1 } from '@lupinum/ginko-editor'
import type { GinkoCmsReaderPreview, GinkoCmsReaderPreviewInput } from '@public/types'
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  onBeforeUnmount,
  onMounted,
  onErrorCaptured,
  ref,
  shallowRef,
  watch,
} from 'vue'

import { useStudioHostContext } from '../../../boundary/studio-host-context'

const props = defineProps<{
  source: string
  kit?: AuthoringKitV1
  urls: Readonly<Record<string, string | null>>
  locale?: string
}>()
const policy = computed(() => props.kit?.policy ?? { version: 2 as const, components: {} })
const body = shallowRef<ParseMdcBodyResult['body']>()
const error = ref('')
const loading = ref(false)
const renderFailed = ref(false)
const host = useStudioHostContext()
const hostTarget = ref<HTMLElement>()
const hostRendering = ref(false)
let hostPreview: GinkoCmsReaderPreview | undefined
function updateHostPreview() {
  if (!body.value || !hostPreview) return
  // The other Vue runtime receives only detached, already validated JSON data.
  const snapshot: GinkoCmsReaderPreviewInput = JSON.parse(
    JSON.stringify({
      body: body.value,
      policy: policy.value,
      components: Object.fromEntries(
        Object.entries(props.kit?.implementation ?? {}).map(([tag, implementation]) => [
          tag,
          implementation.componentName,
        ]),
      ),
      locale: props.locale,
    }),
  )
  hostPreview.update(snapshot)
}
onMounted(() => {
  const mount = host.getBridge().mountReaderPreview
  if (mount && hostTarget.value) {
    hostPreview = mount(hostTarget.value)
    hostRendering.value = true
    updateHostPreview()
  }
})
watch([body, policy, () => props.kit, () => props.locale], updateHostPreview)
const registry = getCurrentInstance()?.appContext.components ?? {}
// Studio is a separate Vue application. Use implementations registered there,
// and visibly identify missing host components instead of imitating their UI.
const missingComponent = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () =>
      h('aside', { class: 'richtext-preview-missing' }, [
        h('p', 'This custom component has no reader implementation in Studio.'),
        ...Object.values(slots).flatMap((slot) => slot?.() ?? []),
      ])
  },
})
const components = computed(() =>
  Object.fromEntries(
    Object.entries(props.kit?.implementation ?? {}).map(([tag, implementation]) => [
      tag,
      registry[implementation.componentName] ?? missingComponent,
    ]),
  ),
)
let revision = 0
watch(
  () => [props.source, props.kit, props.urls] as const,
  async ([source, , urls]) => {
    const current = ++revision
    loading.value = true
    try {
      const portable = await rewriteStoredMdcAssetReferences(source, policy.value, (id) => {
        const url = urls[id]
        if (!url)
          throw new Error(
            'An image or file is unavailable. Its stored reference is preserved in the editor.',
          )
        return url
      })
      const parsed = await parseMdcBody(portable, { autoClose: false })
      const validated = validatePublicMarkdownAst(parsed.body, policy.value)
      if (!validated.ok) throw new Error('Correct the source warning to update the preview.')
      if (current !== revision) return
      body.value = validated.value
      error.value = ''
      renderFailed.value = false
    } catch (cause) {
      if (current === revision)
        error.value = cause instanceof Error ? cause.message : 'The preview could not be rendered.'
    } finally {
      if (current === revision) loading.value = false
    }
  },
  { immediate: true },
)
onErrorCaptured((cause) => {
  renderFailed.value = true
  error.value = cause.message
  return false
})
onBeforeUnmount(() => {
  hostPreview?.destroy()
  revision++
})
</script>

<template>
  <div class="richtext-reader-preview" :aria-busy="loading">
    <p v-if="error" role="alert">Preview paused. {{ error }}</p>
    <div v-show="hostRendering" ref="hostTarget" />
    <ContentBodyRenderer
      v-if="body && !renderFailed && !hostRendering"
      :body="body"
      :policy="policy"
      :components="components"
      :locale="locale"
      :prose="true"
    />
    <p v-if="!source.trim()">Nothing to preview yet.</p>
  </div>
</template>

<style scoped>
.richtext-reader-preview {
  font-size: 0.95rem;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.richtext-reader-preview :deep(img) {
  max-width: 100%;
  height: auto;
}
.richtext-reader-preview :deep(h1) {
  font-size: 2rem;
}
.richtext-reader-preview :deep(h2) {
  font-size: 1.5rem;
}
.richtext-reader-preview :deep(h3) {
  font-size: 1.2rem;
}
.richtext-reader-preview :deep(ul) {
  list-style: disc;
  padding-inline-start: 1.5rem;
}
.richtext-reader-preview :deep(ol) {
  list-style: decimal;
  padding-inline-start: 1.5rem;
}
.richtext-reader-preview :deep(pre) {
  overflow-x: auto;
  padding: 1rem;
  background: var(--muted);
}
.richtext-reader-preview :deep(blockquote) {
  border-inline-start: 3px solid var(--border);
  padding-inline-start: 1rem;
}
.richtext-reader-preview :deep(table) {
  width: 100%;
  border-collapse: collapse;
}
.richtext-reader-preview :deep(td),
.richtext-reader-preview :deep(th) {
  border: 1px solid var(--border);
  padding: 0.5rem;
}
.richtext-reader-preview :deep(.richtext-preview-missing) {
  border: 1px dashed var(--border);
  padding: 1rem;
}
.richtext-reader-preview :deep(.richtext-preview-missing > p:first-child) {
  color: var(--muted-foreground);
  font-size: 0.8rem;
}
</style>
