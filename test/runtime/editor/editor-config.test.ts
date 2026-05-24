import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { createEditorExtensions } from '../../../packages/cms/studio-app/src/editor/lib/config/editorConfig'
import { applyMarkdownToEditor } from '../../../packages/cms/studio-app/src/editor/lib/conversionPipeline'

describe('createEditorExtensions', () => {
  it('supports custom MDC node types in the mounted schema', async () => {
    const editor = new Editor({
      content: { content: [{ type: 'paragraph' }], type: 'doc' },
      extensions: createEditorExtensions({
        codeBlockTheme: 'github-dark',
        enableDebug: false,
        enableFiles: true,
        enableVideo: true,
        fileOutput: 'mdc',
        imageOutput: 'mdc',
        showMarkdownMarkers: false,
        videoOutput: 'mdc',
      }),
    })

    const input = [
      'Intro',
      '',
      '![Diagram](/images/diagram.png){data-file-id="img_1"}',
      '',
      '::hero',
      'Default slot',
      '::',
      '',
      '{{ title || Untitled }}',
    ].join('\n')

    const result = await applyMarkdownToEditor(editor, input)
    editor.commands.setFile({
      filename: 'spec.pdf',
      id: 'file_1',
      src: '/docs/spec.pdf',
      title: 'Spec sheet',
    })

    expect(result.ok).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: expect.arrayContaining([
        expect.objectContaining({ type: 'paragraph' }),
        expect.objectContaining({ type: 'image' }),
        expect.objectContaining({ type: 'file' }),
        expect.objectContaining({ type: 'element' }),
        expect.objectContaining({
          content: expect.arrayContaining([expect.objectContaining({ type: 'binding' })]),
          type: 'paragraph',
        }),
      ]),
      type: 'doc',
    })

    editor.destroy()
  })

  it('includes the ProseMirror debug extension only when explicitly enabled', () => {
    const withoutDebug = createEditorExtensions({
      codeBlockTheme: 'github-dark',
      enableDebug: false,
      enableFiles: true,
      enableVideo: true,
      fileOutput: 'mdc',
      imageOutput: 'mdc',
      showMarkdownMarkers: false,
      videoOutput: 'mdc',
    })

    const withDebug = createEditorExtensions({
      codeBlockTheme: 'github-dark',
      enableDebug: true,
      enableFiles: true,
      enableVideo: true,
      fileOutput: 'mdc',
      imageOutput: 'mdc',
      showMarkdownMarkers: false,
      videoOutput: 'mdc',
    })

    expect(withoutDebug.some((extension) => extension.name === 'editorDebug')).toBe(false)
    expect(withDebug.some((extension) => extension.name === 'editorDebug')).toBe(true)
  })
})
