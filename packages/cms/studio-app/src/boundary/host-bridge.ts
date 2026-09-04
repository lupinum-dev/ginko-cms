import type { GinkoCmsPublicConfig, GinkoCmsStudioHostBridge } from '@public/types'

import { createDevelopmentHostBridge } from './development-host-bridge'

// Contract between the host Nuxt page and the studio SPA. The host
// (studio-host.vue) populates window.__GINKO_CMS__ during the page's
// onBeforeMount hook, before this bundle's main.js is fetched. The module
// reads the global lazily on each call. Standalone Vite dev may use a stub
// bridge; production must fail loudly if the Nuxt host did not attach one.

export type HostBridge = GinkoCmsStudioHostBridge

declare global {
  interface Window {
    __GINKO_CMS__?: HostBridge
  }
}

export function hasHostBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__GINKO_CMS__)
}

export function readHostBridge(): HostBridge {
  if (typeof window === 'undefined') {
    if (import.meta.env.DEV) return createDevelopmentHostBridge()
    throw new Error('Ginko CMS Studio host bridge is unavailable outside the browser.')
  }
  const fromHost = window.__GINKO_CMS__
  if (!fromHost) {
    if (import.meta.env.DEV) return createDevelopmentHostBridge()
    throw new Error('Ginko CMS Studio host bridge is missing.')
  }
  for (const key of ['attachment', 'config', 'api', 'auth', 'onSignOut'] as const) {
    if (!(key in fromHost)) {
      throw new Error(`Ginko CMS Studio host bridge is missing ${key}.`)
    }
  }
  return fromHost
}

export function useHostBridge(): HostBridge {
  return readHostBridge()
}

export function setHostBridgeForTesting(next: Partial<HostBridge>): void {
  if (typeof window === 'undefined') return
  const current = window.__GINKO_CMS__ ?? createDevelopmentHostBridge()
  window.__GINKO_CMS__ = {
    ...current,
    ...next,
    config: next.config ?? current.config,
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
