import { editorDebug } from './debug'
import type { MDCNode, MDCRoot } from './mdcTypes'

export function stripStyleNodes(root: MDCRoot, source?: string): MDCRoot {
  let removed = 0

  const walk = (node: MDCNode | MDCRoot): MDCNode | MDCRoot | null => {
    if (node.type === 'element' && node.tag === 'style') {
      removed += 1
      return null
    }

    if (node.type === 'element') {
      const children = (node.children || [])
        .map((child) => walk(child))
        .filter(Boolean) as MDCNode[]
      return { ...node, children }
    }

    if (node.type === 'root') {
      const children = (node.children || [])
        .map((child) => walk(child))
        .filter(Boolean) as MDCNode[]
      return { ...node, children }
    }

    return node
  }

  const cleaned = walk(root) as MDCRoot
  if (removed > 0) {
    editorDebug.warn('Removed style nodes', { removed, source })
  }
  return cleaned
}
