// @vitest-environment jsdom
import { createCollaborationSnapshot } from '@lupinum/ginko-editor/runtime'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import type { StudioAssetContext } from '../../packages/cms/studio-app/src/composables/internal/types'
import { useSharedEntryBody } from '../../packages/cms/studio-app/src/composables/internal/useSharedEntryBody'

const mock = vi.hoisted(() => ({
  mutation: vi.fn(),
  query: vi.fn(),
  onUpdate: vi.fn(),
  principal: { value: 'user:alice' },
  pending: { value: false },
}))
vi.mock('@lupinum/better-convex-vue', () => ({ useConvex: () => mock }))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsAuthState', () => ({
  useCmsAuthState: () => ({
    authEnabled: { value: true },
    isAuthenticated: { value: true },
    principalKey: mock.principal,
    pending: mock.pending,
  }),
}))
vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: {
    ginkoCms: {
      editor: {
        openSharedBody: 'open',
        getSharedBodyHead: 'head',
        pullSharedBody: 'pull',
        pushSharedBody: 'push',
      },
    },
  },
}))

function mountBody() {
  const context = ref<StudioAssetContext>({ entryId: 'entry-one', locale: 'en' })
  const disabled = ref(false)
  let body: ReturnType<typeof useSharedEntryBody> | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        body = useSharedEntryBody(context, disabled)
        return () => h('div')
      },
    }),
  )
  return { wrapper, body: body!, context, disabled }
}

beforeEach(async () => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mock.pending.value = false
  const checkpoint = await createCollaborationSnapshot('Body.', {
    policy: { version: 2, components: {} },
    epoch: 'room-one',
    policyRevision: 'contract-one',
  })
  mock.mutation.mockResolvedValue({
    available: true,
    snapshot: checkpoint.snapshot,
    clientPrefix: 'alice/',
  })
})

describe('Studio shared body host', () => {
  it('opens the authenticated locale and retires the previous session when the locale changes', async () => {
    const { wrapper, body, context } = mountBody()
    await flushPromises()
    expect(mock.mutation).toHaveBeenCalledWith('open', { entryId: 'entry-one', locale: 'en' })
    expect(body.mode.value).toBe('shared')
    const previous = body.session.value!
    context.value = { ...context.value, locale: 'de' }
    await flushPromises()
    expect(previous.state.status).toBe('closed')
    expect(body.session.value).not.toBe(previous)
    expect(mock.mutation).toHaveBeenLastCalledWith('open', { entryId: 'entry-one', locale: 'de' })
    wrapper.unmount()
  })

  it('keeps an unsupported source in local mode only when no recovery copy would be lost', async () => {
    mock.mutation.mockResolvedValue({ available: false, reason: 'source' })
    const first = mountBody()
    await flushPromises()
    expect(first.body.mode.value).toBe('local')
    first.wrapper.unmount()
    sessionStorage.setItem(
      'ginko-cms/body-recovery/v1/user%3Aalice/entry-one/en',
      '{"unsent":"must survive"}',
    )
    const second = mountBody()
    await flushPromises()
    expect(second.body.mode.value).toBe('error')
    expect(second.body.recoverySource.value).toContain('must survive')
    expect(sessionStorage.length).toBe(1)
    second.wrapper.unmount()
  })

  it('never falls back to writable local mode after an authorization or connection failure', async () => {
    mock.mutation.mockRejectedValue(new Error('Access was revoked'))
    const { wrapper, body } = mountBody()
    await flushPromises()
    expect(body.mode.value).toBe('error')
    expect(body.session.value).toBeUndefined()
    expect(body.ready.value).toBe(false)
    wrapper.unmount()
  })

  it('ignores an obsolete open response after document switching', async () => {
    const opened = await mock.mutation()
    let resolve: ((value: typeof opened) => void) | undefined
    mock.mutation.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const { wrapper, body, context } = mountBody()
    context.value = { entryId: 'entry-two', locale: 'en' }
    await flushPromises()
    const current = body.session.value
    resolve!(opened)
    await flushPromises()
    expect(body.session.value).toBe(current)
    wrapper.unmount()
  })
})
