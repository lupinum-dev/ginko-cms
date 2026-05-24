import type { ConvexClient } from 'convex/browser'
import { hasInjectionContext, inject, type InjectionKey } from 'vue'

import { readHostBridge, type HostBridge } from './host-bridge'

export interface StudioHostContext {
  getBridge: () => HostBridge
  getConvexClient: () => ConvexClient | undefined
  requireConvexClient: () => ConvexClient
}

export const studioHostContextKey: InjectionKey<StudioHostContext> = Symbol('ginko-cms.studioHost')

export function createStudioHostContext(getBridge: () => HostBridge = readHostBridge) {
  const getConvexClient = () => {
    const bridge = getBridge()
    return bridge.nuxtApp?.$convex as ConvexClient | undefined
  }

  return {
    getBridge,
    getConvexClient,
    requireConvexClient() {
      const convex = getConvexClient()
      if (!convex) {
        throw new Error(
          'Studio Convex client is unavailable. Refresh after the host finishes loading.',
        )
      }
      return convex
    },
  } satisfies StudioHostContext
}

const fallbackStudioHostContext = createStudioHostContext()

export function useStudioHostContext(): StudioHostContext {
  if (hasInjectionContext()) {
    return inject(studioHostContextKey, fallbackStudioHostContext)
  }
  return fallbackStudioHostContext
}
