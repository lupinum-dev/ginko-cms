import type { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useRawMode } from '../../../packages/cms/studio-app/src/editor/model/useRawMode'

describe('editor useRawMode conversion guard', () => {
  it('keeps editor in raw mode when visual conversion fails', async () => {
    const setContent = vi.fn(() => {
      throw new RangeError('Invalid content for node paragraph')
    })

    const editor = ref({
      commands: { setContent },
    } as unknown as Editor)

    const onConversionError = vi.fn()

    const rawMode = useRawMode({
      editor,
      emit: vi.fn(),
      isUpdating: ref(false),
      lastEmittedValue: ref(''),
      lastStableValue: ref(''),
      lastTiptapJson: ref(null),
      modelValue: ref(''),
      onConversionError,
    })

    rawMode.viewMode.value = 'raw'
    rawMode.onRawChange('![broken](/content/blog/0/icon.png)')

    await rawMode.switchToVisual()

    expect(onConversionError).toHaveBeenCalledTimes(1)
    expect(rawMode.viewMode.value).toBe('raw')
    expect(rawMode.conversionHealth.value.status).toBe('failed')
  })

  it('recovers to visual mode after a successful retry', async () => {
    const setContent = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new RangeError('Invalid content for node paragraph')
      })
      .mockImplementation(() => {})

    const editor = ref({
      commands: { setContent },
    } as unknown as Editor)

    const onConversionRecovered = vi.fn()
    const onConversionError = vi.fn()

    const rawMode = useRawMode({
      editor,
      emit: vi.fn(),
      isUpdating: ref(false),
      lastEmittedValue: ref(''),
      lastStableValue: ref(''),
      lastTiptapJson: ref(null),
      modelValue: ref(''),
      onConversionError,
      onConversionRecovered,
    })

    rawMode.viewMode.value = 'raw'
    rawMode.onRawChange('![broken](/content/blog/0/icon.png)')

    await rawMode.switchToVisual()
    expect(rawMode.viewMode.value).toBe('raw')

    await rawMode.switchToVisual()

    expect(onConversionRecovered).toHaveBeenCalledTimes(1)
    expect(rawMode.viewMode.value).toBe('visual')
    expect(rawMode.conversionHealth.value.status).toBe('ok')
  })
})
