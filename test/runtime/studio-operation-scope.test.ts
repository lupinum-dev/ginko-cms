// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'

import {
  useConvexAction,
  useConvexMutation,
  useConvexUpload,
} from '../../packages/cms/studio-app/src/composables/useStudioConvex'

const host = vi.hoisted(() => ({
  bridge: { auth: null as null | Record<string, unknown> },
  convex: undefined as Record<string, ReturnType<typeof vi.fn>> | undefined,
}))

vi.mock('../../packages/cms/studio-app/src/boundary/studio-host-context', () => ({
  useStudioHostContext: () => ({
    getBridge: () => host.bridge,
    requireConvexClient: () => host.convex,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: { read: 'read' },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    ready: computed(() => true),
    can: () => computed(() => true),
  }),
}))

const mutation = { [Symbol.for('functionName')]: 'ginkoCms.editor.saveEntryDraft' }
const action = { [Symbol.for('functionName')]: 'ginkoCms.assets.registerAsset' }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('Studio operation scopes', () => {
  it('does not commit mutation or action completion after disposal', async () => {
    const mutationResult = deferred<{ id: string }>()
    const actionResult = deferred<{ id: string }>()
    const onMutationSuccess = vi.fn()
    const onActionSuccess = vi.fn()
    host.convex = {
      mutation: vi.fn(() => mutationResult.promise),
      action: vi.fn(() => actionResult.promise),
    }
    const Host = defineComponent({
      setup() {
        return {
          mutate: useConvexMutation(mutation as never, { onSuccess: onMutationSuccess }),
          act: useConvexAction(action as never, { onSuccess: onActionSuccess }),
        }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    const mutate = wrapper.vm.mutate
    const act = wrapper.vm.act
    const mutationPromise = mutate({} as never)
    const actionPromise = act({} as never)
    wrapper.unmount()

    mutationResult.resolve({ id: 'mutation-result' })
    actionResult.resolve({ id: 'action-result' })
    await expect(mutationPromise).resolves.toEqual({ id: 'mutation-result' })
    await expect(actionPromise).resolves.toEqual({ id: 'action-result' })

    expect(mutate.status.value).toBe('idle')
    expect(act.status.value).toBe('idle')
    expect(mutate.data.value).toBeUndefined()
    expect(act.data.value).toBeUndefined()
    expect(onMutationSuccess).not.toHaveBeenCalled()
    expect(onActionSuccess).not.toHaveBeenCalled()
    host.convex = undefined
  })

  it('retires an in-flight operation when the authenticated identity changes', async () => {
    const user = ref<{ id: string } | null>({ id: 'user-a' })
    host.bridge.auth = {
      status: computed(() => 'authenticated'),
      isPending: computed(() => false),
      isAuthenticated: computed(() => user.value !== null),
      user,
    }
    const result = deferred<string>()
    const onSuccess = vi.fn()
    host.convex = { mutation: vi.fn(() => result.promise) }
    const Host = defineComponent({
      setup() {
        return { mutate: useConvexMutation(mutation as never, { onSuccess }) }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    const promise = wrapper.vm.mutate({} as never)
    user.value = { id: 'user-b' }
    await nextTick()
    result.resolve('retired')
    await expect(promise).resolves.toBe('retired')

    expect(wrapper.vm.mutate.status.value).toBe('idle')
    expect(onSuccess).not.toHaveBeenCalled()
    wrapper.unmount()
    host.bridge.auth = null
    host.convex = undefined
  })

  it('stops upload work after disposal before dispatching bytes', async () => {
    const uploadUrl = deferred<string>()
    host.convex = { mutation: vi.fn(() => uploadUrl.promise) }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const Host = defineComponent({
      setup() {
        return { upload: useConvexUpload(mutation as never) }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    const upload = wrapper.vm.upload
    const promise = upload(new File(['bytes'], 'asset.png', { type: 'image/png' }))
    wrapper.unmount()
    uploadUrl.resolve('https://storage.example.test/upload')

    await expect(promise).rejects.toThrow('scope was disposed')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(upload.status.value).toBe('idle')
    expect(upload.data.value).toBeUndefined()
    fetchSpy.mockRestore()
    host.convex = undefined
  })
})
