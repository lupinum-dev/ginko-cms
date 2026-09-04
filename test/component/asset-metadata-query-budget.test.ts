import { describe, expect, it, vi } from 'vitest'

import { createDraftEntryTitleResolver } from '../../packages/convex/src/entries/labels'

describe('asset entry-title query budget', () => {
  it('resolves each shared row and entry-locale row only once', async () => {
    const rows = [
      {
        entryId: 'entry-1',
        locale: 'en',
        values: { title: 'English title' },
      },
      {
        entryId: 'entry-1',
        locale: 'de',
        values: { title: 'Deutscher Titel' },
      },
    ]
    const queries: Array<string | null> = []
    const ctx = {
      db: {
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
            const locale = conditions.get('locale') as string | null
            queries.push(locale)
            return {
              unique: async () =>
                rows.find(
                  (row) => row.entryId === conditions.get('entryId') && row.locale === locale,
                ) ?? null,
            }
          },
        })),
      },
    }
    const resolveTitle = createDraftEntryTitleResolver(ctx as never)
    const entry = { _id: 'entry-1', slug: 'fallback', shared: {} }
    const collection = {
      fields: [{ key: 'title', type: 'text', localized: true }],
      settings: {},
    }

    await expect(
      Promise.all([
        resolveTitle({ entry: entry as never, collection: collection as never, locale: 'en' }),
        resolveTitle({ entry: entry as never, collection: collection as never, locale: 'en' }),
        resolveTitle({ entry: entry as never, collection: collection as never, locale: 'de' }),
      ]),
    ).resolves.toEqual(['English title', 'English title', 'Deutscher Titel'])
    expect(queries).toEqual(['en', 'de'])
  })
})
