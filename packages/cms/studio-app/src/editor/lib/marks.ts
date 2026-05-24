import type { JSONContent } from '@tiptap/vue-3'

import { editorDebug } from './debug'
import type { MDCElement, MDCNode, MDCText } from './mdcTypes'

export const tagToMark: Record<string, string> = {
  a: 'link',
  code: 'code',
  del: 'strike',
  em: 'italic',
  strong: 'bold',
}

function getNodeContent(node: MDCNode): string {
  if (node.type === 'text') {
    return node.value
  }

  let content = ''
  ;(node as MDCElement).children?.forEach((childNode) => {
    content += getNodeContent(childNode)
  })

  return content
}

export function createMark(
  node: MDCNode,
  mark: string,
  accumulatedMarks: { attrs?: object; type: string }[] = [],
  convertNode?: (node: MDCNode, parent?: MDCNode) => JSONContent,
): JSONContent[] {
  const attrs = { ...(node as MDCElement).props }

  if (mark === 'link' && attrs.href) {
    const href = String(attrs.href)
    const isExternal = href.startsWith('http://') || href.startsWith('https://')
    if (isExternal) {
      attrs.target = attrs.target || '_blank'
      attrs.rel = attrs.rel || 'noopener noreferrer nofollow'
    }
  }

  const marks = [...accumulatedMarks, { attrs, type: mark }]

  if (node.type === 'element' && node.tag === 'code') {
    const text = getNodeContent(node)
    editorDebug.log('createMark: code element', {
      children: (node as MDCElement).children,
      isEmpty: !text,
      marks: marks.map((m) => m.type),
      text,
    })
    if (!text) {
      editorDebug.warn('createMark: skipping empty code element', {
        marks: marks.map((m) => m.type),
      })
      return []
    }
    return [
      {
        marks: [...marks].reverse(),
        text,
        type: 'text',
      },
    ]
  }

  const children = (node as MDCElement).children || []
  const result: (JSONContent | null)[] = []

  for (const child of children) {
    if (child.type === 'text') {
      const text = getNodeContent(child)
      if (!text) {
        editorDebug.warn('createMark: skipping empty text node', {
          childValue: (child as MDCText).value,
          marks: marks.map((m) => m.type),
        })
        continue
      }
      result.push({
        marks: [...marks].reverse(),
        text,
        type: 'text',
      })
    } else if (child.type === 'element' && child.tag && tagToMark[child.tag]) {
      const markResult = createMark(child, tagToMark[child.tag]!, marks, convertNode)
      result.push(...markResult)
    } else if (child.type === 'element' && convertNode) {
      const tiptapNode = convertNode(child, node)
      if (tiptapNode.content?.length) {
        tiptapNode.content.forEach((contentNode) => {
          if (contentNode.type === 'text') {
            contentNode.marks = [...marks].reverse()
          }
        })
      }
      result.push(tiptapNode)
    } else if (convertNode) {
      result.push(convertNode(child, node))
    }
  }

  return result.filter((item): item is JSONContent => item !== null && item !== undefined)
}
