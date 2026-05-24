/**
 * Node converters for MDC to TipTap transformation
 *
 * Handles document structure: headings, paragraphs, lists, tables, etc.
 */

import type { JSONContent } from '@tiptap/vue-3'

import type { JsonRecord } from '../types'
import { editorDebug } from './debug'
import type { MDCElement, MDCNode } from './mdcTypes'

/**
 * Creates a heading node converter for a specific level
 */
export function createHeadingNode(
  node: MDCNode,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const element = node as MDCElement
  const level = Number.parseInt(element.tag?.charAt(1) || '1', 10)
  return createTipTapNodeFn(element, 'heading', { attrs: { level } })
}

/**
 * Creates a paragraph node
 */
export function createParagraphNode(
  node: MDCElement,
  convertNode: (node: MDCNode, parent?: MDCNode) => JSONContent | JSONContent[],
  options: { allowImageLift?: boolean } = {},
): JSONContent | JSONContent[] {
  node.children = node.children?.filter((child) => !(child.type === 'text' && !child.value)) || []

  // Flatten children if any are arrays (e.g., from createMark)
  // Filter out null/undefined values that may come from empty text nodes
  const content = node.children
    .map((child) => convertNode(child, node))
    .flat()
    .filter(Boolean)

  if (options.allowImageLift !== false && content.length === 1 && content[0]?.type === 'image') {
    return content[0]
  }

  const paragraphAttrs =
    !node.props || Object.keys(node.props).length === 0 ? undefined : node.props

  const inlineTypes = new Set(['binding', 'hardBreak', 'inline-element', 'span-style', 'text'])

  const hasBlockChildren = content.some((child) => {
    const type = child?.type
    return !type || !inlineTypes.has(type)
  })

  if (hasBlockChildren) {
    const splitNodes: JSONContent[] = []
    let inlineBuffer: JSONContent[] = []

    const flushInlineBuffer = () => {
      if (inlineBuffer.length === 0) {
        return
      }
      splitNodes.push({
        attrs: paragraphAttrs,
        content: inlineBuffer,
        type: 'paragraph',
      })
      inlineBuffer = []
    }

    for (const child of content) {
      const type = child?.type
      const isInlineChild = !!type && inlineTypes.has(type)

      if (isInlineChild) {
        inlineBuffer.push(child)
      } else {
        flushInlineBuffer()
        if (options.allowImageLift === false && splitNodes.length === 0) {
          // listItem requires first child paragraph; keep an empty one if block comes first.
          splitNodes.push({
            attrs: paragraphAttrs,
            content: [],
            type: 'paragraph',
          })
        }
        splitNodes.push(child)
      }
    }

    flushInlineBuffer()

    if (splitNodes.length > 0) {
      return splitNodes
    }
  }

  return {
    attrs: paragraphAttrs,
    content,
    type: 'paragraph',
  }
}

/**
 * Creates a list item node
 */
export function createListItemNode(
  node: MDCElement,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const children = (node.children || []) as MDCNode[]
  const blockTags = [
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'ol',
    'p',
    'pre',
    'table',
    'ul',
  ]

  const hasBlockChild = children.some((child) => {
    return child.type === 'element' && blockTags.includes(child.tag || '')
  })

  let normalizedChildren: MDCNode[]
  if (hasBlockChild) {
    normalizedChildren = children
  } else {
    normalizedChildren = [{ children, props: {}, tag: 'p', type: 'element' } as MDCElement]
  }

  return createTipTapNodeFn(node, 'listItem', { children: normalizedChildren })
}

/**
 * Creates a table cell node (th or td)
 */
export function createTableCellNode(
  node: MDCElement,
  type: 'tableCell' | 'tableHeader',
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const children = (node.children || []) as MDCNode[]
  const blockTags = [
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'ol',
    'p',
    'pre',
    'table',
    'ul',
  ]

  const hasBlockChild = children.some((child) => {
    return child.type === 'element' && blockTags.includes(child.tag || '')
  })

  let normalizedChildren: MDCNode[]
  if (hasBlockChild) {
    normalizedChildren = children
  } else {
    normalizedChildren = [{ children, props: {}, tag: 'p', type: 'element' } as MDCElement]
  }

  return createTipTapNodeFn(node, type, { children: normalizedChildren })
}

/**
 * Creates a code block (pre) node
 */
export function createPreNode(
  node: MDCElement,
  getNodeTextFn: (node: MDCElement) => string,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const tiptapNode = createTipTapNodeFn(node, 'codeBlock', {
    attrs: {
      filename: node.props?.filename,
      language: node.props?.language || 'text',
    },
  })

  const rawCodeText = node.props?.code
  const codeText = typeof rawCodeText === 'string' ? rawCodeText : getNodeTextFn(node)
  const initialContent = tiptapNode.content as Array<JSONContent> | undefined
  if ((!initialContent || initialContent.length === 0) && codeText) {
    editorDebug.warn('Code block content missing, restoring text', {
      filename: node.props?.filename,
      language: node.props?.language,
    })
    tiptapNode.content = [{ text: codeText, type: 'text' }]
  }

  const content = (tiptapNode.content as Array<JSONContent>) || []

  if (content.length === 1 && content[0]?.text === '') {
    tiptapNode.content = []
  }

  content.forEach((child: JSONContent) => {
    delete child.marks
  })

  return tiptapNode
}

/**
 * Creates a span-style node (for styled spans)
 */
export function createSpanStyleNode(
  node: MDCElement,
  isValidAttrFn: (value?: string | null) => boolean,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const spanStyle = stringProp(node.props?.style)
  const spanClass = stringProp(node.props?.class) || stringProp(node.props?.className)
  const spanAttrs: JsonRecord = {
    class: isValidAttrFn(spanClass) ? String(spanClass).trim() : undefined,
    style: isValidAttrFn(spanStyle) ? String(spanStyle).trim() : undefined,
  }
  const cleanedNode = { ...node, props: { ...node.props } }

  delete (cleanedNode.props as JsonRecord).style
  delete (cleanedNode.props as JsonRecord).class
  delete (cleanedNode.props as JsonRecord).className

  return createTipTapNodeFn(cleanedNode as MDCElement, 'span-style', { attrs: spanAttrs })
}

function stringProp(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Creates a template/slot node
 */
export function createTemplateNode(
  node: MDCElement,
  createTipTapNodeFn: (
    node: MDCElement,
    type: string,
    extra?: { attrs?: JsonRecord; children?: MDCNode[] },
  ) => JSONContent,
): JSONContent {
  const props = node.props || {}
  const name = (props.slotName as string) || 'default'

  if (node.children?.[0]?.type === 'text') {
    node.children = [
      {
        children: node.children,
        props: {},
        tag: 'p',
        type: 'element',
      } as MDCElement,
    ]
  }

  return createTipTapNodeFn(node, 'slot', { attrs: { name } })
}

/**
 * Wraps non-slot children within a default slot
 */
export function wrapChildrenWithinSlot(children: MDCElement[]): MDCElement[] {
  const noneSlotChildren = children.filter((child) => child.tag !== 'template')
  if (noneSlotChildren.length) {
    const filteredChildren = children.filter((child) => child.tag === 'template')

    let defaultSlot = filteredChildren.find(
      (child) => child.props?.slotName === 'default',
    ) as MDCElement
    if (!defaultSlot) {
      defaultSlot = {
        children: [],
        props: {
          slotName: 'default',
        },
        tag: 'template',
        type: 'element',
      }
      filteredChildren.unshift(defaultSlot)
    }

    defaultSlot.children = [...(defaultSlot.children || []), ...noneSlotChildren]
    return filteredChildren
  }

  return children
}
