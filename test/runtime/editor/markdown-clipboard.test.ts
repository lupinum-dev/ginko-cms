import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { createEditorExtensions } from '../../../packages/cms/studio-app/src/editor/lib/config/editorConfig'
import {
  extractMarkdownFromClipboard,
  isProbablyMarkdown,
  serializeSliceToMarkdown,
} from '../../../packages/cms/studio-app/src/editor/lib/extensions/markdown-clipboard'

describe('markdown clipboard serialization', () => {
  it('serializes a full document selection to markdown', () => {
    const editor = new Editor({
      content: {
        content: [
          {
            content: [{ text: 'Hello world', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
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

    const slice = editor.state.doc.slice(0, editor.state.doc.content.size)
    expect(serializeSliceToMarkdown(slice)).toBe('Hello world\n')

    editor.destroy()
  })

  it('wraps inline-only selections into a paragraph before conversion', () => {
    const editor = new Editor({
      content: {
        content: [
          {
            content: [{ text: 'Hello world', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
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

    const slice = editor.state.doc.slice(1, 6)
    expect(serializeSliceToMarkdown(slice)).toBe('Hello\n')

    editor.destroy()
  })

  it('preserves block line structure for headings, blockquotes, and lists', () => {
    const editor = new Editor({
      content: {
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'adas' }] },
          { type: 'paragraph' },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'asda' }] },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: 'asdasd' }] },
          {
            type: 'blockquote',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'asdasd' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'asd' }] },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'asdasd' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'asdasd' }] }],
              },
            ],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'asd' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        ],
        type: 'doc',
      },
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

    const slice = editor.state.doc.slice(0, editor.state.doc.content.size)
    expect(serializeSliceToMarkdown(slice)).toContain('# adas')
    expect(serializeSliceToMarkdown(slice)).toContain('\n## asda')
    expect(serializeSliceToMarkdown(slice)).toContain('\n> asdasd')
    expect(serializeSliceToMarkdown(slice)).toContain('\n* asdasd')
    expect(serializeSliceToMarkdown(slice)).toContain('\n\na\n')

    editor.destroy()
  })

  it('detects markdown-oriented clipboard payloads', () => {
    expect(isProbablyMarkdown('# Heading\n\nBody')).toBe(true)
    expect(isProbablyMarkdown('> Quote')).toBe(true)
    expect(isProbablyMarkdown('Just plain prose')).toBe(false)

    const markdownEvent = {
      clipboardData: {
        getData: (type: string) => (type === 'text/markdown' ? '# Heading\n' : ''),
      },
    } as ClipboardEvent

    const plainTextEvent = {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? '# Heading\n' : ''),
      },
    } as ClipboardEvent

    expect(extractMarkdownFromClipboard(markdownEvent)).toBe('# Heading')
    expect(extractMarkdownFromClipboard(plainTextEvent)).toBe('# Heading\n')
  })
})
