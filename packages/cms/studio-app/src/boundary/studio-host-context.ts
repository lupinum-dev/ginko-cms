import type { BetterConvexAttachment } from '@lupinum/better-convex-vue/embedded'
import { hasInjectionContext, inject, type InjectionKey } from 'vue'

import { readHostBridge, type HostBridge } from './host-bridge'

export interface StudioHostContext {
  getBridge: () => HostBridge
  attachment: BetterConvexAttachment
}

export const studioHostContextKey: InjectionKey<StudioHostContext> = Symbol('ginko-cms.studioHost')

export function createStudioHostContext(getBridge: () => HostBridge = readHostBridge) {
  return {
    getBridge,
    attachment: getBridge().attachment,
  } satisfies StudioHostContext
}

const fallbackStudioHostContext = createStudioHostContext()

export function useStudioHostContext(): StudioHostContext {
  if (hasInjectionContext()) {
    return inject(studioHostContextKey, fallbackStudioHostContext)
  }
  return fallbackStudioHostContext
}
