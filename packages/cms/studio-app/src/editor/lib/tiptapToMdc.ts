import type { JSONContent } from '@tiptap/vue-3'
import Slugger from 'github-slugger'

import type { JsonRecord } from '../types'
import { validateTiptapDocShape } from './conversionInvariants'
import { isDebugEnabled, editorDebug } from './debug'
import { getEmojiUnicode } from './emoji'
import { summarizeMdc, summarizeTableMdc } from './markdown'
import type { MDCComment, MDCElement, MDCNode, MDCRoot, MDCText } from './mdcTypes'
import { cleanSpanProps, normalizeProps } from './props'
import { stripStyleNodes } from './stripStyleNodes'

export interface SyntaxHighlightTheme {
  dark?: string
  default: string
}

export interface TiptapToMDCOptions {
  enableDebug?: boolean
  fileOutput?: 'markdown' | 'mdc'
  highlightTheme?: SyntaxHighlightTheme
  imageOutput?: 'markdown' | 'mdc'
  videoOutput?: 'html' | 'mdc'
}

interface TiptapToMDCContext {
  options: TiptapToMDCOptions
  slugs: Slugger
}

type TiptapToMDCMap = Record<
  string,
  (node: JSONContent, context: TiptapToMDCContext) => MDCNode | MDCNode[] | MDCRoot
>

const RE_SLUG_MULTI_DASH = /-+/g
const RE_SLUG_TRIM_DASH = /^-|-$/g
const RE_SLUG_LEADING_DIGIT = /^(\d)/
const RE_TEXT_LEADING_SPACE = /^\s+/
const RE_TEXT_TRAILING_SPACE = /\s+$/

const markToTag: Record<string, string> = {
  bold: 'strong',
  code: 'code',
  italic: 'em',
  strike: 'del',
}

function isMeaningfulPropValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false
  }
  if (typeof value !== 'string') {
    return true
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }
  const lowered = trimmed.toLowerCase()
  return lowered !== 'undefined' && lowered !== 'null'
}

function sanitizeNumberish(value: unknown): null | number | string {
  if (!isMeaningfulPropValue(value)) {
    return null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return normalized
}

function createBindingElement(node: JSONContent): MDCElement {
  const attrs = node.attrs as JsonRecord | undefined
  const defaultValue = attrs?.defaultValue as string
  const value = attrs?.value as string
  return { children: [], props: { defaultValue, value }, tag: 'binding', type: 'element' }
}

function createBlockquoteElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'blockquote')
}

function createBoldElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'strong')
}

function createBrElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'br')
}

function createBulletListElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'ul')
}

function createCodeElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'code', { props: (node.attrs || {}) as JsonRecord })
}

function createCommentElement(node: JSONContent): MDCComment {
  return { type: 'comment', value: node.attrs!.text }
}

function createDocElement(node: JSONContent, context: TiptapToMDCContext): MDCRoot {
  return {
    children: (node.content || []).flatMap((child) => tiptapNodeToMDC(child, context)),
    type: 'root',
  } as MDCRoot
}

function createFileElementWrapper(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createFileElement(node, context)
}

function createHardBreakElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'br')
}

function createHeadingElementWrapper(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createHeadingElement(node, context)
}

function createHorizontalRuleElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'hr')
}

function createImageElementWrapper(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createImageElement(node, context)
}

function createItalicElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'em')
}

function createOrderedListElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'ol', { props: { start: node.attrs?.start } })
}

function createParagraphElementWrapper(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'p')
}

function createSlotElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  const slotName = node.attrs?.name || 'default'
  return createElement(node, context, 'template', { props: { slotName } })
}

function createSpanStyleElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'span', { props: cleanSpanProps(node.attrs as JsonRecord) })
}

function createStrikeElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'del')
}

function createTableElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'table')
}

function createTableCellElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'td')
}

function createTableHeaderElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'th')
}

function createTableRowElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createElement(node, context, 'tr')
}

function createVideoElementWrapper(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  return createVideoElement(node, context)
}

const tiptapToMDCMap: TiptapToMDCMap = {
  binding: createBindingElement,
  blockquote: createBlockquoteElement,
  bold: createBoldElement,
  br: createBrElement,
  bulletList: createBulletListElement,
  code: createCodeElement,
  codeBlock: createCodeBlockElement,
  comment: createCommentElement,
  doc: createDocElement,
  element: createElement,
  file: createFileElementWrapper,
  hardBreak: createHardBreakElement,
  heading: createHeadingElementWrapper,
  horizontalRule: createHorizontalRuleElement,
  image: createImageElementWrapper,
  'inline-element': createElement,
  italic: createItalicElement,
  link: createLinkElement,
  listItem: createListItemElement,
  orderedList: createOrderedListElement,
  paragraph: createParagraphElementWrapper,
  slot: createSlotElement,
  'span-style': createSpanStyleElement,
  strike: createStrikeElement,
  table: createTableElement,
  tableCell: createTableCellElement,
  tableHeader: createTableHeaderElement,
  tableRow: createTableRowElement,
  text: createTextElement,
  video: createVideoElementWrapper,
}

export function tiptapNodeToMDC(
  node: JSONContent,
  context: TiptapToMDCContext,
): MDCNode | MDCNode[] | MDCRoot {
  if (!node) {
    return {
      children: [],
      props: {},
      tag: 'p',
      type: 'element',
    }
  }

  if (node.type && tiptapToMDCMap[node.type]) {
    if (node.type.startsWith('table')) {
      editorDebug.log('tiptapNodeToMDC table node', {
        attrs: node.attrs,
        hasContent: !!node.content?.length,
        type: node.type,
      })
    }
    return tiptapToMDCMap[node.type]!(node, context)
  }

  if (node.type === 'emoji') {
    return { type: 'text', value: getEmojiUnicode(node.attrs?.name || '') }
  }

  return {
    children: [
      {
        type: 'text',
        value: `--- Unknown node: ${node.type} ---`,
      },
    ],
    props: {},
    tag: 'p',
    type: 'element',
  }
}

/**
 * Convert TipTap JSON to MDC AST (without frontmatter)
 */
export async function tiptapToMDC(
  node: JSONContent,
  options?: TiptapToMDCOptions,
): Promise<MDCRoot> {
  const cleaned = createMdcBodyFromTiptap(node, options)

  if (isDebugEnabled()) {
    editorDebug.log('tiptapToMDC output', summarizeMdc(cleaned))
    editorDebug.log('tiptapToMDC table summary', summarizeTableMdc(cleaned))
  }

  return cleaned
}

export function tiptapToMDCSync(node: JSONContent, options?: TiptapToMDCOptions): MDCRoot {
  return createMdcBodyFromTiptap(node, options)
}

function createMdcBodyFromTiptap(node: JSONContent, options?: TiptapToMDCOptions): MDCRoot {
  const context: TiptapToMDCContext = {
    options: options || {},
    slugs: new Slugger(),
  }

  const nodeCopy = structuredClone(node)

  if (isDebugEnabled()) {
    const issues = validateTiptapDocShape(nodeCopy)
    if (issues.length > 0) {
      editorDebug.warn('tiptapToMDC invariant issues detected before conversion', {
        count: issues.length,
        issues,
      })
    }
  }

  const body = tiptapNodeToMDC(nodeCopy, context) as MDCRoot

  if (isDebugEnabled()) {
    editorDebug.log('tiptapToMDC input', summarizeTiptap(node))
    editorDebug.log('tiptapToMDC output before highlight', summarizeMdc(body))
    editorDebug.log('tiptapToMDC table summary', summarizeTableMdc(body))
  }

  const cleaned = stripStyleNodes(body, 'tiptapToMDC')

  return cleaned
}

function createElement(
  node: JSONContent,
  context: TiptapToMDCContext,
  tag?: string,
  extra: JsonRecord = {},
): MDCElement {
  const { props = {}, ...rest } = extra as { props: object }
  let children = node.content || []

  // Unwrap TipTap wrapper
  if (node.attrs?.props?.__tiptapWrap) {
    if (children.length === 1 && children[0]?.type === 'slot') {
      const slot = children[0]
      slot.content = unwrapParagraph(slot.content || [])
    }
    delete node.attrs.props.__tiptapWrap
  }

  const propsArray = normalizeProps(node.attrs?.props || {}, props)

  if (node.type === 'paragraph') {
    if (!children || children.length === 0) {
      return { children: [], props: {}, tag: 'p', type: 'element' }
    }
    return createParagraphElement(node, context, propsArray, rest)
  }

  children = unwrapDefaultSlot(children)
  children = unwrapParagraph(children)

  return {
    children: node.children || children.flatMap((child) => tiptapNodeToMDC(child, context)),
    tag: tag || node.attrs?.tag,
    type: 'element',
    ...rest,
    props: Object.fromEntries(propsArray),
  }
}

export function createParagraphElement(
  node: JSONContent,
  context: TiptapToMDCContext,
  propsArray: string[][],
  rest: object = {},
): MDCElement {
  type MarkInfo = null | { attrs?: JsonRecord; type: string }

  interface Block {
    content: JSONContent[]
    mark: MarkInfo
  }

  const blocks: Block[] = []
  let currentBlockContent: JSONContent[] = []
  let currentBlockMark: MarkInfo = null

  function getMarkInfo(child: JSONContent): MarkInfo {
    if (child.type === 'text' && child.marks?.length === 1 && child.marks[0]?.type) {
      return child.marks[0] as { attrs?: JsonRecord; type: string }
    }

    if (
      child.type === 'link-element' &&
      child.content &&
      child.content.length === 1 &&
      child.content[0] &&
      child.content[0].type === 'text' &&
      child.content[0].marks?.length === 1 &&
      child.content[0].marks[0]?.type
    ) {
      return child.content[0].marks[0] as { attrs?: JsonRecord; type: string }
    }

    return null
  }

  function sameMark(markA: MarkInfo, markB: MarkInfo): boolean {
    if (!markA && !markB) {
      return true
    }
    if (!markA || !markB) {
      return false
    }
    return (
      markA.type === markB.type &&
      JSON.stringify(markA.attrs || {}) === JSON.stringify(markB.attrs || {})
    )
  }

  node.content!.forEach((child) => {
    const mark = getMarkInfo(child)

    if (!sameMark(mark, currentBlockMark)) {
      if (currentBlockContent.length > 0) {
        blocks.push({ content: currentBlockContent, mark: currentBlockMark })
      }
      currentBlockContent = []
      currentBlockMark = mark
    }

    currentBlockContent.push(child)
  })

  if (currentBlockContent.length > 0) {
    blocks.push({ content: currentBlockContent, mark: currentBlockMark })
  }

  const children = blocks.map((block) => {
    if (block.content.length > 1 && block.mark && markToTag[block.mark.type]) {
      block.content.forEach((child: JSONContent) => {
        if (child.type === 'text') {
          delete child.marks
        } else if (child.type === 'link-element' && child.content?.[0]) {
          delete child.content[0].marks
        }
      })

      const markTag = markToTag[block.mark.type]
      const hasAttrs = block.mark.attrs && Object.keys(block.mark.attrs).length > 0

      if (hasAttrs) {
        return {
          children: block.content.flatMap((child) => tiptapNodeToMDC(child, context)),
          tag: markTag,
          type: 'element',
          props: block.mark.attrs,
        } as MDCElement
      }

      return {
        children: block.content.flatMap((child) => tiptapNodeToMDC(child, context)),
        tag: markTag,
        type: 'element',
      } as MDCElement
    }

    return block.content.flatMap((child) => tiptapNodeToMDC(child, context))
  }) as MDCElement[]

  const mergedChildren = mergeSiblingsWithSameTag(children.flat(), Object.values(markToTag))

  return {
    tag: 'p',
    type: 'element',
    ...rest,
    children: mergedChildren,
    props: Object.fromEntries(propsArray),
  }
}

function createCodeBlockElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  const mdcNode = createElement(node, context, 'pre')
  const code = node.attrs?.code || getNodeContent(node) || ''
  const language = node.attrs?.language || ''
  const filename = node.attrs?.filename

  mdcNode.props!.code = code
  mdcNode.props!.language = language
  if (filename) {
    mdcNode.props!.filename = filename
  }

  mdcNode.children = [
    {
      children: [{ type: 'text', value: code }],
      props: { __ignoreMap: '' },
      tag: 'code',
      type: 'element',
    },
  ]

  return mdcNode
}

function createFileElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  const props = node.attrs?.props || {}
  const fileOutput = context.options.fileOutput ?? 'mdc'

  const fileProps: JsonRecord = {}
  if (props.id) fileProps.id = props.id
  if (props.filename) fileProps.filename = props.filename
  if (props.title) fileProps.title = props.title
  if (props.type) fileProps.type = props.type
  if (props.size) fileProps.size = props.size
  if (props.src) fileProps.src = props.src

  if (fileOutput === 'markdown') {
    const linkText = fileProps.title || fileProps.filename || fileProps.src || 'Download'
    return {
      children: [{ type: 'text', value: String(linkText) }],
      props: { href: fileProps.src, title: fileProps.title },
      tag: 'a',
      type: 'element',
    }
  }

  return createElement(node, context, 'file', { props: fileProps })
}

function createHeadingElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  const level = node.attrs?.level || 1
  const mdcNode = createElement(node, context, `h${level}`)
  const content = getNodeContent(node) || ''

  const slug = context.slugs
    .slug(content)
    .replace(RE_SLUG_MULTI_DASH, '-')
    .replace(RE_SLUG_TRIM_DASH, '')
    .replace(RE_SLUG_LEADING_DIGIT, '_$1')

  mdcNode.props!.id = slug
  return mdcNode
}

function createImageElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  const props = node.attrs?.props || {}
  const src = props.src || node.attrs?.src
  const imageOutput = context.options.imageOutput ?? 'mdc'

  const imageProps: JsonRecord = {}
  if (props.id) imageProps.id = props.id
  if (props.filename) imageProps.filename = props.filename
  if (isMeaningfulPropValue(src)) imageProps.src = src
  const alt = props.alt || node.attrs?.alt
  if (isMeaningfulPropValue(alt)) imageProps.alt = alt
  if (isMeaningfulPropValue(props.title)) imageProps.title = props.title
  const width = sanitizeNumberish(props.width)
  if (width !== null) imageProps.width = width
  const height = sanitizeNumberish(props.height)
  if (height !== null) imageProps.height = height
  if (isMeaningfulPropValue(props.fit)) imageProps.fit = props.fit
  const quality = sanitizeNumberish(props.quality)
  if (quality !== null) imageProps.quality = quality
  if (isMeaningfulPropValue(props.format)) imageProps.format = props.format
  const focalX = sanitizeNumberish(props.focalX)
  if (focalX !== null) imageProps.focalX = focalX
  const focalY = sanitizeNumberish(props.focalY)
  if (focalY !== null) imageProps.focalY = focalY
  const cropX = sanitizeNumberish(props.cropX)
  if (cropX !== null) imageProps.cropX = cropX
  const cropY = sanitizeNumberish(props.cropY)
  if (cropY !== null) imageProps.cropY = cropY
  const cropWidth = sanitizeNumberish(props.cropWidth)
  if (cropWidth !== null) imageProps.cropWidth = cropWidth
  const cropHeight = sanitizeNumberish(props.cropHeight)
  if (cropHeight !== null) imageProps.cropHeight = cropHeight
  if (isMeaningfulPropValue(props.class)) imageProps.class = props.class

  const transformKeys = [
    'fit',
    'quality',
    'format',
    'focalX',
    'focalY',
    'cropX',
    'cropY',
    'cropWidth',
    'cropHeight',
  ]
  const hasTransforms = transformKeys.some((key) => {
    const value = props[key]
    return value !== undefined && value !== null && value !== ''
  })

  const sanitizedNode: JSONContent = {
    ...node,
    attrs: {
      ...(node.attrs || {}),
      props: {},
    },
  }

  if (imageOutput === 'markdown') {
    return createElement(sanitizedNode, context, 'img', { props: imageProps })
  }

  if (props.id || hasTransforms) {
    return createElement(sanitizedNode, context, 'image', { props: imageProps })
  }

  const tag = node.attrs?.tag
  if (tag === 'nuxt-img' || tag === 'nuxt-picture') {
    return createElement(sanitizedNode, context, tag, { props: imageProps })
  }

  return createElement(sanitizedNode, context, 'img', { props: imageProps })
}

function createLinkElement(node: JSONContent): MDCElement {
  const attrs = node.attrs || {}
  const { class: className, href, rel, target, ...otherAttrs } = attrs
  const linkProps: Record<string, string> = {}

  if (href) linkProps.href = href
  if (target) linkProps.target = target
  if (rel) linkProps.rel = rel
  if (className) linkProps.class = className

  Object.assign(linkProps, otherAttrs)

  return { children: node.children || [], props: linkProps, tag: 'a', type: 'element' }
}

function createListItemElement(node: JSONContent, context: TiptapToMDCContext) {
  const flattenedContent = (node.content || []).flatMap((child: JSONContent) => {
    if (child.type === 'paragraph') {
      return child.content
    }
    return child
  })
  node.content = flattenedContent

  const hasMeaningfulContent = flattenedContent.some((child: JSONContent) => {
    if (!child) return false
    if (child.type === 'text') {
      return (child.text || '').trim().length > 0
    }
    return true
  })

  if (!hasMeaningfulContent) {
    return []
  }
  return createElement(node, context, 'li')
}

function createTextElement(node: JSONContent, context: TiptapToMDCContext): MDCText | MDCText[] {
  const textValue = node.text || ''
  const prefix = textValue.match(RE_TEXT_LEADING_SPACE)?.[0] || ''
  const suffix = textValue.match(RE_TEXT_TRAILING_SPACE)?.[0] || ''
  const text = textValue.trim()

  if (!node.marks?.length) {
    return { type: 'text', value: textValue }
  }

  const res = node.marks.reduce(
    (acc: MDCText, mark: JsonRecord) => {
      const markType = mark.type as string
      if (markType && tiptapToMDCMap[markType]) {
        return tiptapToMDCMap[markType]!({ ...mark, children: [acc] }, context) as MDCText
      }
      return acc
    },
    { type: 'text', value: text },
  )

  const result: (MDCText | null)[] = []
  if (prefix) result.push({ type: 'text', value: prefix })
  result.push(res)
  if (suffix) result.push({ type: 'text', value: suffix })

  return result.filter(Boolean) as MDCText[]
}

function createVideoElement(node: JSONContent, context: TiptapToMDCContext): MDCElement {
  const props = node.attrs?.props || {}
  const videoProps: JsonRecord = {}

  if (node.attrs?.src) videoProps.src = node.attrs.src
  if (node.attrs?.title) videoProps.title = node.attrs.title
  if (node.attrs?.width) videoProps.width = node.attrs.width
  if (node.attrs?.height) videoProps.height = node.attrs.height
  if (props.src) videoProps.src = props.src
  if (props.title) videoProps.title = props.title
  if (props.width) videoProps.width = props.width
  if (props.height) videoProps.height = props.height

  return createElement(node, context, 'video', { props: videoProps })
}

function getNodeContent(node: JSONContent) {
  if (node.type === 'text') {
    return node.text
  }

  let content = ''
  node.content?.forEach((childNode) => {
    content += getNodeContent(childNode)
  })

  return content
}

function mergeSiblingsWithSameTag(children: MDCNode[], allowedTags: string[]): MDCNode[] {
  if (!Array.isArray(children)) {
    return children
  }

  const merged: MDCNode[] = []
  let i = 0

  while (i < children.length) {
    const current = children[i]
    const next = children[i + 1]
    const afterNext = children[i + 2]

    const canMerge =
      current &&
      afterNext &&
      current.type === 'element' &&
      afterNext.type === 'element' &&
      current.tag === afterNext.tag &&
      allowedTags.includes(current.tag) &&
      JSON.stringify(current.props || {}) === JSON.stringify(afterNext.props || {}) &&
      next &&
      next.type === 'text' &&
      next.value === ' '

    if (canMerge) {
      merged.push({
        ...current,
        children: [
          ...(current.children || []),
          { type: 'text', value: ' ' },
          ...(afterNext.children || []),
        ],
      })
      i += 3
    } else if (current) {
      merged.push(current)
      i++
    } else {
      i++
    }
  }

  return merged
}

function summarizeTiptap(node: JSONContent) {
  const stats = {
    nodes: 0,
    nodeTypes: [] as string[],
  }

  const walk = (current: JSONContent) => {
    stats.nodes += 1
    if (current.type) stats.nodeTypes.push(current.type)
    ;(current.content || []).forEach((child) => walk(child))
  }

  walk(node)

  return {
    ...stats,
    nodeTypes: [...new Set(stats.nodeTypes)],
  }
}

function unwrapDefaultSlot(content: JSONContent[]): JSONContent[] {
  if (content.length === 1 && content[0]?.type === 'slot' && content[0].attrs?.name === 'default') {
    return content[0].content || []
  }
  return content
}

function unwrapParagraph(content: JSONContent[]): JSONContent[] {
  if (content.length === 1 && content[0]?.type === 'paragraph') {
    return content[0].content || []
  }
  return content
}
