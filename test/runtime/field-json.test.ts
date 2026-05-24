// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import FieldJson from '../../packages/cms/studio-app/src/components/studio/fields/FieldJson.vue'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      key === 'ginkoCms.studio.fieldRenderer.invalidJson'
        ? `Invalid JSON: ${String(params?.message ?? '')}`
        : key,
  }),
}))

const field = {
  key: 'socials',
  type: 'json',
  label: 'Socials',
} as const

function mountField() {
  const Host = defineComponent({
    components: { FieldJson },
    setup() {
      const model = ref<unknown>({})
      return { field, model }
    },
    template: `
      <FieldJson
        v-model="model"
        :field="field"
        label="Socials"
        :field-error="null"
      />
    `,
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

describe('FieldJson', () => {
  it('keeps invalid JSON editable instead of resetting to the last valid value', async () => {
    const wrapper = mountField()
    const textarea = wrapper.get('textarea')

    await textarea.setValue('{data: }')

    expect((textarea.element as HTMLTextAreaElement).value).toBe('{data: }')
    expect(wrapper.text()).toContain('Invalid JSON:')
  })

  it('updates the parsed model when the JSON becomes valid', async () => {
    const wrapper = mountField()
    const textarea = wrapper.get('textarea')

    await textarea.setValue('{"github":"matthias"}')

    expect(wrapper.vm.$data).toEqual({})
    expect((wrapper.vm as unknown as { model: unknown }).model).toEqual({ github: 'matthias' })
    expect(wrapper.text()).not.toContain('Invalid JSON:')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('{"github":"matthias"}')
  })
})
