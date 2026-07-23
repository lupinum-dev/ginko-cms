// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createBetterConvex } from 'better-convex-vue'
import { createBetterConvexAttachment } from 'better-convex-vue/embedded'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import type { GinkoCmsStudioHostBridge } from '../../packages/cms/src/public/types'
import {
  createStudioHostContext,
  studioHostContextKey,
} from '../../packages/cms/studio-app/src/boundary/studio-host-context'
import { useAccess } from '../../packages/cms/studio-app/src/composables/useAccess'

const accessReference = vi.hoisted(() => ({
  [Symbol.for('functionName')]: 'ginkoCms.members.getAccessContext',
}))

vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: { ginkoCms: { members: { getAccessContext: accessReference } } },
}))

describe('Studio access during BCN client replacement', () => {
  it('retains canonical member access across a same-identity credential refresh', async () => {
    let update: ((value: Record<string, unknown> | null) => void) | null = null
    const identityListeners = new Set<() => void>()
    let identity = {
      authEnabled: true,
      settled: true,
      identityKey: 'user:publisher-1',
      authEpoch: 1,
      identityGeneration: 1,
      error: null,
    }
    const convexClient = {
      query: vi.fn(),
      mutation: vi.fn(),
      action: vi.fn(),
      onUpdate: vi.fn((_reference, _args, onValue) => {
        update = onValue
        return () => undefined
      }),
    }
    const runtime = createBetterConvexAttachment({
      client: convexClient as never,
      identity: {
        snapshot: () => identity,
        waitForInitialSettlement: async () => {},
        subscribe(listener) {
          identityListeners.add(listener)
          return () => identityListeners.delete(listener)
        },
      },
    })
    const bridge = {
      runtime,
      config: { route: '/studio', locales: [], collections: {} },
      api: { ginkoCms: { members: { getAccessContext: {} } } },
      auth: null,
      onSignOut: vi.fn(),
    } as unknown as GinkoCmsStudioHostBridge
    const context = createStudioHostContext(() => bridge)
    const Host = defineComponent({
      setup: () => ({ access: useAccess() }),
      render: () => h('div'),
    })
    const wrapper = mount(Host, {
      global: {
        plugins: [createBetterConvex({ runtime: context.runtime })],
        provide: { [studioHostContextKey as symbol]: context },
      },
    })

    update?.({
      userId: 'publisher-1',
      role: 'publisher',
      can: { 'entries.publish': true },
    })
    await nextTick()
    expect(wrapper.vm.access.role.value).toBe('publisher')
    expect(wrapper.vm.access.ready.value).toBe(true)

    identity = { ...identity, authEpoch: 2 }
    for (const listener of identityListeners) listener()
    await nextTick()
    expect(wrapper.vm.access.role.value).toBe('publisher')
    expect(wrapper.vm.access.ready.value).toBe(true)
    expect(wrapper.vm.access.pending.value).toBe(false)

    update?.({
      userId: 'publisher-1',
      role: 'publisher',
      can: { 'entries.publish': true },
    })
    await nextTick()
    expect(wrapper.vm.access.ready.value).toBe(true)
    expect(wrapper.vm.access.pending.value).toBe(false)

    identity = {
      ...identity,
      identityKey: 'anonymous',
      authEpoch: 3,
      identityGeneration: 2,
    }
    for (const listener of identityListeners) listener()
    await nextTick()
    expect(wrapper.vm.access.ctx.value).toBeNull()
    expect(wrapper.vm.access.ready.value).toBe(false)

    wrapper.unmount()
  })
})
