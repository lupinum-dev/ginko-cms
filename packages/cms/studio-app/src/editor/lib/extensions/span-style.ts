import { mergeAttributes, Node } from '@tiptap/core'
import type { NodeType, Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { JSONContent } from '@tiptap/vue-3'

export interface SpanStyleAttrs {
  class?: null | string
  style?: null | string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    SpanStyle: {
      setSpanStyle: (attributes?: SpanStyleAttrs) => ReturnType
      unsetSpanStyle: () => ReturnType
      updateSpanStyle: (attributes?: SpanStyleAttrs) => ReturnType
    }
  }
}

function sanitizeAttributes(attributes?: SpanStyleAttrs) {
  const cleaned: Record<string, string> = {}
  if (attributes?.style?.trim()) cleaned.style = attributes.style.trim()
  if (attributes?.class?.trim()) cleaned.class = attributes.class.trim()
  return cleaned
}

function unwrapCurrentSpan(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  type?: NodeType,
) {
  const { from } = state.selection
  let found: null | { node: ProseMirrorNode; pos: number } = null
  state.doc.nodesBetween(from, from, (node: ProseMirrorNode, pos: number) => {
    if (node.type === type) {
      found = { node, pos }
      return false
    }
    return undefined
  })

  if (!found) return false

  const target = found as { node: ProseMirrorNode; pos: number }
  const tr = state.tr.replaceWith(
    target.pos,
    target.pos + target.node.nodeSize,
    target.node.content,
  )
  dispatch?.(tr)
  return true
}

export const SpanStyle = Node.create<SpanStyleAttrs>({
  name: 'span-style',
  inline: true,
  group: 'inline',
  content: 'text*',

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
      },
    }
  },

  addCommands() {
    return {
      setSpanStyle:
        (attributes) =>
        ({ chain, state }) => {
          const cleaned = sanitizeAttributes(attributes)
          const { empty, from, to } = state.selection

          if (empty) {
            return chain()
              .insertContent({
                attrs: cleaned,
                content: [{ text: '', type: 'text' }],
                type: this.name,
              })
              .focus()
              .run()
          }

          const slice = state.doc.slice(from, to)
          const content = slice.content.toJSON() as JSONContent[]

          return chain()
            .insertContentAt(
              { from, to },
              {
                attrs: cleaned,
                content,
                type: this.name,
              },
            )
            .focus()
            .run()
        },
      unsetSpanStyle:
        () =>
        ({ dispatch, state }) =>
          unwrapCurrentSpan(state, dispatch, this.type),
      updateSpanStyle:
        (attributes) =>
        ({ chain }) =>
          chain().updateAttributes(this.name, sanitizeAttributes(attributes)).run(),
    }
  },

  parseHTML() {
    return [{ tag: 'span:not([data-type])' }]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = { ...HTMLAttributes }
    if (!attrs.style) delete attrs.style
    if (!attrs.class) delete attrs.class
    return ['span', mergeAttributes(attrs), 0]
  },
})
