import { describe, expect, it } from 'vitest'

import { parseMdc, stringifyMdc } from '../../../packages/cms/studio-app/src/editor/lib/markdown'
import type {
  MDCElement,
  MDCNode,
  MDCRoot,
} from '../../../packages/cms/studio-app/src/editor/lib/mdcTypes'

function findElementByTag(root: MDCRoot, tag: string): MDCElement | null {
  const queue: Array<MDCElement | MDCRoot> = [root]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || (current.type !== 'element' && current.type !== 'root')) {
      continue
    }
    if (current.type === 'element' && current.tag === tag) {
      return current
    }
    for (const child of current.children || []) {
      queue.push(child as MDCElement)
    }
  }
  return null
}

describe('editor markdown conversion helpers', () => {
  it('normalizes and restores legacy --attribute syntax in parseMdc', async () => {
    const markdown = ':badge{ --variant="info" } Hello'
    const ast = await parseMdc(markdown)
    const badge = findElementByTag(ast, 'badge')

    expect(badge).not.toBeNull()
    expect(badge?.props?.['--variant']).toBe('info')
    expect(badge?.props?.['data-variant']).toBeUndefined()
  })

  it('supports strict stringify mode while preserving non-strict fallback behavior', async () => {
    const cyclicRoot: MDCRoot = { children: [], type: 'root' }
    const selfReferencingNode: MDCElement & { children: MDCNode[] } = {
      children: [],
      props: {},
      tag: 'p',
      type: 'element',
    }
    selfReferencingNode.children.push(selfReferencingNode)
    cyclicRoot.children.push(selfReferencingNode)

    await expect(stringifyMdc(cyclicRoot, { strict: true })).rejects.toBeTruthy()

    const fallback = await stringifyMdc(cyclicRoot, { strict: false })
    expect(fallback).toBe('')
  })
})
