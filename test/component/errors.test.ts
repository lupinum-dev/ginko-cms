import { describe, expect, it } from 'vitest'

import { throwInvalidCursorOrRethrow } from '#component/errors'
import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

describe('component cms error helpers', () => {
  it('maps follow-up page failures with a cursor to INVALID_CURSOR', () => {
    const original = new Error('boom')

    let thrown: unknown
    try {
      throwInvalidCursorOrRethrow(
        original,
        'Cursor no longer points to a studio entry',
        'next-page-cursor',
      )
    } catch (error) {
      thrown = error
    }

    expect(getCmsErrorData(thrown)).toMatchObject({
      code: 'INVALID_CURSOR',
      message: 'Cursor no longer points to a studio entry',
      details: { cursor: 'next-page-cursor' },
    })
  })

  it('rethrows the original error when the first page has no cursor', () => {
    const original = new Error('boom')

    let thrown: unknown
    try {
      throwInvalidCursorOrRethrow(original, 'Cursor no longer points to a studio entry', null)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(original)
    expect(getCmsErrorData(thrown)).toBeNull()
  })
})
