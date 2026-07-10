<script setup lang="ts">
import { api } from '#convex/api'
import type {
  GinkoCmsPublicConfig,
  GinkoCmsStudioMcpApiKeyCreateInput,
  GinkoCmsStudioMcpApiKeyCreateResult,
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
  navigateTo,
  onMounted,
  useConvex,
  useConvexAuth,
  useConvexConfig,
  useHead,
  useRequestURL,
  useRoute,
  useRuntimeConfig,
} from '#imports'

import { requireGinkoApiKeyClient } from '../api-key-client'
import { buildStudioHostApi } from './studio-host-api'

const runtimeConfig = useRuntimeConfig()
const requestUrl = useRequestURL()
const route = useRoute()
const convexAuth = useConvexAuth()
const convexConfig = useConvexConfig()

const cmsConfig = computed(() => runtimeConfig.public.ginkoCms as unknown as GinkoCmsPublicConfig)
// `useConvexConfig().auth === false` is the single normalized disabled-auth
// signal (vNext §5.7). No raw `runtimeConfig.public.convex` casts here.
const authDisabled = computed(() => convexConfig.auth === false)
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

function debugStudioHost(message: string, details: Record<string, unknown> = {}): void {
  if (!import.meta.dev) return
  const summary = Object.entries(details)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
  console.debug(`[ginko-cms] Studio host ${message}${summary ? ` ${summary}` : ''}.`, details)
}

// MCP API-key management goes through the single typed Better Auth client
// exposed by `useConvexAuth().client` (vNext §10.5). No hand-rolled
// `/api-key/*` HTTP, route derivation, or response-envelope parsing: the
// api-key client plugin owns transport and typing. `requireGinkoApiKeyClient`
// narrows the possibly host-defined client to the `apiKey` surface and reports
// the exact actionable capability error when the plugin is missing.
async function createMcpApiKey(
  input: GinkoCmsStudioMcpApiKeyCreateInput,
): Promise<GinkoCmsStudioMcpApiKeyCreateResult> {
  const client = requireGinkoApiKeyClient(convexAuth.client)
  const result = await client.apiKey.create({
    name: input.name,
    expiresIn: input.expiresIn,
    metadata: input.metadata,
  })
  if (result.error) {
    throw new Error(result.error.message ?? 'Better Auth API-key creation failed')
  }
  if (!result.data?.id || !result.data.key) {
    throw new Error('Better Auth API-key creation returned an incomplete result')
  }
  return {
    id: result.data.id,
    key: result.data.key,
    name: result.data.name ?? null,
    expiresAt: result.data.expiresAt ?? null,
  }
}

async function deleteMcpApiKey(input: { keyId: string }): Promise<void> {
  const client = requireGinkoApiKeyClient(convexAuth.client)
  const result = await client.apiKey.delete({ keyId: input.keyId })
  if (result.error) {
    throw new Error(result.error.message ?? 'Better Auth API-key deletion failed')
  }
}

// Populate the host bridge synchronously during client setup. The Studio SPA
// imports its API proxy at module-evaluation time; waiting until onBeforeMount
// lets the SPA capture inert fallback proxies before the real generated API is
// available.
if (import.meta.client) {
  populateBridge(!authDisabled.value)
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
  // Wait for auth to settle once (vNext §5.3 `ready()` replaces the pre-vNext
  // "await auth ready" gate). Never throws for us — resolve or ignore.
  try {
    await convexAuth.ready()
  } catch {
    // ignore — fall through to the disabled / isAuthenticated checks
  }
  if (authDisabled.value) {
    debugStudioHost('auth disabled', { script: mainJs.value })
    populateBridge(false)
    loadStudioScript(mainJs.value)
    return
  }
  if (convexAuth.isAuthenticated.value === true) {
    const user = convexAuth.user.value
    debugStudioHost('auth ready', {
      user: user?.email ?? user?.id ?? null,
      script: mainJs.value,
    })
    populateBridge(true)
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

function populateBridge(includeAuth: boolean): void {
  debugStudioHost('bridge populated', {
    auth: includeAuth,
    collections: Object.keys(cmsConfig.value.collections ?? {}).length,
    route: studioRoute.value,
  })
  const bridge: GinkoCmsStudioHostBridge = {
    // The stable replacement-safe handle (useConvex()). It survives primary
    // client replacement across sign-in/out; the SPA never holds the raw client.
    convexClient: useConvex(),
    config: cmsConfig.value,
    // The generated Convex api is per-consumer.
    api: buildStudioHostApi(api),
    // Auth-state subset so the SPA's useCmsAuthState mirrors sign-in / sign-out
    // without subscribing separately. Refs stay live across the boundary
    // because both sides share the same module instance. No Convex JWT crosses.
    auth: includeAuth
      ? {
          status: convexAuth.status,
          isPending: convexAuth.isPending,
          isAuthenticated: convexAuth.isAuthenticated,
          user: convexAuth.user,
        }
      : null,
    mcpApiKeys: {
      create: createMcpApiKey,
      delete: deleteMcpApiKey,
    },
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
