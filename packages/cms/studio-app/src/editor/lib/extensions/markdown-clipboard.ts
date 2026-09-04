import { Extension, type Editor, type JSONContent } from '@tiptap/core'
import type { Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'

import { convertMarkdownToTiptapDoc } from '../conversionPipeline'
import { editorDebug } from '../debug'
import { stringifyMdcSync } from '../markdown'
import type { TiptapToMDCOptions } from '../tiptapToMdc'
import { tiptapToMDCSync } from '../tiptapToMdc'

export interface MarkdownClipboardOptions extends TiptapToMDCOptions {
  enabled: boolean
}

const markdownClipboardPluginKey = new PluginKey('markdownClipboard')

export const MarkdownClipboard = Extension.create<MarkdownClipboardOptions>({
  name: 'markdownClipboard',

  addOptions() {
    return {
      enableDebug: false,
      enabled: true,
      fileOutput: 'mdc',
      imageOutput: 'mdc',
      videoOutput: 'mdc',
    }
  },

  addProseMirrorPlugins() {
    if (!this.options.enabled) {
      return []
    }

    return [
      new Plugin({
        key: markdownClipboardPluginKey,
        props: {
          clipboardTextSerializer: (slice: Slice) => {
            return serializeSliceToMarkdown(slice, this.options)
          },
          handleDOMEvents: {
            copy: (view, event) => {
              return writeMarkdownClipboard(view.state.selection.content(), event, this.options)
            },
            paste: (view, event) => {
              return handleMarkdownPaste(this.editor, event)
            },
          },
        },
      }),
    ]
  },
})

export function sliceToDocument(slice: Slice): JSONContent | null {
  if (slice.content.childCount === 0) {
    return {
      content: [{ type: 'paragraph' }],
      type: 'doc',
    }
  }

  const content: JSONContent[] = []
  let inlineBuffer: JSONContent[] = []

  slice.content.forEach((node) => {
    if (node.isInline) {
      inlineBuffer.push(node.toJSON() as JSONContent)
      return
    }

    if (inlineBuffer.length > 0) {
      content.push({
        content: inlineBuffer,
        type: 'paragraph',
      })
      inlineBuffer = []
    }

    content.push(node.toJSON() as JSONContent)
  })

  if (inlineBuffer.length > 0) {
    content.push({
      content: inlineBuffer,
      type: 'paragraph',
    })
  }

  return {
    content,
    type: 'doc',
  }
}

export function serializeSliceToMarkdown(slice: Slice, options: TiptapToMDCOptions = {}): string {
  const doc = sliceToDocument(slice)
  if (!doc) {
    return ''
  }

  try {
    const ast = tiptapToMDCSync(doc, options)
    const markdown = stringifyMdcSync(ast, {
      videoOutput: options.videoOutput,
    })
    editorDebug.log('Markdown clipboard serialization succeeded', {
      length: markdown.length,
    })
    return markdown
  } catch (error) {
    editorDebug.warn('Markdown clipboard serialization failed', {
      error,
    })
    return slice.content.textBetween(0, slice.content.size, '\n\n')
  }
}

function writeMarkdownClipboard(slice: Slice, event: Event, options: TiptapToMDCOptions) {
  const clipboardEvent = event as ClipboardEvent
  if (!clipboardEvent.clipboardData) {
    return false
  }

  const markdown = serializeSliceToMarkdown(slice, options)
  clipboardEvent.clipboardData.setData('text/plain', markdown)
  clipboardEvent.clipboardData.setData('text/markdown', markdown)
  clipboardEvent.preventDefault()

  editorDebug.log('Markdown clipboard payload written directly', {
    length: markdown.length,
  })

  return true
}

function handleMarkdownPaste(editor: Editor, event: Event) {
  const clipboardEvent = event as ClipboardEvent
  const markdown = extractMarkdownFromClipboard(clipboardEvent)
  if (!markdown) {
    return false
  }

  clipboardEvent.preventDefault()
  void applyMarkdownPaste(editor, markdown, clipboardEvent)
  return true
}

export function extractMarkdownFromClipboard(event: ClipboardEvent): null | string {
  const markdown = event.clipboardData?.getData('text/markdown')?.trim()
  if (markdown) {
    return markdown
  }

  // Rich HTML (Google Docs, Word, web pages) carries more structure than the
  // plain-text flavor, so defer to ProseMirror's native HTML paste instead of
  // re-parsing the flattened plain text as markdown.
  const html = event.clipboardData?.getData('text/html') ?? ''
  if (hasSemanticHtml(html)) {
    return null
  }

  const plainText = event.clipboardData?.getData('text/plain') ?? ''
  return isProbablyMarkdown(plainText) ? plainText : null
}

export function hasSemanticHtml(html: string): boolean {
  return /<(?:h[1-6]|ul|ol|li|strong|em|blockquote|table|img|pre|code|[abi])[\s/>]/i.test(html)
}

export function isProbablyMarkdown(value: string): boolean {
  const text = value.trim()
  if (!text) {
    return false
  }

  return (
    /(?:^|\n)(?:#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```|~~~)/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /!\[[^\]]*\]\([^)]+\)/.test(text) ||
    /(?:^|\n)\|.*\|/.test(text)
  )
}

function detectClipboardSource(event: ClipboardEvent) {
  return event.clipboardData?.types?.includes('text/markdown') ? 'text/markdown' : 'text/plain'
}

async function applyMarkdownPaste(editor: Editor, markdown: string, event: ClipboardEvent) {
  try {
    const result = await convertMarkdownToTiptapDoc(markdown)
    if (!result.ok || !result.value) {
      editorDebug.warn('Markdown clipboard paste parse failed', {
        issues: result.issues,
      })
      return
    }

    const selection = editor.state.selection
    const content = result.value.content ?? [{ type: 'paragraph' }]
    editor
      .chain()
      .focus()
      .insertContentAt({ from: selection.from, to: selection.to }, content)
      .run()
    editorDebug.log('Markdown clipboard paste applied', {
      length: markdown.length,
      nodeCount: content.length,
      source: detectClipboardSource(event),
    })
  } catch (error) {
    editorDebug.warn('Markdown clipboard paste failed unexpectedly', {
      error,
      length: markdown.length,
    })
  }
}
