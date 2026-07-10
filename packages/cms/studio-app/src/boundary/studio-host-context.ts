import type { GinkoCmsConvexClientHandle } from '@public/types'
import { hasInjectionContext, inject, type InjectionKey } from 'vue'

import { readHostBridge, type HostBridge } from './host-bridge'

export interface StudioHostContext {
  getBridge: () => HostBridge
  getConvexClient: () => GinkoCmsConvexClientHandle | undefined
  requireConvexClient: () => GinkoCmsConvexClientHandle
}

export const studioHostContextKey: InjectionKey<StudioHostContext> = Symbol('ginko-cms.studioHost')

export function createStudioHostContext(getBridge: () => HostBridge = readHostBridge) {
  // The host attaches the stable replacement-safe handle (useConvex()) directly
  // as `bridge.convexClient` (vNext §10.6). We no longer reach `$convex` through
  // a passed-through `nuxtApp`.
  const getConvexClient = () => getBridge().convexClient

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
