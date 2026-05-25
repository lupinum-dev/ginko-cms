import {
  normalizeFieldType,
  normalizeField,
  normalizeFields,
  getFieldKey,
  evaluateFieldCondition,
  materializeFieldData,
  filterSortableValues,
} from '@lupinum/ginko-cms-contract/shared/fields'
import type { CmsField } from '@lupinum/ginko-cms-contract/shared/types.js'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// normalizeFieldType
// ---------------------------------------------------------------------------
describe('normalizeFieldType', () => {
  it('maps "string" to "text"', () => {
    expect(normalizeFieldType('string')).toBe('text')
  })

  it('maps "boolean" to "checkbox"', () => {
    expect(normalizeFieldType('boolean')).toBe('checkbox')
  })

  it('passes through known types unchanged', () => {
    expect(normalizeFieldType('text')).toBe('text')
    expect(normalizeFieldType('textarea')).toBe('textarea')
    expect(normalizeFieldType('number')).toBe('number')
    expect(normalizeFieldType('richtext')).toBe('richtext')
  })

  it('defaults to "text" when undefined', () => {
    expect(normalizeFieldType(undefined)).toBe('text')
  })
})

// ---------------------------------------------------------------------------
// getFieldKey
// ---------------------------------------------------------------------------
describe('getFieldKey', () => {
  it('returns the key when present', () => {
    expect(getFieldKey({ key: 'title' })).toBe('title')
  })

  it('returns empty string when key is missing', () => {
    expect(getFieldKey({})).toBe('')
  })
})

// ---------------------------------------------------------------------------
// normalizeField
// ---------------------------------------------------------------------------
describe('normalizeField', () => {
  it('throws when key is missing', () => {
    expect(() => normalizeField({})).toThrow('Field key is required')
  })

  it('sets all defaults for a minimal field', () => {
    const field = normalizeField({ key: 'title' })
    expect(field).toMatchObject({
      key: 'title',
      type: 'text',
      required: false,
      localized: false,
      hidden: false,
      searchable: false,
      sortable: false,
      order: 0,
      width: 'full',
      label: null,
      description: null,
      validation: null,
      condition: null,
      options: null,
      relation: null,
      min: null,
      max: null,
      step: null,
      slugFrom: null,
      language: null,
    })
    expect(field.fields).toEqual([])
  })

  it('normalizes the type alias', () => {
    expect(normalizeField({ key: 'a', type: 'string' }).type).toBe('text')
    expect(normalizeField({ key: 'b', type: 'boolean' }).type).toBe('checkbox')
  })

  it('preserves explicitly provided values', () => {
    const field = normalizeField({
      key: 'email',
      type: 'email',
      required: true,
      localized: true,
      width: 'half',
      label: 'Email Address',
    })
    expect(field.required).toBe(true)
    expect(field.localized).toBe(true)
    expect(field.width).toBe('half')
    expect(field.label).toBe('Email Address')
  })

  it('preserves media constraints for asset fields', () => {
    const field = normalizeField({
      key: 'hero',
      type: 'asset',
      media: {
        accept: ['image/png', 'image/jpeg'],
        aspectRatio: '16:9',
      },
    })

    expect(field.media).toEqual({
      accept: ['image/png', 'image/jpeg'],
      aspectRatio: '16:9',
    })
  })

  it('normalizes nested fields recursively', () => {
    const field = normalizeField({
      key: 'seo',
      type: 'object',
      fields: [
        { key: 'description', type: 'string' },
        { key: 'keywords', type: 'multiselect' },
      ],
    })
    expect(field.fields).toHaveLength(2)
    expect(field.fields![0]!.type).toBe('text') // "string" → "text"
    expect(field.fields![1]!.type).toBe('multiselect')
  })
})

// ---------------------------------------------------------------------------
// normalizeFields
// ---------------------------------------------------------------------------
describe('normalizeFields', () => {
  it('sorts by order and re-indexes', () => {
    const fields = normalizeFields([
      { key: 'c', order: 10 },
      { key: 'a', order: 0 },
      { key: 'b', order: 5 },
    ])
    expect(fields.map((f) => f.key)).toEqual(['a', 'b', 'c'])
    expect(fields.map((f) => f.order)).toEqual([0, 1, 2])
  })

  it('handles empty array', () => {
    expect(normalizeFields([])).toEqual([])
  })

  it('fields with same order preserve relative insertion order', () => {
    const fields = normalizeFields([
      { key: 'x', order: 0 },
      { key: 'y', order: 0 },
    ])
    // Both have order 0, sort is stable → original order kept
    expect(fields.map((f) => f.key)).toEqual(['x', 'y'])
  })
})

// ---------------------------------------------------------------------------
// evaluateFieldCondition
// ---------------------------------------------------------------------------
describe('evaluateFieldCondition', () => {
  it('returns true for null/undefined condition', () => {
    expect(evaluateFieldCondition(null, {})).toBe(true)
    expect(evaluateFieldCondition(undefined, {})).toBe(true)
  })

  it('returns true when no field/key is specified and no logical ops', () => {
    expect(evaluateFieldCondition({}, { x: 1 })).toBe(true)
  })

  describe('equals', () => {
    it('matches when values are equal', () => {
      expect(evaluateFieldCondition({ field: 'x', equals: 'y' }, { x: 'y' })).toBe(true)
    })

    it('fails when values differ', () => {
      expect(evaluateFieldCondition({ field: 'x', equals: 'y' }, { x: 'z' })).toBe(false)
    })

    it('uses strict equality', () => {
      expect(evaluateFieldCondition({ field: 'x', equals: 0 }, { x: false })).toBe(false)
    })
  })

  describe('notEquals', () => {
    it('matches when values differ', () => {
      expect(evaluateFieldCondition({ field: 'x', notEquals: 'y' }, { x: 'z' })).toBe(true)
    })

    it('fails when values are equal', () => {
      expect(evaluateFieldCondition({ field: 'x', notEquals: 'y' }, { x: 'y' })).toBe(false)
    })
  })

  describe('in', () => {
    it('matches when value is in array', () => {
      expect(evaluateFieldCondition({ field: 'x', in: ['a', 'b', 'c'] }, { x: 'b' })).toBe(true)
    })

    it('fails when value is not in array', () => {
      expect(evaluateFieldCondition({ field: 'x', in: ['a', 'b'] }, { x: 'z' })).toBe(false)
    })
  })

  describe('truthy', () => {
    it('truthy: true — passes for non-empty text values', () => {
      expect(evaluateFieldCondition({ field: 'x', truthy: true }, { x: 'hello' })).toBe(true)
    })

    it('truthy: true — fails for empty string', () => {
      expect(evaluateFieldCondition({ field: 'x', truthy: true }, { x: '' })).toBe(false)
    })

    it('truthy: true — fails for null/undefined', () => {
      expect(evaluateFieldCondition({ field: 'x', truthy: true }, { x: null })).toBe(false)
      expect(evaluateFieldCondition({ field: 'x', truthy: true }, {})).toBe(false)
    })

    it('truthy: false — passes for empty/null values', () => {
      expect(evaluateFieldCondition({ field: 'x', truthy: false }, { x: '' })).toBe(true)
      expect(evaluateFieldCondition({ field: 'x', truthy: false }, { x: null })).toBe(true)
    })

    it('truthy: false — fails for non-empty values', () => {
      expect(evaluateFieldCondition({ field: 'x', truthy: false }, { x: 'hello' })).toBe(false)
    })
  })

  describe('and', () => {
    it('all conditions must pass', () => {
      const condition = {
        and: [
          { field: 'a', equals: 1 },
          { field: 'b', equals: 2 },
        ],
      }
      expect(evaluateFieldCondition(condition, { a: 1, b: 2 })).toBe(true)
      expect(evaluateFieldCondition(condition, { a: 1, b: 99 })).toBe(false)
    })

    it('empty and-array returns true', () => {
      expect(evaluateFieldCondition({ and: [] }, {})).toBe(true)
    })
  })

  describe('or', () => {
    it('any condition can pass', () => {
      const condition = {
        or: [
          { field: 'a', equals: 1 },
          { field: 'b', equals: 2 },
        ],
      }
      expect(evaluateFieldCondition(condition, { a: 1, b: 99 })).toBe(true)
      expect(evaluateFieldCondition(condition, { a: 99, b: 2 })).toBe(true)
      expect(evaluateFieldCondition(condition, { a: 99, b: 99 })).toBe(false)
    })

    it('empty or-array returns false', () => {
      expect(evaluateFieldCondition({ or: [] }, {})).toBe(false)
    })
  })

  describe('nested logical operators', () => {
    it('and inside or', () => {
      const condition = {
        or: [
          {
            and: [
              { field: 'a', equals: 1 },
              { field: 'b', equals: 2 },
            ],
          },
          { field: 'c', equals: 3 },
        ],
      }
      expect(evaluateFieldCondition(condition, { a: 1, b: 2, c: 0 })).toBe(true)
      expect(evaluateFieldCondition(condition, { a: 0, b: 0, c: 3 })).toBe(true)
      expect(evaluateFieldCondition(condition, { a: 0, b: 0, c: 0 })).toBe(false)
    })
  })

  it("supports 'key' as alias for 'field'", () => {
    expect(evaluateFieldCondition({ key: 'x', equals: 5 }, { x: 5 })).toBe(true)
  })

  it('ignores non-plain-object items in and/or arrays', () => {
    // Non-object items are passed as undefined → evaluateFieldCondition(undefined, ctx) → true
    expect(evaluateFieldCondition({ and: [null, 42, 'bad'] }, {})).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// materializeFieldData
// ---------------------------------------------------------------------------
describe('materializeFieldData', () => {
  const makeField = (overrides: Partial<CmsField> & { key: string }): CmsField =>
    normalizeField(overrides)

  it('picks from sharedData for non-localized fields', () => {
    const fields = [makeField({ key: 'title', type: 'text' })]
    const result = materializeFieldData(fields, { title: 'Hello' }, { title: 'Ignored' })
    expect(result.title).toBe('Hello')
  })

  it('picks from localizedData for localized fields', () => {
    const fields = [makeField({ key: 'title', type: 'text', localized: true })]
    const result = materializeFieldData(fields, { title: 'Ignored' }, { title: 'Localized' })
    expect(result.title).toBe('Localized')
  })

  it('applies defaultValue for missing fields', () => {
    const fields = [makeField({ key: 'color', type: 'text', defaultValue: 'red' })]
    const result = materializeFieldData(fields, {}, {})
    expect(result.color).toBe('red')
  })

  it('uses empty object as default for object-type fields', () => {
    const fields = [makeField({ key: 'meta', type: 'object' })]
    const result = materializeFieldData(fields, {}, {})
    expect(result.meta).toEqual({})
  })

  it('uses empty array as default for array-like types', () => {
    for (const type of ['array', 'blocks', 'images', 'relations', 'multiselect']) {
      const fields = [makeField({ key: 'items', type })]
      const result = materializeFieldData(fields, {}, {})
      expect(result.items).toEqual([])
    }
  })

  it('handles nested object fields with sub-field defaults', () => {
    const fields = [
      makeField({
        key: 'seo',
        type: 'object',
        fields: [
          { key: 'title', type: 'text', defaultValue: 'Default Title' },
          { key: 'desc', type: 'text' },
        ],
      }),
    ]
    const result = materializeFieldData(fields, {}, {})
    expect(result.seo).toEqual({ title: 'Default Title' })
  })

  it('handles array fields with per-item sub-field normalization', () => {
    const fields = [
      makeField({
        key: 'items',
        type: 'array',
        fields: [
          { key: 'name', type: 'text', defaultValue: 'unnamed' },
          { key: 'count', type: 'number' },
        ],
      }),
    ]
    const result = materializeFieldData(fields, { items: [{ count: 5 }] }, {})
    expect(result.items).toEqual([{ name: 'unnamed', count: 5 }])
  })

  it('returns only fields present in the schema', () => {
    const fields = [makeField({ key: 'title', type: 'text' })]
    const result = materializeFieldData(fields, { title: 'Yes', extra: 'No' }, {})
    expect(result).toEqual({ title: 'Yes' })
    expect(result).not.toHaveProperty('extra')
  })
})

// ---------------------------------------------------------------------------
// filterSortableValues
// ---------------------------------------------------------------------------
describe('filterSortableValues', () => {
  const makeField = (overrides: Partial<CmsField> & { key: string }): CmsField =>
    normalizeField(overrides)

  it('returns only sortable fields', () => {
    const fields = [
      makeField({ key: 'title', type: 'text', sortable: true }),
      makeField({ key: 'body', type: 'text', sortable: false }),
      makeField({ key: 'date', type: 'date', sortable: true }),
    ]
    const data = { title: 'Hi', body: 'Lots of text', date: '2025-01-01' }
    const result = filterSortableValues(fields, data)
    expect(result).toEqual({ title: 'Hi', date: '2025-01-01' })
  })

  it('returns null for missing sortable values', () => {
    const fields = [makeField({ key: 'title', type: 'text', sortable: true })]
    const result = filterSortableValues(fields, {})
    expect(result).toEqual({ title: null })
  })

  it('returns empty object when no fields are sortable', () => {
    const fields = [makeField({ key: 'title', type: 'text' })]
    const result = filterSortableValues(fields, { title: 'Hi' })
    expect(result).toEqual({})
  })
})
