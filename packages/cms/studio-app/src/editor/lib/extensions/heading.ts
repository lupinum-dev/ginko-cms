import type { Editor } from '@tiptap/core'
import TiptapHeading from '@tiptap/extension-heading'
import type { ResolvedPos } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'

const headingDebugPluginKey = new PluginKey('headingDebug')

export interface HeadingOptions {
  levels: number[]
  showMarkers: boolean
}

export const Heading = TiptapHeading.extend<HeadingOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      levels: [1, 2, 3, 4, 5, 6],
      showMarkers: false,
    }
  },

  addStorage() {
    return {
      showMarkers: this.options.showMarkers,
    }
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => handleBackspace(editor),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingDebugPluginKey,
        props: {
          handleKeyDown() {
            return false
          },
        },
      }),
    ]
  },
})

function handleBackspace(editor: Editor): boolean {
  const { state } = editor
  const { selection } = state
  const { $from, empty } = selection

  if ($from.parent.type.name !== 'heading') {
    return false
  }

  const headingText = $from.parent.textContent
  const isAtStart = $from.parentOffset === 0
  const textLength = headingText.length

  if (textLength === 1 && $from.parentOffset === 1 && empty) {
    return handleSingleCharDeletion(editor, state, $from)
  }

  if (textLength === 0 && isAtStart) {
    return handleEmptyHeadingAtStart(editor, state, $from)
  }

  return false
}

function handleSingleCharDeletion(editor: Editor, state: EditorState, $from: ResolvedPos): boolean {
  const headingPos = $from.before($from.depth)
  const headingNode = $from.parent
  const tr = state.tr
  const headingType = state.schema.nodes.heading
  if (!headingType) {
    return false
  }
  const level = headingNode.attrs.level
  const emptyHeading = headingType.create({ level })

  tr.replaceWith(headingPos, headingPos + headingNode.nodeSize, emptyHeading)
  tr.setSelection(TextSelection.near(tr.doc.resolve(headingPos + 1)))

  editor.view.dispatch(tr)
  return true
}

function handleEmptyHeadingAtStart(
  editor: Editor,
  state: EditorState,
  $from: ResolvedPos,
): boolean {
  const headingPos = $from.before($from.depth)
  const headingNode = $from.parent
  const tr = state.tr
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) {
    return false
  }
  const emptyParagraph = paragraphType.create()

  tr.replaceWith(headingPos, headingPos + headingNode.nodeSize, emptyParagraph)
  tr.setSelection(TextSelection.near(tr.doc.resolve(headingPos + 1)))

  editor.view.dispatch(tr)
  return true
}
