import { describe, expect, it } from 'vitest'

import type { CmsField } from '#component/lib/types.js'
import { assertFieldDataValid, MAX_FIELD_NESTING_DEPTH } from '#component/lib/validation.js'

function makeNestedObjectField(depth: number, key = 'root'): CmsField {
  if (depth <= 0) {
    return { key, type: 'text', label: key } as CmsField
  }
  return {
    key,
    type: 'object',
    label: key,
    fields: [makeNestedObjectField(depth - 1, 'nested')],
  } as CmsField
}

function makeNestedObjectData(depth: number): Record<string, unknown> {
  if (depth <= 0) {
    return { nested: 'value' }
  }
  return { nested: makeNestedObjectData(depth - 1) }
}

describe('field nesting depth limit', () => {
  it('allows fields within the depth limit', () => {
    const field = makeNestedObjectField(MAX_FIELD_NESTING_DEPTH)
    const data = { root: makeNestedObjectData(MAX_FIELD_NESTING_DEPTH - 1) }

    expect(() => assertFieldDataValid([field], data)).not.toThrow()
  })

  it('rejects fields exceeding the depth limit', () => {
    const field = makeNestedObjectField(MAX_FIELD_NESTING_DEPTH + 2)
    const data = { root: makeNestedObjectData(MAX_FIELD_NESTING_DEPTH + 1) }

    expect(() => assertFieldDataValid([field], data)).toThrow()
  })

  it('rejects deeply nested arrays exceeding the depth limit', () => {
    const innerField: CmsField = {
      key: 'item',
      type: 'object',
      label: 'Item',
      fields: [makeNestedObjectField(MAX_FIELD_NESTING_DEPTH, 'deep')],
    } as CmsField

    const outerField: CmsField = {
      key: 'list',
      type: 'array',
      label: 'List',
      fields: [innerField],
    } as CmsField

    const data = {
      list: [{ item: { deep: makeNestedObjectData(MAX_FIELD_NESTING_DEPTH - 1) } }],
    }

    expect(() => assertFieldDataValid([outerField], data)).toThrow()
  })

  it('exports MAX_FIELD_NESTING_DEPTH as 5', () => {
    expect(MAX_FIELD_NESTING_DEPTH).toBe(5)
  })
})
