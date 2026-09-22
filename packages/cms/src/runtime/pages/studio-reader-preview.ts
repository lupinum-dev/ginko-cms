import ContentBodyRenderer from '@lupinum/ginko-content/body-renderer'
import {
  defineComponent,
  h,
  onErrorCaptured,
  render,
  shallowRef,
  type AppContext,
  type Component,
} from 'vue'

import type { GinkoCmsReaderPreview, GinkoCmsReaderPreviewInput } from '../../public/types.js'

/** Render in the host's Vue runtime so reader setup, injections and effects work. */
export function mountStudioReaderPreview(
  target: HTMLElement,
  appContext: AppContext,
  registry: Record<string, Component>,
  locales: { defaultLocale: string; locales: string[] },
): GinkoCmsReaderPreview {
  const input = shallowRef<GinkoCmsReaderPreviewInput>()
  const failure = shallowRef('')
  let destroyed = false
  const missing = defineComponent({
    setup(_, { slots }) {
      return () =>
        h('aside', [
          h('p', 'This custom component has no reader implementation in the host.'),
          ...Object.values(slots).flatMap((slot) => slot?.() ?? []),
        ])
    },
  })
  const boundary = defineComponent({
    setup() {
      onErrorCaptured((error) => {
        failure.value = error.message
        return false
      })
      return () => {
        if (failure.value) return h('p', { role: 'alert' }, `Preview paused. ${failure.value}`)
        const value = input.value
        if (!value) return null
        const components = Object.fromEntries(
          Object.entries(value.components).map(([tag, name]) => [tag, registry[name] ?? missing]),
        )
        return h(ContentBodyRenderer, {
          body: value.body,
          policy: value.policy,
          components,
          locale: value.locale,
          ...locales,
          prose: true,
        })
      }
    },
  })
  const vnode = h(boundary)
  vnode.appContext = appContext
  render(vnode, target)
  return {
    update(value) {
      if (!destroyed) {
        failure.value = ''
        input.value = value
      }
    },
    destroy() {
      if (!destroyed) {
        destroyed = true
        render(null, target)
      }
    },
  }
}
