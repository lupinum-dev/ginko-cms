import type { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { ConversionResult } from '../../../packages/cms/studio-app/src/editor/lib/conversionPipeline'
import { useRawMode } from '../../../packages/cms/studio-app/src/editor/model/useRawMode'

const applyMarkdownToEditor = vi.hoisted(() => vi.fn())

vi.mock('../../../packages/cms/studio-app/src/editor/lib/conversionPipeline', () => ({
  applyMarkdownToEditor,
}))

function failedApply(traceId: string): ConversionResult<never> {
  return {
    fallbackUsed: false,
    issues: [
      {
        code: 'set_content_failed',
        message: 'Failed to apply TipTap JSON to editor',
        phase: 'set_content',
        severity: 'error',
      },
    ],
    ok: false,
    timeline: [],
    traceId,
  }
}

function successfulApply(traceId: string): ConversionResult<Record<string, unknown>> {
  return {
    fallbackUsed: false,
    issues: [],
    ok: true,
    timeline: [],
    traceId,
    value: { content: [{ type: 'paragraph' }], type: 'doc' },
  }
}

describe('editor useRawMode conversion guard', () => {
  it('keeps editor in raw mode when visual conversion fails', async () => {
    applyMarkdownToEditor.mockReset()
    applyMarkdownToEditor.mockResolvedValue(failedApply('conv_test_fail'))

    const editor = ref({} as unknown as Editor)
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
    applyMarkdownToEditor.mockReset()
    applyMarkdownToEditor
      .mockResolvedValueOnce(failedApply('conv_test_fail'))
      .mockResolvedValue(successfulApply('conv_test_ok'))

    const editor = ref({} as unknown as Editor)
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
