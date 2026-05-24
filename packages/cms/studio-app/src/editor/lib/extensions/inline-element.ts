import { mergeAttributes, Node } from '@tiptap/core'

import type { JsonRecord } from '../../types'
import { textInputRule } from '../input-rules'

export interface InlineElementOptions {
  HTMLAttributes: JsonRecord
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    InlineElement: {
      setInlineElement: (tag: string) => ReturnType
    }
  }
}

const INLINE_ELEMENT_INPUT_RULE_FIND = /(?:^|\s)(:([a-z-]+)(?:\[([^\]]*)\])?(?:\{[^}]*\})?)\s/i

export const InlineElement = Node.create<InlineElementOptions>({
  name: 'inline-element',
  group: 'inline',
  content: 'text*',
  inline: true,
  priority: 1000,

  addAttributes() {
    return {
      props: {
        default: {},
        parseHTML(element) {
          return JSON.parse(element.getAttribute('props') || '{}')
        },
      },
      tag: {
        default: 'div',
      },
    }
  },

  addCommands() {
    return {
      setInlineElement:
        (tag: string) =>
        ({ chain, state }) =>
          chain()
            .insertContentAt(state.selection.from, {
              attrs: { tag },
              type: 'inline-element',
            })
            .run(),
    }
  },

  addInputRules() {
    return [
      textInputRule({
        find: INLINE_ELEMENT_INPUT_RULE_FIND,
        getAttributes: (match: string[]) => ({ tag: match[2] }),
        getText: (match: string[]) => match[3] ?? '',
        type: this.type,
      }),
    ]
  },

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-element"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const mergedAttributes = mergeAttributes(HTMLAttributes, { 'data-type': 'inline-element' })
    mergedAttributes.props = JSON.stringify(mergedAttributes.props || {})
    return ['span', mergedAttributes, 0]
  },
})
