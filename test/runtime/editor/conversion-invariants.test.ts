import type { JSONContent } from '@tiptap/vue-3'
import { describe, expect, it } from 'vitest'

import { validateTiptapDocShape } from '../../../packages/cms/studio-app/src/editor/lib/conversionInvariants'

describe('editor conversion invariants', () => {
  it('flags inline nodes at document root', () => {
    const doc: JSONContent = {
      content: [{ type: 'text', text: 'hello' }],
      type: 'doc',
    }

    const issues = validateTiptapDocShape(doc)

    expect(issues.some((issue) => issue.code === 'inline_node_at_root')).toBe(true)
  })

  it('accepts a basic paragraph document', () => {
    const doc: JSONContent = {
      content: [
        {
          content: [{ type: 'text', text: 'hello' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    }

    const issues = validateTiptapDocShape(doc)

    expect(issues).toEqual([])
  })
})
