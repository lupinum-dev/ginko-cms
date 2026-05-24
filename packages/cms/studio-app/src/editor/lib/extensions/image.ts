import type { CommandProps } from '@tiptap/core'
import { mergeAttributes, Node } from '@tiptap/core'

import type { JsonRecord } from '../../types'
import { sanitizeImageUrl } from '../props'

export interface ImageOptions {
  allowBase64: boolean
  HTMLAttributes: JsonRecord
  inline: boolean
  resolveSrc?: (props: JsonRecord) => string | null | undefined
}

export interface SetImageOptions {
  alt?: string
  class?: string
  cropHeight?: number | string
  cropWidth?: number | string
  cropX?: number | string
  cropY?: number | string
  filename?: string
  fit?: string
  focalX?: number | string
  focalY?: number | string
  format?: string
  height?: number | string
  id?: string
  quality?: number | string
  src?: string
  title?: string
  width?: number | string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    Image: {
      setImage: (options: SetImageOptions) => ReturnType
    }
  }
}

export const Image = Node.create<ImageOptions>({
  name: 'image',
  draggable: true,

  addAttributes() {
    return {
      props: {
        default: {},
        parseHTML: (element) => ({
          alt: element.getAttribute('alt') || '',
          class: element.getAttribute('class') || '',
          filename: element.getAttribute('data-filename') || '',
          height: element.getAttribute('height') || '',
          id: element.getAttribute('data-file-id') || '',
          src: element.getAttribute('src') || '',
          title: element.getAttribute('title') || '',
          width: element.getAttribute('width') || '',
        }),
      },
    }
  },

  addCommands() {
    return {
      setImage:
        (options: SetImageOptions) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            attrs: { props: options },
            type: this.name,
          }),
    }
  },

  addOptions() {
    return {
      allowBase64: false,
      HTMLAttributes: {},
      inline: false,
      resolveSrc: undefined,
    }
  },

  group() {
    return this.options.inline ? 'inline' : 'block'
  },

  inline() {
    return this.options.inline
  },

  parseHTML() {
    return [
      {
        tag: this.options.allowBase64 ? 'img[src]' : 'img[src]:not([src^="data:"])',
      },
    ]
  },

  renderHTML({ node }) {
    const props = node.attrs.props || {}
    const attrs: Record<string, string> = {}

    const rawSrc = String(props.src || '')
    const resolvedSrc = this.options.resolveSrc?.(props)
    const displaySrc = sanitizeImageUrl(rawSrc) ?? sanitizeImageUrl(String(resolvedSrc || ''))
    if (displaySrc) {
      attrs.src = displaySrc
    }
    if (props.alt) {
      attrs.alt = String(props.alt)
    }
    if (props.title) {
      attrs.title = String(props.title)
    }
    if (props.width) {
      attrs.width = String(props.width)
    }
    if (props.height) {
      attrs.height = String(props.height)
    }
    if (props.class) {
      attrs.class = String(props.class)
    }
    if (props.id) {
      attrs['data-file-id'] = String(props.id)
    }
    if (props.filename) {
      attrs['data-filename'] = String(props.filename)
    }

    return ['img', mergeAttributes(this.options.HTMLAttributes, attrs)]
  },
})
