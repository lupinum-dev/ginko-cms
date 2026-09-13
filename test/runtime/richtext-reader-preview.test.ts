import { createAuthoringKit } from '@lupinum/ginko-editor'
// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, isProxy } from 'vue'

import { studioHostContextKey } from '../../packages/cms/studio-app/src/boundary/studio-host-context'
import StudioRichtextPreview from '../../packages/cms/studio-app/src/components/studio/fields/StudioRichtextPreview.vue'

describe('Studio reader preview', () => {
  it('mounts the host bridge once, passes detached updates and destroys it on teardown', async () => {
    const update = vi.fn(),
      destroy = vi.fn()
    const mountReaderPreview = vi.fn((target: HTMLElement) => {
      expect(target.isConnected).toBe(true)
      return { update, destroy }
    })
    const wrapper = mount(StudioRichtextPreview, {
      attachTo: document.body,
      props: { source: '# Initial', urls: {}, locale: 'en' },
      global: {
        provide: {
          [studioHostContextKey as symbol]: { getBridge: () => ({ mountReaderPreview }) },
        },
      },
    })
    try {
      await flushPromises()
      expect(mountReaderPreview).toHaveBeenCalledTimes(1)
      const first = update.mock.calls.at(-1)?.[0]
      expect(first.locale).toBe('en')
      expect(isProxy(first)).toBe(false)
      expect(isProxy(first.body)).toBe(false)
      expect(wrapper.find('h1').exists()).toBe(false)
      await wrapper.setProps({ source: '# Changed', locale: 'de' })
      await flushPromises()
      expect(update.mock.calls.at(-1)?.[0].locale).toBe('de')
      expect(JSON.stringify(update.mock.calls.at(-1)?.[0].body)).toContain('Changed')
      expect(JSON.stringify(first.body)).toContain('Initial')
    } finally {
      wrapper.unmount()
    }
    expect(destroy).toHaveBeenCalledTimes(1)
  })
  it('renders native Markdown and resolves only actual stored image sources', async () => {
    const wrapper = mount(StudioRichtextPreview, {
      props: {
        source:
          '# Heading\n\nA prose token abcdefghijklmnopqrst123456 is not an asset.\n\n![Description](stored-image)',
        urls: { 'stored-image': 'https://example.com/image.png' },
      },
    })
    try {
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe('Heading')
      expect(wrapper.get('img').attributes()).toMatchObject({
        src: 'https://example.com/image.png',
        alt: 'Description',
      })
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      await wrapper.setProps({ urls: {} })
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('stored reference is preserved')
      await wrapper.setProps({ source: '**Recovered**' })
      await flushPromises()
      expect(wrapper.get('strong').text()).toBe('Recovered')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('uses registered reader components and makes missing implementations explicit', async () => {
    const kit = await createAuthoringKit({
      version: 1,
      policy: {
        version: 2,
        components: {
          note: {
            kind: 'block',
            media: null,
            props: {},
            slots: ['default'],
            allowedChildren: null,
            allowedParents: null,
          },
        },
      },
      implementation: { note: { componentName: 'ReaderNote', props: {}, slots: ['default'] } },
      authoring: { note: { label: 'Note' } },
      recipes: [],
    })
    const props = { source: '<note>\nReader text\n</note>', urls: {}, kit }
    const missing = mount(StudioRichtextPreview, { props })
    const actual = mount(StudioRichtextPreview, {
      props,
      global: {
        components: {
          ReaderNote: defineComponent({
            setup(_, { slots }) {
              return () => h('section', { 'data-reader-note': '' }, slots.default?.())
            },
          }),
        },
      },
    })
    try {
      await flushPromises()
      expect(missing.text()).toContain('no reader implementation in Studio')
      expect(missing.text()).toContain('Reader text')
      expect(actual.get('[data-reader-note]').text()).toBe('Reader text')
      expect(actual.text()).not.toContain('no reader implementation')
    } finally {
      missing.unmount()
      actual.unmount()
    }
  })
})
