// @vitest-environment jsdom
import { parseMdcBody } from '@lupinum/ginko-content/cms-contract'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, inject, onUnmounted, ref } from 'vue'

import type { GinkoCmsReaderPreviewInput } from '../../packages/cms/src/public/types'
import { mountStudioReaderPreview } from '../../packages/cms/src/runtime/pages/studio-reader-preview'

describe('host-owned Studio reader', () => {
  it('contains reader errors and recovers on the next valid update', async () => {
    const target = document.body.appendChild(document.createElement('div'))
    const app = createApp({ render: () => null })
    const Broken = defineComponent({
      setup() {
        throw new Error('Reader failed')
      },
    })
    const preview = mountStudioReaderPreview(
      target,
      app._context,
      { Broken },
      { defaultLocale: 'en', locales: ['en'] },
    )
    const policy = {
      version: 2 as const,
      components: {
        note: {
          kind: 'block' as const,
          props: {},
          slots: ['default'],
          allowedChildren: null,
          allowedParents: null,
          media: null,
        },
      },
    }
    try {
      preview.update({
        body: (await parseMdcBody('<note>\nFailure\n</note>', { autoClose: false })).body,
        components: { note: 'Broken' },
        policy,
      })
      await flushPromises()
      expect(target.querySelector('[role="alert"]')?.textContent).toContain('Reader failed')
      preview.update({
        body: (await parseMdcBody('**Recovered**', { autoClose: false })).body,
        components: {},
        policy,
      })
      await flushPromises()
      expect(target.querySelector('[role="alert"]')).toBeNull()
      expect(target.querySelector('strong')?.textContent).toBe('Recovered')
    } finally {
      preview.destroy()
      target.remove()
    }
  })
  it('preserves host injections, reactive rendering, independent previews and cleanup', async () => {
    const root = document.body.appendChild(document.createElement('div'))
    const first = root.appendChild(document.createElement('div'))
    const second = root.appendChild(document.createElement('div'))
    const prefix = ref('Host'),
      app = createApp({ render: () => null })
    app.provide('reader-prefix', prefix)
    let unmounted = 0
    const ReaderNote = defineComponent({
      props: { title: String },
      setup(props, { slots }) {
        const injected = inject('reader-prefix', ref('Missing'))
        onUnmounted(() => {
          unmounted++
        })
        return () =>
          h('section', [h('strong', `${injected.value}: ${props.title}`), slots.default?.()])
      },
    })
    const a = mountStudioReaderPreview(
      first,
      app._context,
      { ReaderNote },
      { defaultLocale: 'en', locales: ['en', 'de'] },
    )
    const b = mountStudioReaderPreview(
      second,
      app._context,
      { ReaderNote },
      { defaultLocale: 'en', locales: ['en', 'de'] },
    )
    const input: GinkoCmsReaderPreviewInput = {
      body: (await parseMdcBody('<note title="Title">\nText\n</note>', { autoClose: false })).body,
      components: { note: 'ReaderNote' },
      policy: {
        version: 2,
        components: {
          note: {
            kind: 'block',
            props: { title: { types: ['string'], required: false, allowedValues: null } },
            slots: ['default'],
            allowedChildren: null,
            allowedParents: null,
            media: null,
          },
        },
      },
    }
    try {
      a.update(input)
      b.update(input)
      await flushPromises()
      expect(first.textContent).toBe('Host: TitleText')
      prefix.value = 'Updated'
      await flushPromises()
      expect(first.textContent).toBe('Updated: TitleText')
      expect(second.textContent).toBe('Updated: TitleText')
      a.destroy()
      a.destroy()
      a.update(input)
      await flushPromises()
      expect(first.textContent).toBe('')
      expect(second.textContent).toBe('Updated: TitleText')
      expect(unmounted).toBe(1)
    } finally {
      a.destroy()
      b.destroy()
      root.remove()
    }
    expect(unmounted).toBe(2)
  })
})
