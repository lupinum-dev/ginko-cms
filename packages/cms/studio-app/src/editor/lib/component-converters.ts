/**
 * Component converters for MDC to TipTap transformation
 *
 * Handles custom components: binding, file, image, video, template, comment, etc.
 */

import type { JSONContent } from '@tiptap/vue-3'

import type { JsonRecord } from '../types'
import { EMOJI_REGEXP, getEmojiUnicode } from './emoji'
import type { MDCElement, MDCNode } from './mdcTypes'

/**
 * Creates a binding node for data binding expressions
 */
export function createBindingNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const element = node as MDCElement
  return createTipTapNodeFn(element, 'binding', {
    attrs: {
      defaultValue: element.props?.defaultValue,
      value: element.props?.value,
    },
  })
}

/**
 * Creates a file node
 */
export function createFileNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const element = node as MDCElement
  return createTipTapNodeFn(element, 'file', {
    attrs: { props: element.props || {} },
  })
}

/**
 * Creates an image node (handles Image, image, and img tags)
 */
export function createImageNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const element = node as MDCElement
  return createTipTapNodeFn(element, 'image', {
    attrs: { props: element.props || {} },
  })
}

/**
 * Creates a video node
 */
export function createVideoNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const element = node as MDCElement
  return createTipTapNodeFn(element, 'video', { attrs: { ...element.props } })
}

/**
 * Creates a comment node
 */
export function createCommentNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const element = node as MDCElement
  return createTipTapNodeFn(element, 'comment', {
    attrs: { text: (node as { value?: string }).value },
  })
}

/**
 * Creates a blockquote node
 */
export function createBlockquoteNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  return createTipTapNodeFn(node as MDCElement, 'blockquote')
}

/**
 * Creates a horizontal rule node
 */
export function createHrNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  return createTipTapNodeFn(node as MDCElement, 'horizontalRule')
}

/**
 * Creates a hard break node
 */
export function createBrNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  return createTipTapNodeFn(node as MDCElement, 'hardBreak')
}

/**
 * Creates a table node
 */
export function createTableNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  return createTipTapNodeFn(node as MDCElement, 'table')
}

/**
 * Creates a table row node
 */
export function createTrNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  return createTipTapNodeFn(node as MDCElement, 'tableRow')
}

/**
 * Creates a table header cell node
 */
export function createThNode(
  node: MDCNode,
  createTableCellNodeFn: (node: MDCElement, type: 'tableCell' | 'tableHeader') => JSONContent,
): JSONContent {
  return createTableCellNodeFn(node as MDCElement, 'tableHeader')
}

/**
 * Creates a table data cell node
 */
export function createTdNode(
  node: MDCNode,
  createTableCellNodeFn: (node: MDCElement, type: 'tableCell' | 'tableHeader') => JSONContent,
): JSONContent {
  return createTableCellNodeFn(node as MDCElement, 'tableCell')
}

/**
 * Creates an ordered list node
 */
export function createOlNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const element = node as MDCElement
  return createTipTapNodeFn(element, 'orderedList', {
    attrs: { start: element.props?.start },
  })
}

/**
 * Creates an unordered list node
 */
export function createUlNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  return createTipTapNodeFn(node as MDCElement, 'bulletList')
}

/**
 * Creates a list item node
 */
export function createLiNode(
  node: MDCNode,
  createListItemNodeFn: (node: MDCElement) => JSONContent,
): JSONContent {
  return createListItemNodeFn(node as MDCElement)
}

/**
 * Creates a paragraph node
 */
export function createPNode(
  node: MDCNode,
  createParagraphNodeFn: (
    node: MDCElement,
    options?: { allowImageLift?: boolean },
  ) => JSONContent | JSONContent[],
): JSONContent | JSONContent[] {
  return createParagraphNodeFn(node as MDCElement)
}

/**
 * Creates a pre/code block node
 */
export function createPreNodeWrapper(
  node: MDCNode,
  createPreNodeFn: (node: MDCElement) => JSONContent,
): JSONContent {
  return createPreNodeFn(node as MDCElement)
}

/**
 * Creates a span-style node
 */
export function createSpanNode(
  node: MDCNode,
  createSpanStyleNodeFn: (node: MDCElement) => JSONContent,
): JSONContent {
  return createSpanStyleNodeFn(node as MDCElement)
}

/**
 * Creates a template/slot node
 */
export function createTemplateNodeWrapper(
  node: MDCNode,
  createTemplateNodeFn: (node: MDCElement) => JSONContent,
): JSONContent {
  return createTemplateNodeFn(node as MDCElement)
}

/**
 * Creates a text node with emoji support
 */
export function createTextNodeWrapper(node: MDCNode): JSONContent | JSONContent[] {
  return createTextNode(node as { value: string })
}

/**
 * Creates a text node with emoji support
 */
export function createTextNode(node: { value: string }): JSONContent | JSONContent[] {
  const text = node.value
  const nodes: JSONContent[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Use exec to find all matches without replacing
  const regex = new RegExp(EMOJI_REGEXP.source, EMOJI_REGEXP.flags)
  match = regex.exec(text)
  while (match !== null) {
    const offset = match.index
    const matchedText = match[0]

    // Add text before the emoji
    if (lastIndex < offset) {
      const textSlice = text.slice(lastIndex, offset)
      if (textSlice) {
        nodes.push({
          text: textSlice,
          type: 'text',
        })
      }
    }

    // Add the emoji (or original if not found)
    const emojiName = matchedText.substring(1, matchedText.length - 1)
    const emojiUnicode = getEmojiUnicode(emojiName)
    const emojiText = emojiUnicode || matchedText
    if (emojiText) {
      nodes.push({
        text: emojiText,
        type: 'text',
      })
    }

    lastIndex = offset + matchedText.length
    match = regex.exec(text)
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex)
    if (remainingText) {
      nodes.push({
        text: remainingText,
        type: 'text',
      })
    }
  }

  if (nodes.length === 0) {
    return { text, type: 'text' }
  }

  return nodes
}
