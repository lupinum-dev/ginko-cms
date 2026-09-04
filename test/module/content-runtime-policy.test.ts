import { describe, expect, it } from 'vitest'

import { resolveContentRuntimePolicy } from '../../packages/cms/src/server/utils/content-runtime-policy'

describe('server Content runtime policy', () => {
  it('uses private Content runtime over conflicting public runtime', () => {
    expect(
      resolveContentRuntimePolicy({
        content: {
          defaultLocale: 'it',
          locales: ['it'],
          contract: {
            format: 'ginko-content-contract',
            version: 1,
            defaultLocale: 'de',
            locales: ['de', 'en'],
            localeFallbacks: { de: [], en: ['de'] },
            collections: {},
          },
        },
        public: { content: { defaultLocale: 'fr', locales: ['fr'] } },
      }),
    ).toEqual({ defaultLocale: 'de', locales: ['de', 'en'] })
  })

  it('uses public Content runtime only when private policy is unavailable', () => {
    expect(
      resolveContentRuntimePolicy({
        public: { content: { defaultLocale: 'fr', locales: ['fr', 'en'] } },
      }),
    ).toEqual({ defaultLocale: 'fr', locales: ['fr', 'en'] })
  })
})
