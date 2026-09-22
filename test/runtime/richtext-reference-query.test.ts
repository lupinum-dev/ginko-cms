// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import FieldRichtext from '../../packages/cms/studio-app/src/components/studio/fields/FieldRichtext.vue'
import { imageAuthoring } from '../../playground/image-authoring'

const state = vi.hoisted(() => ({
  args: undefined as { value: unknown } | undefined,
  urls: undefined as { value: Record<string, string | null> } | undefined,
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: (_query: unknown, args: { value: unknown }) => {
    state.args = args
    const data = ref<Record<string, string | null>>({})
    state.urls = data
    return { data, status: ref('success'), pending: ref(false), error: ref(null) }
  },
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))
vi.mock(
  '../../packages/cms/studio-app/src/components/studio/fields/StudioRichtextImageLibrary.vue',
  () => ({
    default: defineComponent({
      name: 'StudioRichtextImageLibrary',
      setup() {
        return () => h('div')
      },
    }),
  }),
)

describe('rich text asset query', () => {
  it.each(['markdown', 'canonical-mdc'])(
    'repaints the existing %s image when policy and asset URLs arrive after initial content',
    async (format) => {
      const wrapper = mount(FieldRichtext, {
        props: {
          field: { key: 'body', type: 'richtext', required: false },
          modelValue:
            format === 'markdown'
              ? '![Forest canopy](stored-image)'
              : '::image\n```yaml [props]\nid: stored-image\nsrc: stored-image\nfilename: canopy.png\nalt: Forest canopy\ntitle: Looking up\nwidth: 960\nheight: 640\n```\n::',
          label: 'Body',
          fieldError: null,
          assetContext: { collection: 'blog' },
        },
        global: {
          stubs: {
            StudioFieldShell: { template: '<div><slot /></div>' },
            StudioAssetPicker: true,
            StudioAssetMetadataDialog: true,
          },
        },
      })
      try {
        await flushPromises()
        const editor = wrapper.findComponent({ name: 'GinkoEditor' }).vm
        if (format === 'canonical-mdc') {
          await wrapper.setProps({
            assetContext: { collection: 'blog', authoringSource: imageAuthoring },
          })
          await flushPromises()
        }
        expect(state.args?.value).toEqual({ assetIds: ['stored-image'] })
        state.urls!.value = { 'stored-image': 'https://example.com/canopy.png' }
        await flushPromises()
        expect(wrapper.findComponent({ name: 'GinkoEditor' }).vm).toBe(editor)
        expect(wrapper.get('.ginko-image img').attributes('src')).toBe(
          'https://example.com/canopy.png',
        )
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      } finally {
        wrapper.unmount()
      }
    },
  )

  it('queries Content-recognized media, not asset-shaped prose, and keeps unchanged subscriptions stable', async () => {
    const wrapper = mount(FieldRichtext, {
      props: {
        field: { key: 'body', type: 'richtext', required: false },
        modelValue: 'A prose token abcdefghijklmnopqrst123456.',
        label: 'Body',
        fieldError: null,
        assetContext: { collection: 'docs' },
      },
      global: {
        stubs: {
          StudioFieldShell: { template: '<div><slot /></div>' },
          StudioAssetPicker: true,
          StudioAssetMetadataDialog: true,
        },
      },
    })
    try {
      await flushPromises()
      expect(state.args?.value).toBe('skip')
      await wrapper.setProps({ modelValue: '![Image](stored-image)' })
      await flushPromises()
      expect(state.args?.value).toEqual({ assetIds: ['stored-image'] })
      const prior = state.args?.value
      await wrapper.setProps({ modelValue: 'Added ordinary words.\n\n![Image](stored-image)' })
      await flushPromises()
      expect(state.args?.value).toBe(prior)
      wrapper
        .findComponent({ name: 'StudioRichtextImageLibrary' })
        .vm.$emit('resolved', 'stored-image', 'https://example.com/remembered.png')
      state.urls!.value = { 'stored-image': 'https://example.com/current.png' }
      await flushPromises()
      const editor = wrapper.findComponent({ name: 'GinkoEditor' })
      const provider = editor.props('assetProvider')
      expect(provider.buildUrl({ id: 'stored-image' })).toBe('https://example.com/current.png')
      state.urls!.value = { 'stored-image': null }
      await flushPromises()
      expect(provider.buildUrl({ id: 'stored-image' })).toBe('')
    } finally {
      wrapper.unmount()
    }
  })
})
