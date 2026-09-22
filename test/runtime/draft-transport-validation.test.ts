import { describe, expect, it } from 'vitest'

import type { DraftSaveRequest } from '../../packages/cms/src/public/editing/session'
import { validateDraftSaveRequest } from '../../packages/cms/src/public/editing/transport'
import { CMS_JSON_MAX_DEPTH } from '../../packages/contract/src/types'
import type { JsonValue } from '../../packages/contract/src/types'

function request(value: JsonValue): DraftSaveRequest {
  return {
    entryId: 'entry',
    expectedDraftVersion: 1,
    patch: { locales: { en: { values: { blocks: value } } } },
    concurrency: {
      localeDraftIds: { en: 'en-draft' },
      requestId: 'request',
      base: { shared: { shared: { image: { id: 'image', alt: 'A tree' } } } },
    },
  }
}
function nested(depth: number): JsonValue {
  let value: JsonValue = 'Leaf'
  for (let i = 0; i < depth; i++) value = i % 2 ? { child: value } : [value]
  return value
}

describe('draft transport JSON boundary', () => {
  it('accepts the exact supported nested array/object limit without changing content', () => {
    const input = request(nested(CMS_JSON_MAX_DEPTH))
    const before = JSON.stringify(input)
    expect(() => validateDraftSaveRequest(input)).not.toThrow()
    expect(JSON.stringify(input)).toBe(before)
  })
  it('rejects excessive nesting and non-finite numbers as definitive field errors', () => {
    expect(() => validateDraftSaveRequest(request(nested(CMS_JSON_MAX_DEPTH + 1)))).toThrow(
      'levels of nesting',
    )
    expect(() => validateDraftSaveRequest(request(Number.NaN))).toThrow()
  })
  it('checks baseline fields as well as edited fields', () => {
    const input = request('Valid')
    input.concurrency.base = { shared: { shared: { tooDeep: nested(CMS_JSON_MAX_DEPTH + 1) } } }
    expect(() => validateDraftSaveRequest(input)).toThrow()
  })
})
