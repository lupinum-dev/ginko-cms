// @vitest-environment jsdom

import { createBetterConvex } from '@lupinum/better-convex-vue'
import { createBetterConvexAttachment } from '@lupinum/better-convex-vue/embedded'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { useConvexUpload } from '../../packages/cms/studio-app/src/composables/useStudioConvex'

const host = vi.hoisted(() => ({
  bridge: {
    auth: {
      snapshot: () => ({
        status: 'authenticated',
        pending: false,
        user: { id: 'publisher-1' },
        error: null,
      }),
      subscribe: () => () => {},
    },
  },
}))

vi.mock('../../packages/cms/studio-app/src/boundary/studio-host-context', () => ({
  useStudioHostContext: () => ({ getBridge: () => host.bridge }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: { read: 'read' },
}))

const mutation = { [Symbol.for('functionName')]: 'ginkoCms.assets.createAssetUploadSession' }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('Studio upload scope', () => {
  it('stops upload work after disposal before dispatching bytes', async () => {
    const uploadSession = deferred<{
      sessionId: string
      uploadUrl: string
      token: string
      expiresAt: number
    }>()
    const client = {
      query: vi.fn(),
      mutation: vi.fn(() => uploadSession.promise),
      action: vi.fn(),
      onUpdate: vi.fn(),
    }
    const attachment = createBetterConvexAttachment({
      client: client as never,
      anonymousClient: client as never,
      identity: {
        snapshot: () => ({
          authEnabled: true,
          settled: true,
          identityKey: 'user:publisher-1',
          authEpoch: 1,
          identityGeneration: 1,
          error: null,
        }),
        waitForInitialSettlement: async () => {},
        subscribe: () => () => {},
      },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const Host = defineComponent({
      setup() {
        return { upload: useConvexUpload(mutation as never, mutation as never) }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host, {
      global: { plugins: [createBetterConvex({ attachment })] },
    })
    const upload = wrapper.vm.upload
    const promise = upload(new File(['bytes'], 'asset.png', { type: 'image/png' }))
    wrapper.unmount()
    uploadSession.resolve({
      sessionId: 'session-1',
      uploadUrl: 'https://storage.example.test/upload',
      token: 'shown-once-token',
      expiresAt: Date.now() + 60_000,
    })

    await expect(promise).rejects.toThrow('Unknown Convex error')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(upload.status.value).toBe('idle')
    expect(upload.data.value).toBeUndefined()
    fetchSpy.mockRestore()
  })
})
