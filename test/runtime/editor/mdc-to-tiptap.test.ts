import { describe, expect, it } from 'vitest'

import { parseMdc } from '../../../packages/cms/studio-app/src/editor/lib/markdown'
import { mdcToTiptap } from '../../../packages/cms/studio-app/src/editor/lib/mdcToTiptap'

describe('editor mdcToTiptap', () => {
  it('converts headings, paragraphs, and lists into a doc tree', async () => {
    const ast = await parseMdc(['# Title', '', 'Hello **world**', '', '- One', '- Two'].join('\n'))

    const doc = mdcToTiptap(ast)

    expect(doc.type).toBe('doc')
    expect(doc.content?.[0]?.type).toBe('heading')
    expect(doc.content?.[1]?.type).toBe('paragraph')
    expect(doc.content?.[2]?.type).toBe('bulletList')
  })

  it('keeps custom inline component tags as inline elements', async () => {
    const ast = await parseMdc('Before :Badge{tone="info"} after')
    const doc = mdcToTiptap(ast)
    const paragraph = doc.content?.[0]
    const inlineElement = paragraph?.content?.find((node) => node.type === 'inline-element')

    expect(paragraph?.type).toBe('paragraph')
    expect(String(inlineElement?.attrs?.tag)).toBe('Badge')
  })
})
