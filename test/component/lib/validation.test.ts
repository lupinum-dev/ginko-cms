import { describe, expect, it } from 'vitest'

import { evaluateFieldCondition } from '#component/lib/validation.js'

// NOTE: Canonical tests for evaluateFieldCondition live in test/shared/fields.test.ts.
// These tests verify the re-export path from packages/convex/src/lib/ still works.
describe('component lib validation', () => {
  it('evaluates conditions across nested context', () => {
    const context = {
      type: 'premium',
      settings: {
        advanced: {
          enabled: true,
        },
      },
      locale: 'en',
    }

    expect(evaluateFieldCondition({ field: 'type', equals: 'premium' }, context)).toBe(true)
    expect(
      evaluateFieldCondition(
        {
          and: [
            { field: 'settings.advanced.enabled', truthy: true },
            { field: 'locale', in: ['en', 'de'] },
          ],
        },
        context,
      ),
    ).toBe(true)
    expect(evaluateFieldCondition({ field: 'type', notEquals: 'premium' }, context)).toBe(false)
  })
})
