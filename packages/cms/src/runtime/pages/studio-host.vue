<script setup lang="ts">
import type {
  GinkoCmsHostAuthEngine,
  GinkoCmsPublicConfig,
  GinkoCmsStudioHostApi,
  GinkoCmsStudioHostBridge,
} from '#ginko-cms-public/types.js'
// Catchall host page for /studio/* (everything except auth/signin and
// auth/register, which are Nuxt-shipped pages registered before this).
//
// Responsibility:
//   1. Guard /studio against anonymous access — redirect to the signin
//      page (preserving the original target as ?redirect=...).
//   2. Render <div id="ginko-cms-studio"> as the SPA mount point.
//   3. Populate window.__GINKO_CMS__ with everything the SPA boundary
//      needs to fetch real data: cms config, the consumer's Nuxt app
//      instance, the generated Convex api object, and the public auth refs the
//      SPA reads to mirror sign-in / sign-out state.
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
  navigateTo,
  onMounted,
  useHead,
  useNuxtApp,
  useRequestURL,
  useRoute,
  useRuntimeConfig,
  useConvexAuth,
} from '#imports'
import { api } from '#convex/api'

const runtimeConfig = useRuntimeConfig()
const requestUrl = useRequestURL()
const route = useRoute()
const nuxtApp = useNuxtApp()

const cmsConfig = computed(() => runtimeConfig.public.ginkoCms as unknown as GinkoCmsPublicConfig)
const authEnabled = computed(() => {
  const publicConfig = runtimeConfig.public as {
    convex?: { auth?: { enabled?: boolean } }
  }
  return publicConfig.convex?.auth?.enabled !== false
})
const convexAuth = authEnabled.value ? useConvexAuth() : null
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
}))

function readAuthEngine(): GinkoCmsHostAuthEngine | null {
  return (convexAuth as unknown as GinkoCmsHostAuthEngine | null) ?? null
}

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
  populateBridge(readAuthEngine())
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

// Auth guard and SPA loader. We intentionally append the Studio script only
// after the host bridge is populated. A static head script can execute before
// this component hydrates, causing the SPA to bind to inert fallback API
// proxies instead of the consumer's generated Convex API.
onMounted(async () => {
  if (typeof window === 'undefined') return
  const engine = readAuthEngine()
  if (engine?.awaitAuthReady) {
    try {
      await engine.awaitAuthReady()
    } catch {
      // ignore — fall through to the isAuthenticated check
    }
  }
  if (engine && engine.isAuthenticated.value === true) {
    const user = engine.user.value as { email?: string; id?: string } | null
    debugStudioHost('auth ready', {
      user: user?.email ?? user?.id ?? null,
      script: mainJs.value,
    })
    populateBridge(engine)
    loadStudioScript(mainJs.value)
    return
  }
  if (!authEnabled.value) {
    debugStudioHost('auth disabled', { script: mainJs.value })
    populateBridge(null)
    loadStudioScript(mainJs.value)
    return
  }
  const target = route.fullPath || studioRoute.value
  const redirectQuery =
    target.startsWith(studioRoute.value) && target !== `${studioRoute.value}/auth/signin`
      ? `?redirect=${encodeURIComponent(target)}`
      : ''
  await navigateTo(`${studioRoute.value}/auth/signin${redirectQuery}`)
})

function populateBridge(engine: GinkoCmsHostAuthEngine | null): void {
  debugStudioHost('bridge populated', {
    auth: Boolean(engine),
    collections: Object.keys(cmsConfig.value.collections ?? {}).length,
    route: studioRoute.value,
  })
  const bridge: GinkoCmsStudioHostBridge = {
    convexUrl: String((runtimeConfig.public as Record<string, unknown>).convexUrl ?? ''),
    config: cmsConfig.value,
    // The SPA's Convex composables call useNuxtApp().$convex; passing the
    // consumer's Nuxt app reference shares the already-configured Convex
    // client (and its better-auth token attachment) into the SPA context.
    nuxtApp,
    // Convex api is generated per-consumer; inject it so the SPA's
    // boundary/api proxy delegates to the real function references.
    api: assertStudioHostApi(api),
    // Auth state passthrough so the SPA's useCmsAuthState mirrors what the
    // consumer's auth engine reports without the SPA having to subscribe
    // separately. Refs stay live — Vue tracking flows across the boundary
    // because both sides share the same module instance via useNuxtApp.
    auth: engine
      ? {
          token: engine.token,
          user: engine.user,
          pending: engine.pending ?? engine.isPending,
          isAuthenticated: engine.isAuthenticated,
          isAnonymous: engine.isAnonymous ?? computed(() => !engine.isAuthenticated.value),
        }
      : null,
    getAuthToken: async (): Promise<string | null> => {
      const e = readAuthEngine()
      return e?.token?.value ?? null
    },
    onSignOut: async () => {
      const e = readAuthEngine()
      try {
        await e?.signOut?.()
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

function assertStudioHostApi(value: unknown): GinkoCmsStudioHostApi {
  const requiredGroups = [
    'assets',
    'collections',
    'editor',
    'imports',
    'mcpKeys',
    'members',
    'public',
    'settings',
    'siteData',
  ] as const
  const root = readObject(value, 'api')
  const ginkoCms = readObject(root.ginkoCms, 'api.ginkoCms')
  for (const group of requiredGroups) {
    readObject(ginkoCms[group], `api.ginkoCms.${group}`)
  }
  return value as GinkoCmsStudioHostApi
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  throw new TypeError(`[ginko-cms] Studio host bridge is missing ${label}.`)
}
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
