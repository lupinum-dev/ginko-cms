import { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/vue-3'
import { describe, expect, it, vi } from 'vitest'

import { createEditorExtensions } from '../../../packages/cms/studio-app/src/editor/lib/config/editorConfig'
import {
  applyMarkdownToEditor,
  applyTiptapDocToEditor,
  convertMarkdownToTiptapDoc,
  convertTiptapDocToMarkdown,
} from '../../../packages/cms/studio-app/src/editor/lib/conversionPipeline'

function hasBlockInsideParagraph(node: JSONContent): boolean {
  if (node.type === 'paragraph') {
    return (node.content || []).some((child) => {
      return (
        child.type !== 'text' &&
        child.type !== 'hardBreak' &&
        child.type !== 'binding' &&
        child.type !== 'inline-element' &&
        child.type !== 'span-style' &&
        child.type !== 'emoji'
      )
    })
  }
  return (node.content || []).some((child) => hasBlockInsideParagraph(child))
}

describe('editor conversionPipeline', () => {
  it('fails conversion for invalid tiptap docs before serialization', async () => {
    const invalidDoc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { props: { src: '/broken.png' } } }],
        },
      ],
    }

    const result = await convertTiptapDocToMarkdown(invalidDoc)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.code === 'block_inside_paragraph')).toBe(true)
    expect(result.traceId).toBeTruthy()
  })

  it('normalizes markdown into a schema-valid TipTap doc before applying it', async () => {
    const markdown = 'Before ![Icon](/content/blog/0/icon.png) after'

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

    const result = await applyMarkdownToEditor(editor, markdown)
    expect(result.ok).toBe(true)
    expect(hasBlockInsideParagraph(editor.getJSON())).toBe(false)
    expect(editor.getText()).toContain('Before')

    editor.destroy()
  })

  it('returns typed failure when setContent throws', () => {
    const editor = {
      commands: {
        setContent: vi.fn(() => {
          throw new RangeError('Invalid content for node paragraph')
        }),
      },
    } as unknown as Editor

    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    }

    const result = applyTiptapDocToEditor(editor, doc)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.code === 'set_content_failed')).toBe(true)
  })

  it('converts markdown to tiptap with deterministic trace metadata', async () => {
    const result = await convertMarkdownToTiptapDoc('Paragraph')
    expect(result.traceId).toMatch(/^conv_/)
    expect(Array.isArray(result.timeline)).toBe(true)
    expect(result.timeline.length).toBeGreaterThan(0)
  })
})
