// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref, watch } from 'vue'

import Editor from '../../../packages/cms/studio-app/src/editor/ui/Editor.vue'

class MockDataTransfer {
  private readonly data = new Map<string, string>()

  clearData(format?: string) {
    if (format) {
      this.data.delete(format)
      return
    }

    this.data.clear()
  }

  getData(format: string) {
    return this.data.get(format) ?? ''
  }

  setData(format: string, value: string) {
    this.data.set(format, value)
  }
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  setup(_props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default?.(),
      )
  },
})

const TextareaStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: {
      default: '',
      type: String,
    },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('textarea', {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
      })
  },
})

const Host = defineComponent({
  components: { Editor },
  setup() {
    const value = ref('')
    const updateCount = ref(0)

    watch(value, () => {
      updateCount.value += 1
    })

    return { updateCount, value }
  },
  template: `
    <div>
      <Editor v-model="value" placeholder="Write something" />
      <pre data-testid="model-value">{{ value }}</pre>
      <div data-testid="update-count">{{ updateCount }}</div>
    </div>
  `,
})

function mountHost() {
  return mount(Host, {
    attachTo: document.body,
    global: {
      stubs: {
        Button: ButtonStub,
        DebugPanel: true,
        Icon: true,
        RichTextToolbar: true,
        Textarea: TextareaStub,
      },
    },
  })
}

function getEditor(wrapper: ReturnType<typeof mountHost>) {
  const editor = wrapper.findComponent(Editor).vm.editor
  expect(editor).toBeTruthy()
  return editor
}

async function waitFor(condition: () => boolean, timeoutMs = 1000) {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

beforeAll(() => {
  if (!globalThis.DataTransfer) {
    // Minimal clipboard API surface for copy/paste workflow tests.
    ;(globalThis as typeof globalThis & { DataTransfer: typeof MockDataTransfer }).DataTransfer =
      MockDataTransfer as never
  }

  if (!globalThis.ResizeObserver) {
    class ResizeObserverStub {
      disconnect() {}
      observe() {}
      unobserve() {}
    }
    ;(
      globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverStub }
    ).ResizeObserver = ResizeObserverStub
  }

  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    })) as typeof window.matchMedia
  }

  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {}
  }

  if (!HTMLElement.prototype.getBoundingClientRect) {
    HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
  }

  if (!HTMLElement.prototype.getClientRects) {
    HTMLElement.prototype.getClientRects = () =>
      ({
        item: () => null,
        length: 0,
        [Symbol.iterator]: function* () {},
      }) as DOMRectList
  }

  if (typeof Range !== 'undefined') {
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
    }

    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () =>
        ({
          item: () => null,
          length: 0,
          [Symbol.iterator]: function* () {},
        }) as DOMRectList
    }
  }
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('editor mounted workflows', () => {
  it('debounces visual updates and flushes pending content on blur', async () => {
    const wrapper = mountHost()
    await flushPromises()

    const editor = getEditor(wrapper)

    editor.commands.insertContent('fast ')
    editor.commands.insertContent('typing')

    await nextTick()
    expect(wrapper.get('[data-testid="model-value"]').text()).toBe('')

    editor.view.dom.dispatchEvent(new FocusEvent('blur', { bubbles: true }))

    await waitFor(() => wrapper.get('[data-testid="model-value"]').text().includes('fast typing'))
    expect(wrapper.get('[data-testid="update-count"]').text()).toBe('1')
  })

  it('parses raw markdown back into structured visual content', async () => {
    const wrapper = mountHost()
    await flushPromises()

    await wrapper.get('button:nth-of-type(2)').trigger('click')
    await wrapper.get('textarea').setValue('# Heading\n\nParagraph text\n')
    await wrapper.get('button:nth-of-type(1)').trigger('click')
    await flushPromises()

    const editor = getEditor(wrapper)
    await waitFor(() => JSON.stringify(editor.getJSON()).includes('Heading'))
    expect(editor.getText()).toContain('Heading')
    expect(editor.getText()).toContain('Paragraph text')
    expect(wrapper.get('[data-testid="model-value"]').text()).toContain('# Heading')
  })

  it('converts markdown paste into structured nodes', async () => {
    const wrapper = mountHost()
    await flushPromises()

    const target = getEditor(wrapper).view.dom
    const data = new MockDataTransfer()
    data.setData('text/plain', '# Paste heading\n\nPasted body\n')
    data.setData('text/markdown', '# Paste heading\n\nPasted body\n')
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: data })

    target.dispatchEvent(paste)
    await flushPromises()

    const editor = getEditor(wrapper)
    await waitFor(() => JSON.stringify(editor.getJSON()).includes('Paste heading'))
    expect(editor.getText()).toContain('Paste heading')
    expect(editor.getText()).toContain('Pasted body')
    await waitFor(() =>
      wrapper.get('[data-testid="model-value"]').text().includes('# Paste heading'),
    )
    expect(wrapper.get('[data-testid="model-value"]').text()).toContain('# Paste heading')
  })

  it('shows asset actions for the selected richtext image', async () => {
    const wrapper = mount(Editor, {
      attachTo: document.body,
      props: {
        modelValue: '',
      },
      global: {
        stubs: {
          Button: ButtonStub,
          DebugPanel: true,
          Icon: true,
          RichTextToolbar: true,
          Textarea: TextareaStub,
        },
      },
    })
    await flushPromises()

    const vm = wrapper.vm as InstanceType<typeof Editor>
    vm.insertImageAsset({
      filename: 'hero.png',
      height: 720,
      id: 'asset_123',
      url: '/hero.png',
      width: 1280,
    })
    await flushPromises()

    const editor = vm.editor
    expect(editor).toBeTruthy()
    editor?.commands.setNodeSelection(0)
    await flushPromises()
    await nextTick()

    const buttons = wrapper.findAll('.ginko-richtext-editor__asset-overlay-button')
    expect(buttons).toHaveLength(2)

    await buttons[0]!.trigger('click')
    expect(wrapper.emitted('request-image')).toBeTruthy()

    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('request-image-metadata')).toEqual([['asset_123']])
  })

  it('renders CMS asset ids in markdown images through the asset provider', async () => {
    const wrapper = mount(Editor, {
      attachTo: document.body,
      props: {
        assetProvider: {
          buildUrl(asset: { id?: string; url?: string }) {
            return asset.id === 'asset_123' ? 'https://assets.example/hero.png' : asset.url || ''
          },
          parseUrl(url: string) {
            return { url }
          },
        },
        modelValue: '![Hero image](asset_123)',
      },
      global: {
        stubs: {
          Button: ButtonStub,
          DebugPanel: true,
          Icon: true,
          RichTextToolbar: true,
          Textarea: TextareaStub,
        },
      },
    })
    await flushPromises()

    await waitFor(() => wrapper.find('.ProseMirror img').exists())

    const image = wrapper.get('.ProseMirror img')
    expect(image.attributes('src')).toBe('https://assets.example/hero.png')
    expect(image.attributes('alt')).toBe('Hero image')
  })

  it('serializes the visual selection as markdown on copy', async () => {
    const wrapper = mountHost()
    await flushPromises()

    await wrapper.get('button:nth-of-type(2)').trigger('click')
    await wrapper.get('textarea').setValue('# Copy heading\n\nCopy body\n')
    await wrapper.get('button:nth-of-type(1)').trigger('click')
    await flushPromises()

    const editor = getEditor(wrapper)
    editor.commands.selectAll()

    const target = editor.view.dom
    const clipboard = new MockDataTransfer()
    const copy = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(copy, 'clipboardData', { value: clipboard })

    target.dispatchEvent(copy)

    expect(clipboard.getData('text/markdown')).toContain('# Copy heading')
    expect(clipboard.getData('text/markdown')).toContain('Copy body')
    expect(clipboard.getData('text/plain')).toContain('# Copy heading')
  })
})
