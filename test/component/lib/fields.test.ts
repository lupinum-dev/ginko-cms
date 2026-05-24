import { normalizeFields } from '@lupinum/ginko-cms-contract/shared/fields/normalize.js'
import { describe, expect, it } from 'vitest'

// NOTE: Canonical tests for the shared field engine live in test/shared/fields.test.ts.
// These tests verify the re-export path from packages/convex/src/lib/ still works.
describe('component lib fields', () => {
  it('normalizes fields with recursive defaults', () => {
    const fields = normalizeFields([
      { key: 'title', type: 'string' },
      {
        key: 'seo',
        type: 'object',
        fields: [
          { key: 'description', type: 'textarea' },
          { key: 'keywords', type: 'multiselect' },
        ],
      },
    ])

    expect(fields[0]).toMatchObject({
      key: 'title',
      type: 'text',
      required: false,
      localized: false,
      width: 'full',
    })
    expect(fields[1]?.fields?.[1]).toMatchObject({
      key: 'keywords',
      type: 'multiselect',
    })
    expect(fields[0]?.description).toBeNull()
    expect(fields[0]?.options).toBeNull()
  })
})
