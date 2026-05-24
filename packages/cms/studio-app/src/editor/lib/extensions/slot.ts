import { mergeAttributes, Node } from '@tiptap/core'

import type { JsonRecord } from '../../types'

export interface SlotOptions {
  HTMLAttributes: JsonRecord
  nestable: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    Slot: {
      handleSlotBackspace: () => ReturnType
    }
  }
}

export const Slot = Node.create<SlotOptions>({
  name: 'slot',
  content: 'block+',
  group: 'block',
  inline: false,
  isolating: true,
  selectable: false,
  priority: 1000,

  addAttributes() {
    return {
      name: {
        default: 'default',
      },
      props: {
        default: {},
        parseHTML(element) {
          return JSON.parse(element.getAttribute('props') || '{}')
        },
      },
    }
  },

  addCommands() {
    return {
      handleSlotBackspace: () => () => false,
    }
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => editor.commands.handleSlotBackspace(),
    }
  },

  addOptions() {
    return {
      HTMLAttributes: {},
      nestable: false,
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="Slot"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'Slot' }), 0]
  },
})
