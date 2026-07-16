import { describe, expect, it, vi } from 'vitest'

import { loadAssetRelationships } from '../../packages/convex/src/assets/relationships'

describe('asset relationships', () => {
  it('keeps default-locale owner metadata separate from localized usage metadata', async () => {
    const documents = new Map<string, Record<string, unknown>>([
      [
        'asset-1',
        {
          _id: 'asset-1',
          scope: 'entry',
          entryId: 'entry-1',
          collectionId: 'collection-1',
        },
      ],
      [
        'entry-1',
        {
          _id: 'entry-1',
          baseSlug: 'fallback',
          collectionId: 'collection-1',
        },
      ],
      [
        'collection-1',
        {
          _id: 'collection-1',
          slug: 'blog',
          label: { en: 'Blog', de: 'Blog' },
          locales: ['en', 'de'],
          fields: [],
          settings: {},
          routing: {},
        },
      ],
    ])
    const referenceRows = [
      {
        assetId: 'asset-1',
        entryId: 'entry-1',
        collectionId: 'collection-1',
        locale: 'de',
        fieldPath: 'hero',
      },
    ]
    const publicRows = [
      { entryId: 'entry-1', locale: 'en', title: 'English owner' },
      { entryId: 'entry-1', locale: 'de', title: 'Deutsche Verwendung' },
    ]
    const ctx = {
      db: {
        get: vi.fn(async (id: string) => documents.get(id) ?? null),
        query: vi.fn((table: string) => ({
          withIndex: (_index: string, configure: (q: unknown) => unknown) => {
            const conditions = new Map<string, unknown>()
            const q = {
              eq(field: string, value: unknown) {
                conditions.set(field, value)
                return q
              },
            }
            configure(q)
            return {
              first: async () => {
                if (table === 'cmsSettings') {
                  return {
                    locales: [
                      { code: 'en', label: 'English', isDefault: true },
                      { code: 'de', label: 'Deutsch', isDefault: false },
                    ],
                  }
                }
                if (table === 'publicEntries') {
                  return (
                    publicRows.find(
                      (row) =>
                        row.entryId === conditions.get('entryId') &&
                        row.locale === conditions.get('locale'),
                    ) ?? null
                  )
                }
                return null
              },
              collect: async () =>
                table === 'contentAssetRefs'
                  ? referenceRows.filter((row) => row.assetId === conditions.get('assetId'))
                  : [],
            }
          },
        })),
      },
    }

    const relationships = await loadAssetRelationships(ctx as never, new Set(['asset-1']))

    expect(relationships.entryById.get('entry-1')?.title).toBe('English owner')
    expect(relationships.usagesByAssetId.get('asset-1')).toEqual([
      expect.objectContaining({
        locale: 'de',
        entryTitle: 'Deutsche Verwendung',
      }),
    ])
  })
})
