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
  return {
    convexClient: {
      query: unavailable,
      mutation: unavailable,
      action: unavailable,
      onUpdate: unavailable,
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
    },
    api: apiProxy() as GinkoCmsStudioHostBridge['api'],
    auth: null,
    mcpApiKeys: {
      create: unavailable,
      delete: unavailable,
    },
    onSignOut: unavailable,
  }
}
