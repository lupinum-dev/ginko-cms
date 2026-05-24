import type { GinkoCmsStudioHostApi } from '@public/types'

import { readHostBridge, setHostBridgeForTesting } from './host-bridge'

// Trellis api proxy.
//
// `#trellis/api` in the Nuxt-rendered studio resolves to a per-consumer
// generated module that exports the typed `api` object for every Convex
// function the bridge wires up. The SPA can't generate that itself — the
// shape is consumer-specific.
//
// Strategy:
// - At build time the SPA gets the named `GinkoCmsStudioHostApi` surface so
//   Studio code can only reference bridge functions the host contract names.
// - At runtime the proxy reads `window.__GINKO_CMS__.api` lazily on every
//   property access so we delegate to the real api as soon as the host
//   page (studio-host.vue) populates it during onBeforeMount.
// - In standalone Vite dev, the proxy keeps returning nested proxies so
//   code paths that destructure `api.x.y.z` don't throw on access. In
//   production, a missing host API is a broken integration and throws.

function readHostApi(): GinkoCmsStudioHostApi | null {
  return readHostBridge().api ?? null
}

function buildApiProxy(): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        const real = readHostApi()
        if (real && typeof prop === 'string') {
          return (real as unknown as Record<string, unknown>)[prop]
        }
        if (typeof prop === 'symbol') return undefined
        if (!import.meta.env.DEV) {
          throw new Error('Ginko CMS Studio host API is missing.')
        }
        return buildApiProxy()
      },
    },
  )
}

/** Test seam; production reads the API from the host bridge. */
export function setApi(nextApi: GinkoCmsStudioHostApi): void {
  setHostBridgeForTesting({ api: nextApi })
}

// The generated Trellis API is only available in the host app. Keep the
// runtime proxy cast at this single boundary instead of leaking `any` through
// every Studio query/mutation call site.
export const api = buildApiProxy() as GinkoCmsStudioHostApi
