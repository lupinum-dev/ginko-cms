import {
  isPlainObject,
  resolveContextValue,
  emptyForType,
  structuredCloneSafe,
} from '@lupinum/ginko-cms-contract/shared/utils.js'
import { describe, expect, it } from 'vitest'

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject(Object.create(null))).toBe(true)
  })

  it('returns false for arrays', () => {
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject([1, 2])).toBe(false)
  })

  it('returns false for null and undefined', () => {
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject(undefined)).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isPlainObject(42)).toBe(false)
    expect(isPlainObject('hello')).toBe(false)
    expect(isPlainObject(true)).toBe(false)
    expect(isPlainObject(Symbol())).toBe(false)
  })

  it('returns true for class instances (they are still objects)', () => {
    // Note: isPlainObject checks typeof === 'object' && !Array.isArray,
    // so class instances and Date objects will return true
    expect(isPlainObject(new Date())).toBe(true)

    class Foo {
      x = 1
    }
    expect(isPlainObject(new Foo())).toBe(true)
  })
})

describe('resolveContextValue', () => {
  it('resolves top-level keys', () => {
    expect(resolveContextValue({ name: 'Alice' }, 'name')).toBe('Alice')
  })

  it('resolves nested paths', () => {
    const ctx = { a: { b: { c: 42 } } }
    expect(resolveContextValue(ctx, 'a.b.c')).toBe(42)
  })

  it('returns undefined for missing paths', () => {
    expect(resolveContextValue({ a: 1 }, 'b')).toBeUndefined()
    expect(resolveContextValue({ a: 1 }, 'a.b.c')).toBeUndefined()
  })

  it('returns undefined when traversing through a non-object', () => {
    expect(resolveContextValue({ a: 'string' }, 'a.b')).toBeUndefined()
    expect(resolveContextValue({ a: 42 }, 'a.b')).toBeUndefined()
  })

  it('handles empty path segments gracefully via filter(Boolean)', () => {
    const ctx = { a: { b: 10 } }
    // ".a..b." should resolve the same as "a.b" because empty segments are filtered
    expect(resolveContextValue(ctx, '.a..b.')).toBe(10)
  })

  it('handles empty string path', () => {
    // All segments filtered out → reduce starts with context itself
    expect(resolveContextValue({ a: 1 }, '')).toMatchObject({ a: 1 })
  })
})

describe('emptyForType', () => {
  describe('text-like types', () => {
    const textTypes = [
      'text',
      'textarea',
      'richtext',
      'email',
      'url',
      'slug',
      'date',
      'datetime',
      'time',
      'code',
      'icon',
      'color',
    ]
    for (const type of textTypes) {
      it(`${type}: empty for "", null, undefined`, () => {
        expect(emptyForType(type, '')).toBe(true)
        expect(emptyForType(type, null)).toBe(true)
        expect(emptyForType(type, undefined)).toBe(true)
      })

      it(`${type}: not empty for non-empty strings`, () => {
        expect(emptyForType(type, 'hello')).toBe(false)
        expect(emptyForType(type, ' ')).toBe(false)
      })
    }
  })

  describe('number/range types', () => {
    for (const type of ['number', 'range']) {
      it(`${type}: empty for null, undefined`, () => {
        expect(emptyForType(type, null)).toBe(true)
        expect(emptyForType(type, undefined)).toBe(true)
      })

      it(`${type}: not empty for 0`, () => {
        expect(emptyForType(type, 0)).toBe(false)
      })

      it(`${type}: not empty for positive/negative numbers`, () => {
        expect(emptyForType(type, 1)).toBe(false)
        expect(emptyForType(type, -1)).toBe(false)
      })
    }
  })

  describe('checkbox/toggle types', () => {
    for (const type of ['checkbox', 'toggle']) {
      it(`${type}: empty for null, undefined`, () => {
        expect(emptyForType(type, null)).toBe(true)
        expect(emptyForType(type, undefined)).toBe(true)
      })

      it(`${type}: not empty for false`, () => {
        expect(emptyForType(type, false)).toBe(false)
      })

      it(`${type}: not empty for true`, () => {
        expect(emptyForType(type, true)).toBe(false)
      })
    }
  })

  describe('array-like types', () => {
    for (const type of ['multiselect', 'images', 'relations', 'array', 'blocks']) {
      it(`${type}: empty for [], null, undefined`, () => {
        expect(emptyForType(type, [])).toBe(true)
        expect(emptyForType(type, null)).toBe(true)
        expect(emptyForType(type, undefined)).toBe(true)
      })

      it(`${type}: not empty for non-empty arrays`, () => {
        expect(emptyForType(type, [1])).toBe(false)
        expect(emptyForType(type, ['a', 'b'])).toBe(false)
      })
    }
  })

  describe('unknown type falls back to null/undefined check', () => {
    it('empty for null and undefined', () => {
      expect(emptyForType('unknown_type', null)).toBe(true)
      expect(emptyForType('unknown_type', undefined)).toBe(true)
    })

    it('not empty for any other value', () => {
      expect(emptyForType('unknown_type', '')).toBe(false)
      expect(emptyForType('unknown_type', 0)).toBe(false)
      expect(emptyForType('unknown_type', false)).toBe(false)
    })
  })
})

describe('structuredCloneSafe', () => {
  it('returns null and undefined as-is', () => {
    expect(structuredCloneSafe(null)).toBeNull()
    expect(structuredCloneSafe(undefined)).toBeUndefined()
  })

  it('deep-clones objects', () => {
    const original = { a: { b: [1, 2, 3] } }
    const cloned = structuredCloneSafe(original)
    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned.a).not.toBe(original.a)
    expect(cloned.a.b).not.toBe(original.a.b)
  })

  it('deep-clones arrays', () => {
    const original = [{ x: 1 }, { x: 2 }]
    const cloned = structuredCloneSafe(original)
    expect(cloned).toEqual(original)
    expect(cloned[0]).not.toBe(original[0])
  })

  it('clones primitive values', () => {
    expect(structuredCloneSafe(42)).toBe(42)
    expect(structuredCloneSafe('hello')).toBe('hello')
    expect(structuredCloneSafe(true)).toBe(true)
  })
})
