// @vitest-environment jsdom
import type { EditorFlushResult } from '@lupinum/ginko-editor'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import FieldRichtext from '../../packages/cms/studio-app/src/components/studio/fields/FieldRichtext.vue'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({
    data: ref({}),
    status: ref('success'),
    pending: ref(false),
    error: ref(null),
  }),
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

vi.mock(
  '../../packages/cms/studio-app/src/components/studio/fields/StudioRichtextImageLibrary.vue',
  () => ({
    default: defineComponent({ setup: () => () => h('div') }),
  }),
)

function mountField(flush: () => Promise<EditorFlushResult>) {
  return mount(FieldRichtext, {
    props: {
      field: { key: 'body', type: 'richtext', required: false },
      modelValue: 'Saved text',
      label: 'Body',
      fieldError: null,
    },
    global: {
      stubs: {
        StudioFieldShell: { template: '<section><slot name="action" /><slot /></section>' },
        Button: { template: '<button><slot /></button>' },
        Icon: true,
        GinkoEditor: defineComponent({
          name: 'GinkoEditor',
          setup(_, { expose }) {
            expose({ flush })
            return () => h('div')
          },
        }),
        StudioRichtextPreview: { name: 'StudioRichtextPreview', template: '<div data-preview />' },
      },
    },
  })
}

describe('rich text preview boundary', () => {
  it('waits for conversion before opening the reader', async () => {
    let resolve!: (value: EditorFlushResult) => void
    const flush = vi.fn(
      () =>
        new Promise<EditorFlushResult>((done) => {
          resolve = done
        }),
    )
    const wrapper = mountField(flush)
    try {
      await flushPromises()
      await wrapper.get('button').trigger('click')
      expect(flush).toHaveBeenCalledOnce()
      expect(wrapper.find('[data-preview]').exists()).toBe(false)
      resolve({ ok: true, emitted: true })
      await flushPromises()
      expect(wrapper.find('[data-preview]').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps the editor visible and reports unfinished uploads', async () => {
    const flush = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        emitted: false,
        error: { message: 'Finish the image upload before leaving.' },
      })
    const wrapper = mountField(flush)
    try {
      await flushPromises()
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-preview]').exists()).toBe(false)
      expect(wrapper.get('[role="alert"]').text()).toBe('Finish the image upload before leaving.')
      expect(wrapper.findComponent({ name: 'GinkoEditor' }).exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })
})
