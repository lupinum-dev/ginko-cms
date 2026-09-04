import { canonicalJsonBytes, hashCanonicalJson } from '@lupinum/ginko-content/portability'
import { describe, expect, it } from 'vitest'

import {
  createPortableRootHashState,
  DurableSha256,
} from '../../packages/convex/src/portability/durableHash.js'

describe('portable durable root hashing', () => {
  it('matches the canonical array root byte-for-byte across serialized page boundaries', async () => {
    const values = Array.from({ length: 1_205 }, (_, index) => ({
      identity: {
        collection: index % 2 === 0 ? 'posts' : 'authors',
        canonicalKey: `row-${String(index).padStart(4, '0')}`,
        locale: index % 3 === 0 ? 'de' : 'en',
      },
      title: `Portable row ${index}`,
      flags: [index % 2 === 0, index % 5 === 0],
    }))
    let snapshot = createPortableRootHashState()
    let count = 0
    for (let offset = 0; offset < values.length; offset += 137) {
      const hash = new DurableSha256(JSON.parse(JSON.stringify(snapshot)))
      for (const value of values.slice(offset, offset + 137)) {
        if (count > 0) hash.update(new TextEncoder().encode(','))
        hash.update(canonicalJsonBytes(value))
        count += 1
      }
      snapshot = hash.snapshot()
    }
    const completed = new DurableSha256(snapshot)
    completed.update(new TextEncoder().encode(']'))

    expect(count).toBe(values.length)
    expect(completed.digestHex()).toBe(await hashCanonicalJson(values))
  })

  it('rejects malformed persisted state before it can corrupt a resumed root', () => {
    expect(
      () =>
        new DurableSha256({
          words: [1],
          block: [],
          bytesHashed: 0,
        }),
    ).toThrow(/durable SHA-256 state is invalid/i)
  })
})
