import { describe, expect, it } from 'vitest'

import {
  getCmsErrorCode,
  getCmsErrorData,
  getCmsErrorMessage,
} from '#ginko-cms-public/utils/cmsErrors'

describe('runtime cms error utilities', () => {
  it('extracts structured CMS error payloads', () => {
    const error = {
      data: {
        code: 'ENTRY_CONCURRENT_EDIT',
        message: 'This entry changed in another session. Reload and try again.',
        details: { entryId: 'entry-1' },
      },
    }

    expect(getCmsErrorData(error)).toEqual(error.data)
    expect(getCmsErrorCode(error)).toBe('ENTRY_CONCURRENT_EDIT')
    expect(getCmsErrorMessage(error, 'fallback')).toBe(
      'This entry changed in another session. Reload and try again.',
    )
  })

  it('extracts serialized structured CMS error payloads', () => {
    const data = {
      code: 'ENTRY_CONCURRENT_EDIT',
      message: 'This entry changed in another session. Reload and try again.',
      details: { entryId: 'entry-1' },
    }
    const error = {
      data: JSON.stringify(data),
    }

    expect(getCmsErrorData(error)).toEqual(data)
    expect(getCmsErrorCode(error)).toBe('ENTRY_CONCURRENT_EDIT')
    expect(getCmsErrorMessage(error, 'fallback')).toBe(
      'This entry changed in another session. Reload and try again.',
    )
  })

  it('falls back cleanly for unstructured errors', () => {
    expect(getCmsErrorData(new Error('boom'))).toBeNull()
    expect(getCmsErrorCode(new Error('boom'))).toBeNull()
    expect(getCmsErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
    expect(getCmsErrorMessage(null, 'fallback')).toBe('fallback')
  })
})
