// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import FieldRichtext from '../../packages/cms/studio-app/src/components/studio/fields/FieldRichtext.vue'

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
