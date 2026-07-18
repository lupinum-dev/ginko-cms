import {
  assertHostContractWritable,
  type GinkoCmsExpectedContractHashes,
  type GinkoCmsInstalledContractStatus,
} from '@public/contract-compatibility'
import type { GinkoCmsConvexClientHandle } from '@public/types'
import { hasInjectionContext, inject, type InjectionKey } from 'vue'

import { readHostBridge, type HostBridge } from './host-bridge'

export interface StudioHostContext {
  getBridge: () => HostBridge
  getConvexClient: () => Pick<GinkoCmsConvexClientHandle, 'query' | 'onUpdate'>
  assertContractWritable: () => Promise<void>
  requireConvexClient: () => GinkoCmsConvexClientHandle
}

export const studioHostContextKey: InjectionKey<StudioHostContext> = Symbol('ginko-cms.studioHost')

function expectedContractHashes(bridge: HostBridge): GinkoCmsExpectedContractHashes {
  const expected = bridge.config.contract
  if (
    !expected ||
    typeof expected.expectedContentHash !== 'string' ||
    typeof expected.expectedPresentationHash !== 'string'
  ) {
    throw new Error(
      'Studio writes are unavailable because the host did not provide expected CMS contract hashes.',
    )
  }
  return expected
}

async function assertStudioContractWritable(
  bridge: HostBridge,
  convex: GinkoCmsConvexClientHandle,
): Promise<void> {
  // Expected hashes come from the host bridge and are never forwarded as
  // caller-supplied mutation arguments. The component remains authoritative
  // for the installed pair and transition lock; this boundary prevents the
  // normal Studio transport from writing against a different host contract.
  await assertHostContractWritable(
    expectedContractHashes(bridge),
    async (): Promise<GinkoCmsInstalledContractStatus> =>
      await convex.query(bridge.api.ginkoCms.contract.getInstalledContractStatus, {}),
  )
}

function guardedConvexClient(
  assertContractWritable: () => Promise<void>,
  convex: GinkoCmsConvexClientHandle,
): GinkoCmsConvexClientHandle {
  const mutation: GinkoCmsConvexClientHandle['mutation'] = async (reference, args) => {
    await assertContractWritable()
    return await convex.mutation(reference, args)
  }
  const action: GinkoCmsConvexClientHandle['action'] = async (reference, args) => {
    await assertContractWritable()
    return await convex.action(reference, args)
  }
  return {
    query: convex.query,
    mutation,
    action,
    onUpdate: convex.onUpdate,
  }
}

export function createStudioHostContext(getBridge: () => HostBridge = readHostBridge) {
  // The host attaches the stable replacement-safe handle (useConvex()) directly
  // as `bridge.convexClient` (vNext §10.6). We no longer reach `$convex` through
  // a passed-through `nuxtApp`.
  const getConvexClient = () => getBridge().convexClient
  const assertContractWritable = async () => {
    const convex = getConvexClient()
    if (!convex) {
      throw new Error(
        'Studio Convex client is unavailable. Refresh after the host finishes loading.',
      )
    }
    await assertStudioContractWritable(getBridge(), convex)
  }

  return {
    getBridge,
    getConvexClient,
    assertContractWritable,
    requireConvexClient() {
      const convex = getConvexClient()
      if (!convex) {
        throw new Error(
          'Studio Convex client is unavailable. Refresh after the host finishes loading.',
        )
      }
      return guardedConvexClient(assertContractWritable, convex)
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
