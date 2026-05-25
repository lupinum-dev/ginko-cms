import type { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/vue-3'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { useContentSync } from '../../../packages/cms/studio-app/src/editor/model/useContentSync'

function createMockEditor(getJson: () => JSONContent) {
  return {
    commands: {
      setContent: vi.fn(),
    },
    getJSON: vi.fn(() => getJson()),
    getText: vi.fn(() => 'editor text'),
    setEditable: vi.fn(),
  } as unknown as Editor
}

describe('editor useContentSync conversion guard', () => {
  it('keeps last good markdown when conversion fails', async () => {
    const invalidDoc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { props: { src: '/broken.png' } } }],
        },
      ],
    }

    const editor = ref(createMockEditor(() => invalidDoc))
    const emit = vi.fn()
    const onConversionError = vi.fn()

    const sync = useContentSync({
      disabled: computed(() => false),
      editor,
      emit,
      modelValue: computed(() => ''),
      syncDebounceMs: 0,
      outputOptions: computed(() => ({
        enableDebug: false,
        fileOutput: 'mdc',
        imageOutput: 'mdc',
        videoOutput: 'mdc',
      })),
      syncRawContent: vi.fn(),
      onConversionError,
    })

    await sync.handleEditorUpdate(editor.value, true)

    expect(emit).not.toHaveBeenCalled()
    expect(onConversionError).toHaveBeenCalledTimes(1)
    expect(sync.conversionHealth.value.status).toBe('failed')
    expect(sync.lastStableValue.value).toBe('')
  })

  it('emits conversion recovery after a subsequent successful update', async () => {
    let currentDoc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { props: { src: '/broken.png' } } }],
        },
      ],
    }

    const editor = ref(createMockEditor(() => currentDoc))
    const emit = vi.fn()
    const onConversionError = vi.fn()
    const onConversionRecovered = vi.fn()

    const sync = useContentSync({
      disabled: computed(() => false),
      editor,
      emit,
      modelValue: computed(() => ''),
      syncDebounceMs: 0,
      outputOptions: computed(() => ({
        enableDebug: false,
        fileOutput: 'mdc',
        imageOutput: 'mdc',
        videoOutput: 'mdc',
      })),
      syncRawContent: vi.fn(),
      onConversionError,
      onConversionRecovered,
    })

    await sync.handleEditorUpdate(editor.value, true)
    expect(onConversionError).toHaveBeenCalledTimes(1)
    expect(sync.conversionHealth.value.status).toBe('failed')

    currentDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Recovered content' }],
        },
      ],
    }

    await sync.handleEditorUpdate(editor.value, true)

    expect(emit).toHaveBeenCalledTimes(1)
    expect(onConversionRecovered).toHaveBeenCalledTimes(1)
    expect(sync.conversionHealth.value.status).toBe('ok')
  })

  it('treats an empty markdown result as a successful conversion', async () => {
    const emptyDoc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
        },
      ],
    }

    const editor = ref(createMockEditor(() => emptyDoc))
    editor.value.getText = vi.fn(() => '')

    const emit = vi.fn()
    const onConversionError = vi.fn()

    const sync = useContentSync({
      disabled: computed(() => false),
      editor,
      emit,
      modelValue: computed(() => 'a\n'),
      syncDebounceMs: 0,
      outputOptions: computed(() => ({
        enableDebug: false,
        fileOutput: 'mdc',
        imageOutput: 'mdc',
        videoOutput: 'mdc',
      })),
      syncRawContent: vi.fn(),
      onConversionError,
    })

    await sync.handleEditorUpdate(editor.value, true)

    expect(emit).toHaveBeenCalledWith('')
    expect(onConversionError).not.toHaveBeenCalled()
    expect(sync.conversionHealth.value.status).toBe('ok')
    expect(sync.lastStableValue.value).toBe('')
  })

  it('debounces repeated editor updates and flushes the latest state once', async () => {
    vi.useFakeTimers()

    let currentDoc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'first' }],
        },
      ],
    }

    const editor = ref(createMockEditor(() => currentDoc))
    const emit = vi.fn()

    const sync = useContentSync({
      disabled: computed(() => false),
      editor,
      emit,
      modelValue: computed(() => ''),
      syncDebounceMs: 120,
      outputOptions: computed(() => ({
        enableDebug: false,
        fileOutput: 'mdc',
        imageOutput: 'mdc',
        videoOutput: 'mdc',
      })),
      syncRawContent: vi.fn(),
    })

    void sync.handleEditorUpdate(editor.value, true)
    currentDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'second' }],
        },
      ],
    }
    void sync.handleEditorUpdate(editor.value, true)

    await vi.advanceTimersByTimeAsync(119)
    expect(emit).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith('second\n')

    vi.useRealTimers()
  })
})
