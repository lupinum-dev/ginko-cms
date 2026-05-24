/**
 * MDC to TipTap converter
 *
 * Main entry point that combines categorized converters:
 * - marks.ts: Text formatting (bold, italic, link, code, strike)
 * - nodes.ts: Document structure (headings, lists, tables, paragraphs)
 * - component-converters.ts: Custom components (binding, file, image, video)
 */

import type { JSONContent } from '@tiptap/vue-3'

import type { JsonRecord, JsonValue } from '../types'
// Import categorized converters
import {
  createBindingNode,
  createBlockquoteNode,
  createBrNode,
  createCommentNode,
  createFileNode,
  createHrNode,
  createImageNode,
  createLiNode,
  createOlNode,
  createPNode,
  createPreNodeWrapper,
  createSpanNode,
  createTableNode,
  createTdNode,
  createTemplateNodeWrapper,
  createTextNodeWrapper,
  createThNode,
  createTrNode,
  createUlNode,
  createVideoNode,
} from './component-converters'
import { validateTiptapDocShape } from './conversionInvariants'
import { isDebugEnabled, editorDebug } from './debug'
import { summarizeMdc, summarizeTableMdc } from './markdown'
import { createMark, tagToMark } from './marks'
import type { MDCElement, MDCNode, MDCRoot } from './mdcTypes'
import {
  createHeadingNode,
  createListItemNode,
  createParagraphNode,
  createPreNode,
  createSpanStyleNode,
  createTableCellNode,
  createTemplateNode,
  wrapChildrenWithinSlot,
} from './nodes'
import { isValidAttr } from './props'
import { stripStyleNodes } from './stripStyleNodes'

type MDCToTipTapMap = Record<string, (node: MDCNode | MDCRoot) => JSONContent | JSONContent[]>

/**
 * Creates the main MDC to TipTap conversion map
 * Combines entries from marks, nodes, and component categories
 */
function createMdcToTiptapMap(): MDCToTipTapMap {
  // Create mark entries from tagToMark mapping
  const markMapEntries = Object.entries(tagToMark).map(([key, value]) => [
    key,
    (node: MDCNode) => createMark(node, value, [], mdcNodeToTiptap),
  ])

  // Component and node converters
  return {
    // Marks (text formatting)
    ...Object.fromEntries(markMapEntries),

    // Components (custom elements)
    binding: (node: MDCNode) => createBindingNode(node, createTipTapNode),
    blockquote: (node: MDCNode) => createBlockquoteNode(node, createTipTapNode),
    br: (node: MDCNode) => createBrNode(node, createTipTapNode),
    comment: (node: MDCNode) => createCommentNode(node, createTipTapNode),
    file: (node: MDCNode) => createFileNode(node, createTipTapNode),
    Image: (node: MDCNode) => createImageNode(node, createTipTapNode),
    image: (node: MDCNode) => createImageNode(node, createTipTapNode),
    img: (node: MDCNode) => createImageNode(node, createTipTapNode),
    video: (node: MDCNode) => createVideoNode(node, createTipTapNode),

    // Structural nodes
    h1: (node: MDCNode) => createHeadingNode(node, createTipTapNode),
    h2: (node: MDCNode) => createHeadingNode(node, createTipTapNode),
    h3: (node: MDCNode) => createHeadingNode(node, createTipTapNode),
    h4: (node: MDCNode) => createHeadingNode(node, createTipTapNode),
    h5: (node: MDCNode) => createHeadingNode(node, createTipTapNode),
    h6: (node: MDCNode) => createHeadingNode(node, createTipTapNode),
    hr: (node: MDCNode) => createHrNode(node, createTipTapNode),
    li: (node: MDCNode) => createLiNode(node, (n) => createListItemNode(n, createTipTapNode)),
    ol: (node: MDCNode) => createOlNode(node, createTipTapNode),
    p: (node: MDCNode) =>
      createPNode(node, (n, opts) => createParagraphNode(n, mdcNodeToTiptap, opts)),
    pre: (node: MDCNode) =>
      createPreNodeWrapper(node, (n) => createPreNode(n, getNodeText, createTipTapNode)),
    span: (node: MDCNode) =>
      createSpanNode(node, (n) => createSpanStyleNode(n, isValidAttr, createTipTapNode)),
    table: (node: MDCNode) => createTableNode(node, createTipTapNode),
    td: (node: MDCNode) =>
      createTdNode(node, (n, t) => createTableCellNode(n, t, createTipTapNode)),
    template: (node: MDCNode) =>
      createTemplateNodeWrapper(node, (n) => createTemplateNode(n, createTipTapNode)),
    text: createTextNodeWrapper,
    th: (node: MDCNode) =>
      createThNode(node, (n, t) => createTableCellNode(n, t, createTipTapNode)),
    tr: (node: MDCNode) => createTrNode(node, createTipTapNode),
    ul: (node: MDCNode) => createUlNode(node, createTipTapNode),

    // Root document
    root: createRootNode,
  }
}

/**
 * Creates the root document node
 */
function createRootNode(node: MDCNode | MDCRoot): JSONContent {
  const element = node as MDCElement
  return {
    content: (element.children || []).flatMap((child) => mdcNodeToTiptap(child, node as MDCNode)),
    type: 'doc',
  }
}

/**
 * Core TipTap node factory
 * Handles attribute cleaning and child conversion
 */
function createTipTapNode(
  node: MDCElement,
  type: string,
  extra: { attrs?: JsonRecord; children?: MDCNode[] } = {},
): JSONContent {
  const { attrs = {}, children } = extra
  const attrsProps = (attrs as JsonRecord).props as JsonRecord | undefined
  const nodeProps = node.props || {}
  const mergedProps = { ...(attrsProps || {}), ...nodeProps }

  const cleanProps: Array<[string, JsonValue]> = []
  for (const [key, value] of Object.entries(mergedProps)) {
    if (value === undefined) {
      continue
    }
    if (key.startsWith('__mdc_')) {
      continue
    }

    const trimmedKey = key.trim()
    if (trimmedKey === 'class' || trimmedKey === 'className') {
      const classValue = typeof value === 'string' ? value : (value as Array<string>).join(' ')
      cleanProps.push(['class', classValue])
    } else {
      cleanProps.push([trimmedKey, value])
    }
  }

  const tiptapNode: JSONContent = { attrs, type }

  if (cleanProps.length > 0) {
    ;(tiptapNode.attrs as JsonRecord).props = Object.fromEntries(cleanProps)
  }

  const nodeChildren = children || node.children || []
  if (nodeChildren.length > 0) {
    tiptapNode.content = nodeChildren
      .flatMap((child) => mdcNodeToTiptap(child, node))
      .filter(Boolean)
  }

  return tiptapNode
}

/**
 * Extracts text content from an element recursively
 */
function getNodeText(node: MDCElement): string {
  let content = ''
  const walk = (child: MDCNode) => {
    if (child.type === 'text') {
      content += child.value || ''
      return
    }
    if (child.type === 'element') {
      ;(child.children || []).forEach((grandChild) => walk(grandChild))
    }
  }

  ;(node.children || []).forEach((child) => walk(child))
  return content
}

/**
 * Recursively removes empty text nodes from TipTap content
 * TipTap does not allow text nodes with empty strings
 */
function removeEmptyTextNodes(content: JSONContent): JSONContent
function removeEmptyTextNodes(content: JSONContent[]): JSONContent[]
function removeEmptyTextNodes(content: JSONContent | JSONContent[]): JSONContent | JSONContent[] {
  if (Array.isArray(content)) {
    const filtered = content.filter((node) => {
      // Remove empty text nodes
      if (node?.type === 'text' && (!node.text || node.text === '')) {
        editorDebug.log('removeEmptyTextNodes: filtering out empty text node', {
          hasMarks: !!node.marks?.length,
          marks: node.marks,
        })
        return false
      }
      return true
    })

    return filtered.map((node) => removeEmptyTextNodes(node))
  }

  if (content && typeof content === 'object') {
    const cleaned = { ...content }
    if (cleaned.content) {
      cleaned.content = removeEmptyTextNodes(cleaned.content)
    }
    return cleaned
  }

  return content
}

// Initialize the converter map
const mdcToTiptapMap = createMdcToTiptapMap()

/**
 * Converts a single Editor node to TipTap format
 * Note: Can return JSONContent[] for text nodes with emojis, which will be flattened by caller
 */
export function mdcNodeToTiptap(
  node: MDCNode | MDCRoot,
  parent?: MDCNode,
): JSONContent | JSONContent[] {
  const type = node.type === 'element' ? node.tag! : node.type

  if (type === 'p' && (parent as MDCElement | undefined)?.tag === 'li') {
    return createParagraphNode(node as MDCElement, mdcNodeToTiptap, { allowImageLift: false })
  }

  if (type === 'code' && node.type === 'element') {
    editorDebug.log('mdcNodeToTiptap: code element from MDC', {
      children: (node as MDCElement).children,
      childrenCount: (node as MDCElement).children?.length || 0,
      parent: (parent as MDCElement)?.tag || parent?.type,
      props: (node as MDCElement).props,
      tag: type,
    })
  }

  // Known node types
  if (mdcToTiptapMap[type]) {
    if (node.type === 'element' && ['table', 'td', 'th', 'tr'].includes(type)) {
      editorDebug.log('mdcNodeToTiptap table element', {
        children: (node as MDCElement).children?.length || 0,
        props: (node as MDCElement).props,
        tag: type,
      })
    }
    return mdcToTiptapMap[type](node)
  }

  if (node.type === 'element') {
    editorDebug.log('mdcToTiptap custom element', {
      parent: (parent as MDCElement)?.tag || parent?.type,
      tag: type,
    })
  }

  // Custom vue components (Elements)
  // If parent is a paragraph, then element should be inline
  if ((parent as MDCElement)?.tag === 'p') {
    return createTipTapNode(node as MDCElement, 'inline-element', { attrs: { tag: type } })
  }

  // In tiptap side only, inside element, text must be enclosed in a paragraph
  if (node.type === 'element' && node.children?.[0]?.type === 'text') {
    node = {
      ...node,
      children: [
        {
          children: node.children,
          props: {},
          tag: 'p',
          type: 'element',
        },
      ],
      props: {
        ...node.props,
        __tiptapWrap: true,
      },
    }
  }

  const children = wrapChildrenWithinSlot(((node as MDCElement).children || []) as MDCElement[])

  return createTipTapNode(node as MDCElement, 'element', { attrs: { tag: type }, children })
}

/**
 * Convert MDC AST to TipTap JSON (without frontmatter)
 */
export function mdcToTiptap(body: MDCRoot): JSONContent {
  const cleanedBody = stripStyleNodes(body)

  // Remove invalid text node which added by table syntax
  cleanedBody.children = (cleanedBody.children || []).filter((child) => child.type !== 'text')

  editorDebug.log('mdcToTiptap input', summarizeMdc(cleanedBody))
  editorDebug.log('mdcToTiptap table summary', summarizeTableMdc(cleanedBody))

  editorDebug.log('mdcToTiptap full MDC body', {
    body: structuredClone(cleanedBody),
  })

  const tree = mdcNodeToTiptap(cleanedBody)

  // Handle case where mdcNodeToTiptap returns an array
  let doc: JSONContent
  if (Array.isArray(tree)) {
    doc = { type: 'doc', content: tree }
  } else {
    doc = tree
  }

  // Ensure there's at least one paragraph
  if (!doc.content || doc.content.length === 0) {
    doc.content = [{ content: [], type: 'paragraph' }]
  }

  // Final cleanup: remove any empty text nodes that may have been created
  const cleanedDoc = removeEmptyTextNodes(doc)

  if (isDebugEnabled()) {
    const issues = validateTiptapDocShape(cleanedDoc)
    if (issues.length > 0) {
      editorDebug.warn('mdcToTiptap invariant issues detected', {
        count: issues.length,
        issues,
      })
    }
  }

  return cleanedDoc
}
