// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import StudioEntryHeroFields from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryHeroFields.vue'

const titleField = { key: 'title', label: 'Title', type: 'text', required: true, localized: true }
const descriptionField = {
  key: 'description',
  label: 'Description',
  type: 'textarea',
  localized: true,
}

function mountHero(props: Record<string, unknown> = {}) {
  return mount(StudioEntryHeroFields, {
    props: {
      titleField,
      descriptionField,
      values: { title: 'Hello', description: 'World' },
      ...props,
    },
  })
}

describe('StudioEntryHeroFields', () => {
  it('renders title and description as borderless textareas with sr-only labels', () => {
    const wrapper = mountHero()
    const labels = wrapper.findAll('label')
    expect(labels).toHaveLength(2)
    for (const label of labels) {
      expect(label.classes()).toContain('ginko:sr-only')
    }
    const title = wrapper.find('#title')
    expect(title.element.tagName).toBe('TEXTAREA')
    expect((title.element as HTMLTextAreaElement).value).toBe('Hello')
    expect((wrapper.find('#description').element as HTMLTextAreaElement).value).toBe('World')
  })

  it('prefixes DOM ids so compare panes stay unique', () => {
    const wrapper = mountHero({ idPrefix: 'secondary-' })
    expect(wrapper.find('#secondary-title').exists()).toBe(true)
    expect(wrapper.find('#secondary-description').exists()).toBe(true)
    expect(wrapper.find('#title').exists()).toBe(false)
  })

  it('emits update/blur with the field key', async () => {
    const wrapper = mountHero()
    await wrapper.find('#title').setValue('Renamed')
    await wrapper.find('#title').trigger('blur')
    expect(wrapper.emitted('update')).toEqual([['title', 'Renamed']])
    expect(wrapper.emitted('blur')).toEqual([['title']])
  })

  it('shows a required error line + aria-invalid when validation is on', () => {
    const wrapper = mountHero({ values: { title: '', description: '' }, showValidation: true })
    const title = wrapper.find('#title')
    expect(title.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Title is required.')
  })

  it('omits the description block when no description field is given', () => {
    const wrapper = mountHero({ descriptionField: null })
    expect(wrapper.findAll('textarea')).toHaveLength(1)
  })
})
