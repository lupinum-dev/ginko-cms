import { describe, expect, it } from 'vitest'

import { orderStudioTreeRows } from '../../packages/cms/studio-app/src/lib/studioTree'

describe('Studio tree ordering', () => {
  const row = (input: { id: string; parent?: string | null; order?: string; path: string }) => ({
    _id: input.id,
    parentEntryId: input.parent ?? null,
    orderRank: input.order ?? 'a0',
    path: input.path,
  })

  it('computes depth from parent links and keeps descendants with their parent', () => {
    const ordered = orderStudioTreeRows([
      row({ id: 'code-blocks', order: 'a0', path: '/docs/code-blocks' }),
      row({ id: 'fallback-lab', order: 'b0', path: '/docs/fallback-lab' }),
      row({ id: 'images', order: 'c0', path: '/docs/images-embeds' }),
      row({ id: 'markdown', order: 'd0', path: '/docs/markdown-syntax' }),
      row({ id: 'prose', order: 'e0', path: '/docs/prose-components' }),
      row({ id: 'getting-started', order: 'f0', path: '/docs/getting-started' }),
      row({
        id: 'usage',
        parent: 'getting-started',
        order: 'a0',
        path: '/docs/getting-started/usage',
      }),
      row({
        id: 'installation',
        parent: 'prose',
        order: 'a0',
        path: '/docs/prose-components/installation',
      }),
    ])

    expect(ordered.map((item) => item._id)).toEqual([
      'code-blocks',
      'fallback-lab',
      'images',
      'markdown',
      'prose',
      'installation',
      'getting-started',
      'usage',
    ])
    expect(ordered.find((item) => item._id === 'prose')?.depth).toBe(0)
    expect(ordered.find((item) => item._id === 'installation')?.depth).toBe(1)
  })

  it('treats rows with filtered parents as roots', () => {
    const ordered = orderStudioTreeRows([
      row({ id: 'child', parent: 'missing-parent', order: 'a0', path: '/docs/root/child' }),
      row({ id: 'root-b', order: 'b0', path: '/docs/root-b' }),
    ])

    expect(ordered.map((item) => [item._id, item.depth])).toEqual([
      ['child', 0],
      ['root-b', 0],
    ])
  })
})
