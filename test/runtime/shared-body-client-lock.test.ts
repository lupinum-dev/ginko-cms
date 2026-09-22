// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { claimSharedBodyClient } from '../../packages/cms/studio-app/src/composables/internal/sharedBodyClientLock'

function lockManager() {
  const active = new Set<string>()
  return {
    active,
    locks: {
      async request(name: string, _options: LockOptions, callback: LockGrantedCallback) {
        if (active.has(name)) return callback(null)
        active.add(name)
        try {
          return await callback({ name, mode: 'exclusive' })
        } finally {
          active.delete(name)
        }
      },
    },
  }
}

describe('shared body client ownership', () => {
  it('prevents two live hosts from using the same copied recovery identity and releases ownership on close', async () => {
    const { locks } = lockManager()
    const original = await claimSharedBodyClient('alice/session-one', false, locks as LockManager)
    await expect(
      claimSharedBodyClient('alice/session-one', true, locks as LockManager),
    ).rejects.toThrow(/another tab/)
    const unrelated = await claimSharedBodyClient('alice/session-two', false, locks as LockManager)
    unrelated()
    original()
    await Promise.resolve()
    const recovered = await claimSharedBodyClient('alice/session-one', true, locks as LockManager)
    recovered()
  })

  it('fails closed for recovery when browser ownership locks are unavailable', async () => {
    await expect(claimSharedBodyClient('new-client', false, undefined)).resolves.toBeTypeOf(
      'function',
    )
    await expect(claimSharedBodyClient('copied-client', true, undefined)).rejects.toThrow(
      /cannot safely reopen/,
    )
  })
})
