<script setup lang="ts">
import { api } from '#convex/api'
import type { GinkoCmsPublicConfig, GinkoCmsStudioHostBridge } from '#ginko-cms-public/types.js'
// Catchall host page for /studio/* (everything except auth/signin and
// auth/register, which are Nuxt-shipped pages registered before this).
//
// Responsibility:
//   1. Guard /studio against anonymous access — redirect to the signin
//      page (preserving the original target as ?redirect=...).
//   2. Render <div id="ginko-cms-studio"> as the SPA mount point.
//   3. Populate window.__GINKO_CMS__ with everything the SPA boundary
//      needs to fetch real data: cms config, the stable replacement-safe
//      Convex client handle (useConvex()), the generated Convex api object,
//      and the auth-state subset the SPA reads to mirror sign-in / sign-out.
//   4. Inject the SPA bundle's main.js + main.css via useHead() so they
//      land in the document head.
//
// Asset path comes from runtimeConfig.public.ginkoCms.studio.assetBase
// (populated by the Nuxt module). Default: '/_ginko-cms-studio' served by
// nitro.publicAssets out of dist/studio-app/. If GINKO_STUDIO_DEV_SERVER
// is set on the consumer's runtime config, the SPA loads from there
// instead — that's the HMR-iteration path for studio code (run
// `pnpm --filter @lupinum/ginko-cms studio:dev` alongside the consumer).
import {
  computed,
  onMounted,
  useConvexAttachment,
  useConvexAuth,
  useHead,
  useRequestURL,
  useRoute,
  useRuntimeConfig,
  watch,
} from '#imports'

import { buildStudioHostApi } from './studio-host-api'

const runtimeConfig = useRuntimeConfig()
const requestUrl = useRequestURL()
const route = useRoute()
const convexAuth = useConvexAuth()
const convexRuntime = import.meta.client ? useConvexAttachment() : null
const authListeners = new Set<() => void>()

function readAuthSnapshot() {
  const error = convexAuth.error.value
  const user = convexAuth.user.value
  return {
    status: convexAuth.status.value,
    isPending: convexAuth.isPending.value,
    isAuthenticated: convexAuth.isAuthenticated.value,
    user: user ? { ...user } : null,
    error: error
      ? {
          kind: error.kind,
          message: error.message,
          code: error.code,
          status: error.status,
          data: error.data,
        }
      : null,
  }
}

if (import.meta.client) {
  watch(
    [
      convexAuth.status,
      convexAuth.isPending,
      convexAuth.isAuthenticated,
      convexAuth.user,
      convexAuth.error,
    ],
    () => {
      for (const listener of authListeners) listener()
    },
    { flush: 'sync' },
  )
}

const cmsConfig = computed(() => runtimeConfig.public.ginkoCms as unknown as GinkoCmsPublicConfig)
const studioRoute = computed(() =>
  ((cmsConfig.value.route as string | undefined) ?? '/studio').replace(/\/$/, ''),
)
const studioConfig = computed(() => cmsConfig.value.studio ?? {})

const studioDevServer = computed(() => {
  const dev = studioConfig.value.devServer
  return typeof dev === 'string' && dev.length > 0 ? dev.replace(/\/$/, '') : null
})
const assetBase = computed(() =>
  (studioConfig.value.assetBase ?? '/_ginko-cms-studio').replace(/\/$/, ''),
)
const mainJs = computed(() =>
  studioDevServer.value
    ? `${studioDevServer.value}/src/main.ts`
    : `${assetBase.value}/assets/main.js`,
)
const mainCss = computed(() =>
  studioDevServer.value ? null : `${assetBase.value}/assets/main.css`,
)

useHead(() => ({
  title: 'Ginko CMS Studio',
  link: mainCss.value ? [{ rel: 'stylesheet', href: mainCss.value, crossorigin: 'anonymous' }] : [],
  meta: route.path.endsWith('/invitations/accept')
    ? [{ name: 'robots', content: 'noindex, nofollow, noarchive' }]
    : [],
}))

function debugStudioHost(message: string, details: Record<string, unknown> = {}): void {
  if (!import.meta.dev) return
  const summary = Object.entries(details)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
  console.debug(`[ginko-cms] Studio host ${message}${summary ? ` ${summary}` : ''}.`, details)
}

// Populate the host bridge synchronously during client setup. The Studio SPA
// imports its API proxy at module-evaluation time; waiting until onBeforeMount
// lets the SPA capture inert fallback proxies before the real generated API is
// available.
if (import.meta.client) {
  populateBridge(true)
}

function loadStudioScript(src: string): void {
  const selector = 'script[data-ginko-cms-studio="main"]'
  const existing = document.querySelector<HTMLScriptElement>(selector)
  const resolvedSrc = new URL(src, window.location.href).href
  if (existing?.src === resolvedSrc) {
    debugStudioHost('script already loaded', { src: resolvedSrc })
    return
  }
  existing?.remove()

  const script = document.createElement('script')
  script.dataset.ginkoCmsStudio = 'main'
  script.type = 'module'
  script.crossOrigin = 'anonymous'
  script.src = src
  script.addEventListener('load', () => {
    debugStudioHost('script loaded', { src: resolvedSrc })
  })
  script.addEventListener('error', (event) => {
    console.error('[ginko-cms] Studio host script failed to load.', { src: resolvedSrc, event })
  })
  debugStudioHost('loading script', { src: resolvedSrc })
  document.head.appendChild(script)
}

// BCN's global middleware is the single navigation guard. This hook only waits
// for the client auth engine, then loads the Studio when it has a usable
// identity or a real auth failure that Studio must render distinctly.
onMounted(async () => {
  if (typeof window === 'undefined') return
  try {
    await convexAuth.ready()
  } catch {
    // The reactive error ref below is the canonical failure state.
  }
  if (convexAuth.isAuthenticated.value === true || convexAuth.error.value !== null) {
    const user = convexAuth.user.value
    debugStudioHost('auth ready', {
      user: user?.email ?? user?.id ?? null,
      script: mainJs.value,
    })
    populateBridge(true)
    loadStudioScript(mainJs.value)
  }
})

function populateBridge(includeAuth: boolean): void {
  debugStudioHost('bridge populated', {
    auth: includeAuth,
    collections: Object.keys(cmsConfig.value.collections ?? {}).length,
    route: studioRoute.value,
  })
  const bridge: GinkoCmsStudioHostBridge = {
    runtime: convexRuntime!,
    config: cmsConfig.value,
    // The generated Convex api is per-consumer.
    api: buildStudioHostApi(api),
    // Plain presentation observer. The separately bundled SPA owns its Vue
    // refs; no cross-bundle refs, cookies, or Convex JWT cross this boundary.
    auth: includeAuth
      ? {
          snapshot: readAuthSnapshot,
          subscribe(listener) {
            authListeners.add(listener)
            return () => authListeners.delete(listener)
          },
        }
      : null,
    onSignOut: async () => {
      try {
        await convexAuth.signOut()
      } finally {
        const { href, origin } = requestUrl
        window.location.href = new URL(
          `${studioRoute.value}/auth/signin`,
          origin || href,
        ).toString()
      }
    },
  }
  ;(window as unknown as { __GINKO_CMS__: GinkoCmsStudioHostBridge }).__GINKO_CMS__ = bridge
}

// Browser-side collection contract sync was removed. It exposed installer
// state to authenticated clients. Contract installation is now an explicit
// CLI/CI action (`ginko-cms push`), never Studio or Nuxt boot behavior.
</script>

<template>
  <main aria-label="Ginko CMS Studio" style="min-height: 100vh">
    <h1
      style="
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      "
    >
      Ginko CMS Studio
    </h1>
    <div id="ginko-cms-studio" style="min-height: 100vh" />
  </main>
</template>
