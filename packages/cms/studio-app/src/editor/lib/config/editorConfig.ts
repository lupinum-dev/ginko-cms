import type { Editor } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import { Table as TiptapTable } from '@tiptap/extension-table'
import { TableCell as TiptapTableCell } from '@tiptap/extension-table-cell'
import { TableHeader as TiptapTableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import StarterKit from '@tiptap/starter-kit'
import { ref } from 'vue'

import type { AssetProvider, JsonRecord } from '../../types'
import { editorDebug } from '../debug'
import {
  Binding,
  CodeBlock,
  EditorDebug,
  Element,
  File,
  Heading,
  Image,
  InlineElement,
  MarkdownClipboard,
  Slot,
  SpanStyle,
  Video,
} from '../extensions'

const TableCell = TiptapTableCell.extend({
  content: 'paragraph+',
})

const TableHeader = TiptapTableHeader.extend({
  content: 'paragraph+',
})

export interface CreateEditorExtensionsOptions {
  assetProvider?: AssetProvider
  codeBlockTheme: string
  enableDebug: boolean
  enableFiles: boolean
  enableVideo: boolean
  fileOutput: 'markdown' | 'mdc'
  imageOutput: 'markdown' | 'mdc'
  placeholder?: string
  showMarkdownMarkers: boolean
  videoOutput: 'html' | 'mdc'
}

export function createEditorExtensions(options: CreateEditorExtensionsOptions) {
  const {
    codeBlockTheme,
    enableDebug,
    enableFiles,
    enableVideo,
    placeholder,
    showMarkdownMarkers,
  } = options

  return [
    StarterKit.configure({
      codeBlock: false,
      heading: false,
      link: {
        HTMLAttributes: {
          target: null,
        },
        openOnClick: false,
      },
    }),
    Heading.configure({
      levels: [1, 2, 3, 4, 5, 6],
      showMarkers: showMarkdownMarkers,
    }),
    TiptapTable.configure({
      renderWrapper: true,
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      emptyEditorClass: 'mdc-editor-empty',
      placeholder: placeholder || 'Start writing...',
    }),
    MarkdownClipboard.configure({
      enableDebug,
      enabled: true,
      fileOutput: options.fileOutput,
      imageOutput: options.imageOutput,
      videoOutput: options.videoOutput,
    }),
    ...(enableDebug ? [EditorDebug] : []),
    Element,
    Slot,
    InlineElement,
    CodeBlock.configure({
      theme: codeBlockTheme,
    }),
    Image.configure({
      resolveSrc: (props: JsonRecord) => {
        const src = typeof props.src === 'string' ? props.src : undefined
        const id = typeof props.id === 'string' ? props.id : undefined
        return options.assetProvider?.buildUrl({
          id: id ?? src,
          url: src,
        })
      },
    }),
    ...(enableVideo ? [Video] : []),
    ...(enableFiles ? [File] : []),
    Binding,
    SpanStyle,
  ]
}

const isNormalizingTable = ref(false)

export function isCurrentlyNormalizingTable(): boolean {
  return isNormalizingTable.value
}

export function normalizeTableCells(editorInstance: Editor | undefined): boolean {
  if (!editorInstance) {
    return false
  }

  const { state } = editorInstance
  const { schema } = state
  const cellTypes = new Set(['tableCell', 'tableHeader'])
  let hasChanges = false

  const tr = state.tr
  state.doc.descendants((node, pos) => {
    if (!cellTypes.has(node.type.name)) {
      return
    }

    let hasInlineChild = false
    node.content.forEach((child) => {
      if (child.isInline) {
        hasInlineChild = true
      }
    })

    if (!hasInlineChild) {
      return
    }

    const paragraphType = schema.nodes.paragraph
    if (!paragraphType) {
      return
    }

    const paragraph = paragraphType.create(null, node.content)
    const updatedCell = node.type.create(node.attrs, paragraph, node.marks)
    tr.replaceWith(pos, pos + node.nodeSize, updatedCell)
    hasChanges = true
  })

  if (hasChanges) {
    isNormalizingTable.value = true
    editorInstance.view.dispatch(tr)
    isNormalizingTable.value = false
    editorDebug.log('Normalized table cells in editor')
  }

  return hasChanges
}
