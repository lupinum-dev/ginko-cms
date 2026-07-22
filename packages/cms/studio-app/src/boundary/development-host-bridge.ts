import type { GinkoCmsStudioHostBridge } from '@public/types'

const unavailable = (): never => {
  throw new Error('The standalone Studio development bridge has no Nuxt host.')
}

const apiProxy = (): unknown =>
  new Proxy(unavailable, {
    get: () => apiProxy(),
    apply: unavailable,
  })

/** Explicit standalone-development fixture; production never merges with it. */
export function createDevelopmentHostBridge(): GinkoCmsStudioHostBridge {
  const client = {
    query: unavailable,
    mutation: unavailable,
    action: unavailable,
    onUpdate: unavailable,
  }
  return {
    runtime: {
      client,
      anonymousClient: client,
      identity: {
        snapshot: () => ({
          authEnabled: false,
          settled: true,
          identityKey: 'anonymous',
          authEpoch: 0,
          identityGeneration: 0,
          error: null,
        }),
        waitForInitialSettlement: async () => {},
        subscribe: () => () => {},
      },
    },
    config: {
      route: '/studio',
      defaultLocale: 'en',
      locales: [
        { code: 'en', label: 'English' },
        { code: 'de', label: 'Deutsch' },
      ],
      collections: {},
      sidebar: { dark: false },
      mcp: { enabled: false },
      contract: {
        expectedContentHash: '0'.repeat(64),
        expectedPresentationHash: '0'.repeat(64),
      },
    },
    api: apiProxy() as GinkoCmsStudioHostBridge['api'],
    auth: null,
    onSignOut: unavailable,
  }
}
