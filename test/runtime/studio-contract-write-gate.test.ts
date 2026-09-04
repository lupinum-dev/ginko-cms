// @vitest-environment jsdom

import { createBetterConvex } from '@lupinum/better-convex-vue'
import { createBetterConvexAttachment } from '@lupinum/better-convex-vue/embedded'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'

import type { GinkoCmsStudioHostBridge } from '../../packages/cms/src/public/types'
import {
  createStudioHostContext,
  studioHostContextKey,
} from '../../packages/cms/studio-app/src/boundary/studio-host-context'
import { useConvexUpload } from '../../packages/cms/studio-app/src/composables/useStudioConvex'

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: { read: 'read' },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    ready: computed(() => true),
    can: () => computed(() => true),
  }),
}))

const readReference = {
  [Symbol.for('functionName')]: 'ginkoCms.editor.getEntry',
}
const mutationReference = {
  [Symbol.for('functionName')]: 'ginkoCms.editor.saveEntryDraft',
}
const actionReference = {
  [Symbol.for('functionName')]: 'ginkoCms.assets.finalizeAssetUploadSession',
}

function fixture() {
  const raw = {
    query: vi.fn(async () => ({ id: 'read-result' })),
    mutation: vi.fn(async () => ({ id: 'mutation-result' })),
    action: vi.fn(async () => ({ id: 'action-result' })),
    onUpdate: vi.fn(),
  }
  const bridge = {
    attachment: createBetterConvexAttachment({
      client: raw as never,
      anonymousClient: raw as never,
      identity: {
        snapshot: () => ({
          authEnabled: false,
          settled: true,
          identityKey: 'anonymous',
          authEpoch: 0,
          identityGeneration: 0,
          error: null,
        }),
        waitForInitialSettlement: async () => {},
        subscribe: () => () => {},
      },
    }),
    config: {
      route: '/studio',
      defaultLocale: 'en',
      locales: [{ code: 'en', label: 'English' }],
      collections: {},
    },
    api: { ginkoCms: {} },
    auth: null,
    mcpApiKeys: { create: vi.fn(), delete: vi.fn() },
    onSignOut: vi.fn(),
  } as unknown as GinkoCmsStudioHostBridge
  return { raw, context: createStudioHostContext(() => bridge) }
}

describe('Studio host delegates write policy to canonical backend guards', () => {
  it('does not add a blanket contract-status query before reads or writes', async () => {
    const { context, raw } = fixture()

    await expect(context.attachment.client.query(readReference as never, {})).resolves.toEqual({
      id: 'read-result',
    })
    await expect(
      context.attachment.client.mutation(mutationReference as never, {}),
    ).resolves.toEqual({
      id: 'mutation-result',
    })
    await expect(context.attachment.client.action(actionReference as never, {})).resolves.toEqual({
      id: 'action-result',
    })

    expect(raw.query).toHaveBeenCalledWith(readReference, {})
    expect(raw.mutation).toHaveBeenCalledTimes(1)
    expect(raw.action).toHaveBeenCalledTimes(1)
  })

  it('lets the upload-session mutation reject before any storage bytes are sent', async () => {
    const { context, raw } = fixture()
    raw.mutation.mockRejectedValueOnce(new Error('CMS_CONTRACT_WRITE_BLOCKED'))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const Host = defineComponent({
      setup() {
        return {
          upload: useConvexUpload(mutationReference as never, mutationReference as never),
        }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host, {
      global: {
        plugins: [createBetterConvex({ attachment: context.attachment })],
        provide: { [studioHostContextKey as symbol]: context },
      },
    })

    await expect(
      wrapper.vm.upload(new File(['bytes'], 'asset.png', { type: 'image/png' })),
    ).rejects.toThrow('Unknown Convex error')
    expect(raw.mutation).toHaveBeenCalledTimes(1)
    expect(raw.query).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()

    wrapper.unmount()
    fetchSpy.mockRestore()
  })
})
