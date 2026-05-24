import { describe, expect, it } from 'vitest'

import { compareOrderRank, rankAfter, rankBetween } from '#component/lib/ordering.js'

describe('component lib ordering', () => {
  it('computes fractional ranks deterministically', () => {
    expect(rankBetween('V', 'X')).toBe('W')
    expect(rankAfter('X')).not.toBe('X')
    expect(compareOrderRank('A', 'B')).toBeLessThan(0)
    expect(compareOrderRank('B', 'A')).toBeGreaterThan(0)
    expect(compareOrderRank('A', 'A')).toBe(0)
  })
})
