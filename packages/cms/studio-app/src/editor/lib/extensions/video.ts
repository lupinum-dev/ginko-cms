import { mergeAttributes, Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    Video: {
      addVideo: () => ReturnType
      setVideo: (attrs: {
        height?: number | string
        src: string
        title?: string
        width?: number | string
      }) => ReturnType
    }
  }
}

export const Video = Node.create({
  name: 'video',
  group: 'block',
  inline: false,
  selectable: false,
  priority: 1000,

  addAttributes() {
    return {
      alt: {
        default: null,
      },
      height: {
        default: null,
      },
      key: {
        default: '',
      },
      props: {
        default: null,
        parseHTML(element) {
          return JSON.parse(element.getAttribute('props') || '{}')
        },
      },
      src: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: null,
      },
    }
  },

  addCommands() {
    return {
      addVideo:
        () =>
        ({ chain, state }) => {
          const { selection } = state
          const range = { from: selection.from, to: selection.to }
          const key = `${Date.now() % 1e6}-${Number.parseInt(String(Math.random() * 1e3))}`

          return chain()
            .insertContentAt(range, {
              attrs: { key, tag: 'video' },
              type: this.name,
            })
            .run()
        },
      setVideo:
        (attrs) =>
        ({ chain, state }) => {
          const { selection } = state
          const range = { from: selection.from, to: selection.to }
          const key = `${Date.now() % 1e6}-${Number.parseInt(String(Math.random() * 1e3))}`

          return chain()
            .insertContentAt(range, {
              attrs: {
                ...attrs,
                key,
                props: attrs,
                tag: 'video',
              },
              type: this.name,
            })
            .run()
        },
    }
  },

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="video"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'video' }),
    ]
  },
})
