// @vitest-environment jsdom

import { createBetterConvex } from '@lupinum/better-convex-vue'
import { createBetterConvexAttachment } from '@lupinum/better-convex-vue/embedded'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'

import { useCmsStudioPaginatedQuery } from '../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery'
import {
  normalizeCmsStudioQueryError,
  useCmsStudioQuery,
} from '../../packages/cms/studio-app/src/composables/useCmsStudioQuery'

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: { read: 'read' },
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsAuthState', () => ({
  useCmsAuthState: () => ({
    authEnabled: computed(() => true),
    isAuthenticated: computed(() => true),
  }),
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    ready: computed(() => true),
    can: () => computed(() => true),
  }),
}))

const query = { [Symbol.for('functionName')]: 'ginkoCms.editor.getEntry' }

function runtimeFixture() {
  const identityListeners = new Set<() => void>()
  let identity = {
    authEnabled: true,
    settled: true,
    identityKey: 'user:a',
    authEpoch: 1,
    identityGeneration: 1,
    error: null,
  }
  const subscriptions: Array<(value: unknown) => void> = []
  const client = {
    query: vi.fn(async () => ({ page: [], isDone: true, continueCursor: '' })),
    mutation: vi.fn(),
    action: vi.fn(),
    onUpdate: vi.fn((_reference, _args, next) => {
      subscriptions.push(next)
      return vi.fn()
    }),
  }
  const attachment = createBetterConvexAttachment({
    client: client as never,
    anonymousClient: client as never,
    identity: {
      snapshot: () => identity,
      waitForInitialSettlement: async () => {},
      subscribe(listener) {
        identityListeners.add(listener)
        return () => identityListeners.delete(listener)
      },
    },
  })
  return {
    client,
    subscriptions,
    plugin: createBetterConvex({ attachment }),
    replaceIdentity(next: typeof identity) {
      identity = next
      for (const listener of identityListeners) listener()
    },
  }
}

describe('Ginko Studio Better Convex adapters', () => {
  it('delegates query lifecycle and synchronously retires protected data on identity change', async () => {
    const fixture = runtimeFixture()
    const Host = defineComponent({
      setup: () => ({ result: useCmsStudioQuery(query as never, {}) }),
      render: () => h('div'),
    })
    const wrapper = mount(Host, { global: { plugins: [fixture.plugin] } })
    await nextTick()
    fixture.subscriptions[0]?.({ owner: 'a' })
    await nextTick()
    expect(wrapper.vm.result.data.value).toEqual({ owner: 'a' })

    fixture.replaceIdentity({
      authEnabled: true,
      settled: true,
      identityKey: 'user:b',
      authEpoch: 2,
      identityGeneration: 2,
      error: null,
    })
    expect(wrapper.vm.result.data.value).toBeUndefined()
    await nextTick()
    expect(fixture.client.onUpdate).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('delegates pagination and treats a nullable terminal cursor as exhausted', async () => {
    const fixture = runtimeFixture()
    const paginated = { [Symbol.for('functionName')]: 'ginkoCms.editor.listVersions' }
    const Host = defineComponent({
      setup: () => ({
        result: useCmsStudioPaginatedQuery(paginated as never, {}, { initialNumItems: 25 }),
      }),
      render: () => h('div'),
    })
    const wrapper = mount(Host, { global: { plugins: [fixture.plugin] } })
    await nextTick()
    fixture.subscriptions[0]?.({ page: [{ id: 'v1' }], isDone: true, continueCursor: '' })
    await nextTick()
    expect(wrapper.vm.result.data.value).toEqual([{ id: 'v1' }])
    expect(wrapper.vm.result.canLoadMore.value).toBe(false)
    expect(wrapper.vm.result.status.value).toBe('exhausted')
    wrapper.unmount()
  })

  it('keeps Ginko domain classification on top of the shared sanitized error', () => {
    const normalized = normalizeCmsStudioQueryError(
      new Error('opaque failure'),
      query as never,
      'query',
    )
    expect(normalized.functionPath).toBe('ginkoCms.editor.getEntry')
    expect(normalized.operation).toBe('query')
    expect(normalized.category).toBe('unknown')
  })
})
