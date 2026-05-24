import { describe, expect, it } from 'vitest'

import { parseMdc, stringifyMdc } from '../../../packages/cms/studio-app/src/editor/lib/markdown'
import { mdcToTiptap } from '../../../packages/cms/studio-app/src/editor/lib/mdcToTiptap'
import { tiptapToMDC } from '../../../packages/cms/studio-app/src/editor/lib/tiptapToMdc'

describe('editor roundtrip', () => {
  it('round-trips headings, lists, and code blocks through the extracted converters', async () => {
    const markdown = [
      '# Title',
      '',
      'Paragraph with **bold** text.',
      '',
      '- One',
      '- Two',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
    ].join('\n')

    const ast = await parseMdc(markdown)
    const doc = mdcToTiptap(ast)
    const backToMdc = await tiptapToMDC(doc)
    const serialized = await stringifyMdc(backToMdc)
    const reparsed = await parseMdc(serialized)
    const roundTrippedDoc = mdcToTiptap(reparsed)

    expect(serialized).toContain('# Title')
    expect(serialized).toContain('One')
    expect(serialized).toContain('```ts')
    expect(serialized).toContain('const x = 1')
    expect(roundTrippedDoc.content?.[0]?.type).toBe('heading')
    expect(roundTrippedDoc.content?.some((node) => node.type === 'bulletList')).toBe(true)
  })
})
