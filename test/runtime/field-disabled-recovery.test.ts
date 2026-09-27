// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import StudioFieldRenderer from '../../packages/cms/studio-app/src/components/studio/StudioFieldRenderer.vue'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key, currentLocale: { value: 'en' } }),
}))
vi.mock('../../packages/cms/studio-app/src/components/studio/fields', async () => {
  const { defineComponent, h } = await import('vue')
  const scalar = defineComponent({
    emits: ['update:modelValue'],
    setup:
      (_, { emit }) =>
      () =>
        h('input', { onInput: () => emit('update:modelValue', 'changed') }),
  })
  const richtext = defineComponent({
    props: { disabled: Boolean },
    setup: (props) => () =>
      h('div', [h('input', { disabled: props.disabled }), h('button', 'Download recovery')]),
  })
  return {
    fieldComponents: { text: scalar, richtext },
    getDefault: () => '',
    getClientFieldError: () => null,
    getConditionHint: () => null,
  }
})

describe('read-only field recovery controls', () => {
  it('keeps scalar inputs natively disabled and ignores emitted updates', async () => {
    const wrapper = mount(StudioFieldRenderer, {
      props: { field: { key: 'title', type: 'text' }, modelValue: 'Original', disabled: true },
    })
    expect(wrapper.get('input').element.matches(':disabled')).toBe(true)
    await wrapper.get('input').trigger('input')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('disables rich-text editing without disabling recovery exports', () => {
    const wrapper = mount(StudioFieldRenderer, {
      props: { field: { key: 'body', type: 'richtext' }, modelValue: '', disabled: true },
    })
    expect(wrapper.get('input').element.matches(':disabled')).toBe(true)
    expect(wrapper.get('button').element.matches(':disabled')).toBe(false)
    wrapper.unmount()
  })
})
