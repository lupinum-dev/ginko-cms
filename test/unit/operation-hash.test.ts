import { afterEach, describe, expect, it, vi } from 'vitest'

import { createToken } from '../../packages/convex/src/operationHash'

describe('operation confirmation randomness', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses secure random bytes when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(0xab)
        return bytes
      },
    })

    expect(createToken()).toBe('ab'.repeat(32))
  })

  it('fails closed when the platform provides no secure randomness', () => {
    vi.stubGlobal('crypto', {})

    expect(() => createToken()).toThrow(/secure platform randomness/i)
  })
})
