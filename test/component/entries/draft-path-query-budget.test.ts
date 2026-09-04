import { describe, expect, it, vi } from 'vitest'

import { assertNoDraftSiblingPathConflict } from '../../../packages/convex/src/entries/draftPathConflicts'
import { resolveDraftAncestorSlugs } from '../../../packages/convex/src/entries/workflow/draftPlacement'

function indexedResult(rows: unknown[]) {
  return {
    collect: async () => rows,
    first: async () => rows[0] ?? null,
    unique: async () => rows[0] ?? null,
  }
}

describe('draft sibling query budget', () => {
  it('loads one draft-row set per sibling regardless of locale count or unrelated entries', async () => {
    const moving = {
      _id: 'moving',
      collection: 'docs',
      slug: 'moving',
      parentEntryId: null,
      stableId: 'move1',
    }
    const siblings = Array.from({ length: 3 }, (_, index) => ({
      _id: `sibling-${index}`,
      collection: 'docs',
      slug: `sibling-${index}`,
      parentEntryId: null,
      stableId: `sib0${index}`,
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
                locale: 'de',
                slug: `geschwister-${index}`,
              },
            ],
          ] as const,
      ),
    ])
    const queryCalls: Array<{ table: string; index: string; locale?: unknown }> = []
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
        queryCalls.push({ table, index, locale: conditions.get('locale') })
        if (table === 'entries') return indexedResult(siblings)
        return indexedResult(
          (draftRows.get(String(conditions.get('entryId'))) ?? []).filter(
            (row) => (row as { locale?: string }).locale === conditions.get('locale'),
          ),
        )
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
    const placementCalls = queryCalls.filter((call) => call.index === 'by_entry_locale')
    expect(placementCalls).toHaveLength((1 + siblings.length) * 2)
    expect(new Set(placementCalls.map((call) => call.locale))).toEqual(new Set(['en', 'de']))
    expect(queryCalls.filter((call) => call.index === 'by_entry')).toHaveLength(0)
    expect(queryCalls.some((call) => call.table === 'publicEntries')).toBe(false)
  })

  it('fails boundedly when legacy draft ancestry contains a cycle', async () => {
    const entries = new Map([
      ['entry-a', { _id: 'entry-a', slug: 'a', parentEntryId: null }],
      ['entry-b', { _id: 'entry-b', slug: 'b', parentEntryId: null }],
    ])
    entries.set('entry-a', { _id: 'entry-a', slug: 'a', parentEntryId: 'entry-b' })
    entries.set('entry-b', { _id: 'entry-b', slug: 'b', parentEntryId: 'entry-a' })
    const ctx = {
      db: {
        get: vi.fn(async (entryId: string) => entries.get(entryId) ?? null),
        query: vi.fn(() => ({
          withIndex: (_index: string, configure: (q: unknown) => unknown) => {
            const conditions = new Map<string, unknown>()
            const q = {
              eq(field: string, value: unknown) {
                conditions.set(field, value)
                return q
              },
            }
            configure(q)
            return { unique: async () => null }
          },
        })),
      },
    }

    await expect(
      resolveDraftAncestorSlugs(ctx as never, {
        parentEntryId: 'entry-a' as never,
        locale: 'en',
      }),
    ).rejects.toThrow('Draft ancestry contains a cycle')
    expect(ctx.db.get).toHaveBeenCalledTimes(4)
  })
})
