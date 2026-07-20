// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import type {
  GinkoCmsConvexClientHandle,
  GinkoCmsStudioHostBridge,
} from '../../packages/cms/src/public/types'
import {
  createStudioHostContext,
  studioHostContextKey,
} from '../../packages/cms/studio-app/src/boundary/studio-host-context'
import { useAccess } from '../../packages/cms/studio-app/src/composables/useAccess'

describe('Studio access during BCN client replacement', () => {
  it('retains canonical member access across a transient authenticated null result', async () => {
    let update: ((value: Record<string, unknown> | null) => void) | null = null
    const isAuthenticated = ref(true)
    const auth = {
      status: ref('authenticated'),
      isPending: ref(false),
      isAuthenticated,
      user: ref({ id: 'publisher-1', name: 'Publisher', email: 'publisher@example.com' }),
      error: ref(null),
    }
    const convexClient = {
      query: vi.fn(),
      mutation: vi.fn(),
      action: vi.fn(),
      onUpdate: vi.fn((_reference, _args, onValue) => {
        update = onValue
        return () => undefined
      }),
    } as unknown as GinkoCmsConvexClientHandle
    const bridge = {
      convexClient,
      config: { route: '/studio', locales: [], collections: {} },
      api: { ginkoCms: { members: { getAccessContext: {} } } },
      auth,
      onSignOut: vi.fn(),
    } as unknown as GinkoCmsStudioHostBridge
    const context = createStudioHostContext(() => bridge)
    const Host = defineComponent({
      setup: () => ({ access: useAccess() }),
      render: () => h('div'),
    })
    const wrapper = mount(Host, {
      global: { provide: { [studioHostContextKey as symbol]: context } },
    })

    update?.({
      userId: 'publisher-1',
      role: 'publisher',
      can: { 'entries.publish': true },
    })
    await nextTick()
    expect(wrapper.vm.access.role.value).toBe('publisher')
    expect(wrapper.vm.access.ready.value).toBe(true)

    auth.isPending.value = true
    update?.(null)
    await nextTick()
    expect(wrapper.vm.access.role.value).toBe('publisher')
    expect(wrapper.vm.access.ready.value).toBe(true)
    expect(wrapper.vm.access.pending.value).toBe(false)

    isAuthenticated.value = false
    auth.status.value = 'anonymous'
    auth.isPending.value = false
    update?.(null)
    await nextTick()
    expect(wrapper.vm.access.ctx.value).toBeNull()
    expect(wrapper.vm.access.ready.value).toBe(false)

    wrapper.unmount()
  })
})
