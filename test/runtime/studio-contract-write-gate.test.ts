// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'

import type { GinkoCmsInstalledContractStatus } from '../../packages/cms/src/public/contract-compatibility'
import type {
  GinkoCmsConvexClientHandle,
  GinkoCmsStudioHostBridge,
} from '../../packages/cms/src/public/types'
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

const expectedContentHash = 'a'.repeat(64)
const expectedPresentationHash = 'b'.repeat(64)
const contractStatusReference = {
  [Symbol.for('functionName')]: 'ginkoCms.contract.getInstalledContractStatus',
}
const readReference = { [Symbol.for('functionName')]: 'ginkoCms.editor.getEntry' }
const mutationReference = { [Symbol.for('functionName')]: 'ginkoCms.editor.saveEntryDraft' }
const actionReference = {
  [Symbol.for('functionName')]: 'ginkoCms.assets.finalizeAssetUploadSession',
}

function fixture(status: GinkoCmsInstalledContractStatus) {
  const raw = {
    query: vi.fn(async (reference: unknown) =>
      reference === contractStatusReference ? status : { id: 'read-result' },
    ),
    mutation: vi.fn(async () => ({ id: 'mutation-result' })),
    action: vi.fn(async () => ({ id: 'action-result' })),
    onUpdate: vi.fn(),
  }
  const bridge = {
    convexClient: raw as unknown as GinkoCmsConvexClientHandle,
    config: {
      route: '/studio',
      defaultLocale: 'en',
      locales: [{ code: 'en', label: 'English' }],
      collections: {},
      contract: { expectedContentHash, expectedPresentationHash },
    },
    api: {
      ginkoCms: {
        contract: { getInstalledContractStatus: contractStatusReference },
      },
    },
    auth: null,
    mcpApiKeys: { create: vi.fn(), delete: vi.fn() },
    onSignOut: vi.fn(),
  } as unknown as GinkoCmsStudioHostBridge
  return { raw, context: createStudioHostContext(() => bridge) }
}

const readyStatus: GinkoCmsInstalledContractStatus = {
  installedContentHash: expectedContentHash,
  installedPresentationHash: expectedPresentationHash,
  transitionState: 'ready',
  transitionRunId: null,
}

describe('Studio host contract write gate', () => {
  it.each([
    {
      label: 'a missing installed contract',
      status: {
        installedContentHash: null,
        installedPresentationHash: null,
        transitionState: null,
        transitionRunId: null,
      } satisfies GinkoCmsInstalledContractStatus,
      blocker: 'contract_missing',
    },
    {
      label: 'content hash drift',
      status: { ...readyStatus, installedContentHash: 'c'.repeat(64) },
      blocker: 'content_mismatch',
    },
    {
      label: 'presentation hash drift',
      status: { ...readyStatus, installedPresentationHash: 'c'.repeat(64) },
      blocker: 'presentation_mismatch',
    },
    {
      label: 'an active transition',
      status: { ...readyStatus, transitionState: 'locked' as const, transitionRunId: 'run-1' },
      blocker: 'transition_locked',
    },
  ])('blocks mutations for $label without dispatching the write', async ({ status, blocker }) => {
    const { context, raw } = fixture(status)

    const write = context.requireConvexClient().mutation(mutationReference as never, {})

    await expect(write).rejects.toMatchObject({
      code: 'CMS_CONTRACT_WRITE_BLOCKED',
      compatibility: { writable: false, blockers: expect.arrayContaining([blocker]) },
    })
    expect(raw.mutation).not.toHaveBeenCalled()
  })

  it('keeps reads available while refusing a mismatched write', async () => {
    const { context, raw } = fixture({
      ...readyStatus,
      installedContentHash: 'c'.repeat(64),
    })

    await expect(context.getConvexClient().query(readReference as never, {})).resolves.toEqual({
      id: 'read-result',
    })
    await expect(
      context.requireConvexClient().mutation(mutationReference as never, {}),
    ).rejects.toMatchObject({ code: 'CMS_CONTRACT_WRITE_BLOCKED' })
    expect(raw.query).toHaveBeenCalledWith(readReference, {})
    expect(raw.mutation).not.toHaveBeenCalled()
  })

  it('dispatches mutations and actions only after both hashes and transition state match', async () => {
    const { context, raw } = fixture(readyStatus)

    await expect(
      context.requireConvexClient().mutation(mutationReference as never, {}),
    ).resolves.toEqual({ id: 'mutation-result' })
    await expect(
      context.requireConvexClient().action(actionReference as never, {}),
    ).resolves.toEqual({ id: 'action-result' })

    expect(raw.query).toHaveBeenCalledTimes(2)
    expect(raw.mutation).toHaveBeenCalledTimes(1)
    expect(raw.action).toHaveBeenCalledTimes(1)
  })

  it('refuses uploads before creating a session or dispatching storage bytes', async () => {
    const { context, raw } = fixture({
      ...readyStatus,
      installedPresentationHash: 'c'.repeat(64),
    })
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
      global: { provide: { [studioHostContextKey as symbol]: context } },
    })

    await expect(
      wrapper.vm.upload(new File(['bytes'], 'asset.png', { type: 'image/png' })),
    ).rejects.toThrow('presentation contract does not match')
    expect(raw.mutation).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()

    wrapper.unmount()
    fetchSpy.mockRestore()
  })
})
