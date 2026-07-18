import { describe, expect, it, vi } from 'vitest'

import {
  loadAssetOwnerMetadata,
  mapAssetReferenceUsages,
} from '../../packages/convex/src/assets/relationships'

describe('asset relationships', () => {
  it('keeps default-locale owner metadata separate from localized usage metadata', async () => {
    const documents = new Map<string, Record<string, unknown>>([
      [
        'entry-1',
        {
          _id: 'entry-1',
          slug: 'fallback',
          collection: 'blog',
        },
      ],
    ])
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
                if (table === 'cmsContract') return null
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
            }
          },
        })),
      },
    }
    const asset = {
      _id: 'asset-1',
      scope: 'entry',
      entryId: 'entry-1',
      collection: 'blog',
    }
    const reference = {
      sourceKind: 'draft',
      sourceId: 'draft-1',
      assetId: 'asset-1',
      entryId: 'entry-1',
      collection: 'blog',
      locale: 'de',
      fieldPath: 'hero',
    }

    const ownerMetadata = await loadAssetOwnerMetadata(ctx as never, [asset] as never)
    const usages = await mapAssetReferenceUsages(ctx as never, [reference] as never)

    expect(ownerMetadata.entryById.get('entry-1')?.title).toBe('English owner')
    expect(usages).toEqual([
      expect.objectContaining({
        sourceKind: 'draft',
        sourceId: 'draft-1',
        locale: 'de',
        entryTitle: 'Deutsche Verwendung',
        collection: 'blog',
      }),
    ])
  })
})
