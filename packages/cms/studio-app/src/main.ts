import { createApp } from 'vue'

import App from './App.vue'
import { hasHostBridge, readHostBridge } from './boundary/host-bridge'
import { createStudioHostContext, studioHostContextKey } from './boundary/studio-host-context'
import Icon from './components/Icon.vue'
import NuxtTime from './components/NuxtTime.vue'
import { createStudioRouter } from './router'

import './styles/index.css'

const MOUNT_TARGET = '#ginko-cms-studio'

function debugStudioMount(message: string, details: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV) return
  const summary = Object.entries(details)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
  console.debug(`[ginko-cms] studio mount: ${message}${summary ? ` ${summary}` : ''}`, details)
}

// The Nuxt host page injects this bundle's <script> tag via useHead during
// the page's setup phase, which can fire before the <div id="ginko-cms-studio">
// is committed to the DOM. If we mount() against a missing target Vue 3
// silently no-ops and the SPA never renders. Wait until the target exists,
// then mount.
function waitForMountTarget(): Promise<Element> {
  const existing = document.querySelector(MOUNT_TARGET)
  if (existing) {
    debugStudioMount('target found immediately')
    return Promise.resolve(existing)
  }

  debugStudioMount('waiting for target')
  return new Promise<Element>((resolve) => {
    const observer = new MutationObserver(() => {
      const found = document.querySelector(MOUNT_TARGET)
      if (found) {
        observer.disconnect()
        debugStudioMount('target found after dom mutation')
        resolve(found)
      }
    })
    observer.observe(document.documentElement, { subtree: true, childList: true })
  })
}

function waitForHostBridge(): Promise<void> {
  if (import.meta.env.DEV) return Promise.resolve()
  if (hasHostBridge()) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    let attempts = 0
    const tick = () => {
      if (hasHostBridge() || attempts >= 100) {
        resolve()
        return
      }
      attempts += 1
      window.setTimeout(tick, 10)
    }
    tick()
  })
}

function prepareMountRoot(target: Element): Element {
  const root = document.createElement('div')
  root.dataset.ginkoCmsStudioRoot = 'true'
  target.replaceChildren(root)
  return root
}

void Promise.all([waitForMountTarget(), waitForHostBridge()])
  .then(async ([target]) => {
    debugStudioMount('creating app', {
      collectionCount: Object.keys(readHostBridge().config.collections ?? {}).length,
      hasHostBridge: hasHostBridge(),
      location: window.location.href,
    })
    const mountRoot = prepareMountRoot(target)
    const app = createApp(App)
    const router = createStudioRouter()
    app.provide(studioHostContextKey, createStudioHostContext())
    // These names used to come from Nuxt auto-imports in the host app. Register
    // them explicitly so the standalone Studio SPA owns its Nuxt-compat surface.
    app.component('Icon', Icon)
    app.component('NuxtTime', NuxtTime)
    app.use(router as unknown as Parameters<typeof app.use>[0])
    await router.isReady()
    app.mount(mountRoot)
    debugStudioMount('mounted', {
      childCount: mountRoot.childNodes.length,
    })
  })
  .catch((error: unknown) => {
    console.error('[ginko-cms] Studio app failed to mount.', error)
  })
