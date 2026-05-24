import type { GinkoCmsPublicConfig, GinkoCmsStudioHostBridge } from '@public/types'

// Contract between the host Nuxt page and the studio SPA. The host
// (studio-host.vue) populates window.__GINKO_CMS__ during the page's
// onBeforeMount hook, before this bundle's main.js is fetched. The module
// reads the global lazily on each call. Standalone Vite dev may use a stub
// bridge; production must fail loudly if the Nuxt host did not attach one.

export type HostBridge = GinkoCmsStudioHostBridge

const STUB_CONFIG: GinkoCmsPublicConfig = {
  route: '/studio',
  defaultLocale: 'en',
  locales: [
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
  ],
  collections: {},
  sidebar: { dark: false },
  mcp: { enabled: false },
}

const STUB_BRIDGE: HostBridge = {
  convexUrl: '',
  config: STUB_CONFIG,
  getAuthToken: () => null,
  onSignOut: () => {},
}

declare global {
  interface Window {
    __GINKO_CMS__?: HostBridge
  }
}

export function hasHostBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__GINKO_CMS__)
}

export function readHostBridge(): HostBridge {
  if (typeof window === 'undefined') return STUB_BRIDGE
  const fromHost = window.__GINKO_CMS__
  if (!fromHost) {
    if (import.meta.env.DEV) return STUB_BRIDGE
    throw new Error('Ginko CMS Studio host bridge is missing.')
  }
  // Merge over the stub so a partially-populated host (e.g. config but no
  // api yet) still has working defaults for the missing fields.
  return {
    ...STUB_BRIDGE,
    ...fromHost,
    config: fromHost.config ?? STUB_CONFIG,
  }
}

export function useHostBridge(): HostBridge {
  return readHostBridge()
}

export function setHostBridgeForTesting(next: Partial<HostBridge>): void {
  if (typeof window === 'undefined') return
  window.__GINKO_CMS__ = {
    ...readHostBridge(),
    ...next,
    config: next.config ?? readHostBridge().config,
  }
}

// Mirrors the public useCmsConfig: returns the plain config object (not a
// reactive ref). Studio code can destructure or read fields like
// `cmsConfig.route` without `.value`.
//
// Studio internal links are constructed as `${studioRoute}/foo` — they then
// pass those into vue-router's RouterLink. Because the SPA's history is
// `createWebHistory('/studio/')`, vue-router already prepends `/studio` to
// absolute paths; if we returned the host's `/studio` here, links would
// double-prefix to `/studio/studio/foo`. So inside the SPA route is `''`,
// and the resulting `/foo` resolves to `/studio/foo` after the router base.
export function useCmsConfig(): GinkoCmsPublicConfig {
  const config = readHostBridge().config
  return {
    ...config,
    route: '',
  }
}
