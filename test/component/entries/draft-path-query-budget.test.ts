import { describe, expect, it, vi } from 'vitest'

import { assertNoDraftSiblingPathConflict } from '../../../packages/convex/src/entries/draftPathConflicts'

function indexedResult(rows: unknown[]) {
  return {
    collect: async () => rows,
    first: async () => rows[0] ?? null,
  }
}

describe('draft sibling query budget', () => {
  it('loads one draft-row set per sibling regardless of locale count or unrelated entries', async () => {
    const moving = {
      _id: 'moving',
      collectionId: 'collection',
      baseSlug: 'moving',
      parentEntryId: null,
      stableId: null,
    }
    const siblings = Array.from({ length: 3 }, (_, index) => ({
      _id: `sibling-${index}`,
      collectionId: 'collection',
      baseSlug: `sibling-${index}`,
      parentEntryId: null,
      stableId: null,
    }))
    const draftRows = new Map<string, unknown[]>([
      [
        'moving',
        [
          {
            entryId: 'moving',
            locale: null,
            parentEntryId: null,
            slug: 'moving',
          },
        ],
      ],
      ...siblings.map(
        (sibling, index) =>
          [
            sibling._id,
            [
              {
                entryId: sibling._id,
                locale: null,
                parentEntryId: null,
                slug: sibling.baseSlug,
              },
              {
                entryId: sibling._id,
                locale: 'de',
                localeSlug: `geschwister-${index}`,
              },
            ],
          ] as const,
      ),
    ])
    const queryCalls: Array<{ table: string; index: string }> = []
    const query = vi.fn((table: string) => ({
      withIndex: (index: string, configure: (q: unknown) => unknown) => {
        const conditions = new Map<string, unknown>()
        const q = {
          eq(field: string, value: unknown) {
            conditions.set(field, value)
            return q
          },
        }
        configure(q)
        queryCalls.push({ table, index })
        if (table === 'entries') return indexedResult(siblings)
        if (index === 'by_parent_override') return indexedResult([])
        return indexedResult(draftRows.get(String(conditions.get('entryId'))) ?? [])
      },
    }))

    await assertNoDraftSiblingPathConflict(
      {
        db: {
          query,
          get: vi.fn(async () => null),
        },
      } as never,
      {
        entry: moving as never,
        collection: {
          _id: 'collection',
          slug: 'docs',
          locales: ['en', 'de'],
          routing: {
            mode: 'route',
            pathPrefix: '/docs',
            slugMode: 'localized',
            rootSlug: null,
            singleton: false,
          },
          fields: [],
          settings: {},
        } as never,
        locales: ['en', 'de'],
      },
    )

    expect(queryCalls.filter((call) => call.table === 'entries')).toHaveLength(1)
    expect(queryCalls.filter((call) => call.table === 'entryDrafts')).toHaveLength(
      2 + siblings.length,
    )
    expect(queryCalls.some((call) => call.table === 'publicEntries')).toBe(false)
  })
})
