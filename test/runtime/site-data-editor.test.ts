// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import StudioSiteDataEditor from '../../packages/cms/studio-app/src/components/studio/StudioSiteDataEditor.vue'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      key === 'ginkoCms.studio.fieldRenderer.invalidJson'
        ? `Invalid JSON: ${String(params?.message ?? '')}`
        : key,
  }),
}))

function mountEditor() {
  const Host = defineComponent({
    components: { StudioSiteDataEditor },
    setup() {
      const model = ref<Record<string, unknown>>({})
      return { model }
    },
    template: '<StudioSiteDataEditor v-model="model" :schema="{ type: \'custom\' }" />',
  })

  return mount(Host, {
    global: {
      stubs: {
        Label: { template: '<label><slot /></label>' },
        Textarea: defineComponent({
          props: { modelValue: String },
          emits: ['update:modelValue'],
          setup(_props, { emit }) {
            return {
              onInput: (event: Event) =>
                emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
            }
          },
          template: '<textarea :value="modelValue" @input="onInput" />',
        }),
      },
    },
  })
}

describe('StudioSiteDataEditor', () => {
  it('keeps invalid custom JSON editable instead of resetting to the last valid value', async () => {
    const wrapper = mountEditor()
    const textarea = wrapper.get('textarea')

    await textarea.setValue('{data: }')

    expect((textarea.element as HTMLTextAreaElement).value).toBe('{data: }')
    expect(wrapper.text()).toContain('Invalid JSON:')
  })

  it('updates the custom model when the JSON becomes valid', async () => {
    const wrapper = mountEditor()
    const textarea = wrapper.get('textarea')

    await textarea.setValue('{"support":"hello"}')

    expect((wrapper.vm as unknown as { model: unknown }).model).toEqual({ support: 'hello' })
    expect(wrapper.text()).not.toContain('Invalid JSON:')
  })
})
