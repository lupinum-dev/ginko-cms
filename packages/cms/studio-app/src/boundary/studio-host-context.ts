import {
  assertHostContractWritable,
  type GinkoCmsExpectedContractHashes,
  type GinkoCmsInstalledContractStatus,
} from '@public/contract-compatibility'
import {
  createBetterConvexAttachment,
  type BetterConvexAttachedRuntime,
} from 'better-convex-vue/embedded'
import { hasInjectionContext, inject, type InjectionKey } from 'vue'

import { readHostBridge, type HostBridge } from './host-bridge'

export interface StudioHostContext {
  getBridge: () => HostBridge
  assertContractWritable: () => Promise<void>
  runtime: BetterConvexAttachedRuntime
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
  convex: BetterConvexAttachedRuntime['client'],
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
  convex: BetterConvexAttachedRuntime['client'],
): BetterConvexAttachedRuntime['client'] {
  const mutation: BetterConvexAttachedRuntime['client']['mutation'] = async (
    reference,
    args,
    options,
  ) => {
    await assertContractWritable()
    return await convex.mutation(reference, args, options)
  }
  const action: BetterConvexAttachedRuntime['client']['action'] = async (reference, args) => {
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
  const assertContractWritable = async () => {
    const convex = getBridge().runtime.client
    await assertStudioContractWritable(getBridge(), convex)
  }
  const bridgeRuntime = getBridge().runtime
  const runtime = createBetterConvexAttachment({
    client: guardedConvexClient(assertContractWritable, bridgeRuntime.client),
    anonymousClient: bridgeRuntime.anonymousClient,
    identity: bridgeRuntime.identity,
    connection: bridgeRuntime.connection,
  })

  return {
    getBridge,
    assertContractWritable,
    runtime,
  } satisfies StudioHostContext
}

const fallbackStudioHostContext = createStudioHostContext()

export function useStudioHostContext(): StudioHostContext {
  if (hasInjectionContext()) {
    return inject(studioHostContextKey, fallbackStudioHostContext)
  }
  return fallbackStudioHostContext
}
