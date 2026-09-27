import { GinkoEditor, type GinkoEditorHandle } from '@lupinum/ginko-editor'
// @vitest-environment jsdom
import { applyCollaborationSteps, createCollaborationSnapshot } from '@lupinum/ginko-editor/runtime'
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

function mountBody(withEditor = false) {
  const editor = ref<GinkoEditorHandle>()
  const context = ref<StudioAssetContext>({ entryId: 'entry-one', locale: 'en' })
  const disabled = ref(false)
  let body: ReturnType<typeof useSharedEntryBody> | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        body = useSharedEntryBody(context, disabled)
        return () =>
          withEditor && body!.session.value
            ? h(GinkoEditor, {
                ref: editor,
                key: body!.mountKey.value,
                collaboration: body!.session.value,
              })
            : h('div')
      },
    }),
  )
  return { wrapper, body: body!, context, disabled, editor }
}

beforeEach(async () => {
  vi.clearAllMocks()
  mock.principal = ref('user:alice')
  mock.onUpdate.mockReturnValue(() => {})
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
  it('exports then discards pending operations before explicitly reopening the accepted source', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { wrapper, body, editor } = mountBody(true)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const create = vi.fn(() => 'blob:recovery-test')
    const revoke = vi.fn()
    const OriginalURL = URL
    vi.stubGlobal(
      'URL',
      class extends OriginalURL {
        static createObjectURL = create
        static revokeObjectURL = revoke
      },
    )
    try {
      await flushPromises()
      await vi.waitFor(() => expect(mock.onUpdate).toHaveBeenCalled())
      const previous = body.session.value!
      editor.value!.getEditor()!.commands.insertContentAt(1, 'Unsent ')
      vi.useFakeTimers()
      body.keepRecoveryAndReopen()
      await flushPromises()
      expect(create).toHaveBeenCalledOnce()
      expect(click).toHaveBeenCalledOnce()
      expect(previous.state.status).toBe('closed')
      expect(body.session.value).not.toBe(previous)
      expect(body.mode.value).toBe('shared')
      expect(
        sessionStorage.getItem('ginko-cms/body-recovery/v1/user%3Aalice/entry-one/en'),
      ).toBeNull()
      expect(body.session.value!.getRecovery()).toBeNull()
    } finally {
      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(1000)
      vi.useRealTimers()
      vi.unstubAllGlobals()
      online.mockRestore()
      click.mockRestore()
    }
  })

  it.each(['unmount', 'locale', 'principal', 'permission'] as const)(
    'persists just-typed operations under the original principal before %s retires the session',
    async (retirement) => {
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      const { wrapper, body, context, disabled, editor } = mountBody(true)
      try {
        await flushPromises()
        await vi.waitFor(() => expect(editor.value?.getEditor()).toBeDefined())
        await vi.waitFor(() => expect(mock.onUpdate).toHaveBeenCalled())
        const previous = body.session.value!
        editor.value!.getEditor()!.commands.insertContentAt(1, 'Unsent ')
        const key = 'ginko-cms/body-recovery/v1/user%3Aalice/entry-one/en'
        // Do not wait for the debounced recovery write: retiring now must flush it.
        expect(sessionStorage.getItem(key)).toBeNull()
        if (retirement === 'unmount') wrapper.unmount()
        if (retirement === 'locale') context.value = { ...context.value, locale: 'de' }
        if (retirement === 'principal') mock.principal.value = 'user:bob'
        if (retirement === 'permission') disabled.value = true
        await flushPromises()
        expect(previous.state.status).toBe('closed')
        const recovery = JSON.parse(sessionStorage.getItem(key)!)
        expect(recovery.steps.length).toBeGreaterThan(0)
        expect(recovery.document).toContain('Unsent Body.')
        expect(
          sessionStorage.getItem('ginko-cms/body-recovery/v1/user%3Abob/entry-one/en'),
        ).toBeNull()
      } finally {
        wrapper.unmount()
        online.mockRestore()
      }
    },
  )

  it.each(['schema', 'epoch', 'policy'] as const)(
    'keeps pending %s recovery and offers Markdown without replaying it',
    async (change) => {
      const opened = await mock.mutation()
      const base = opened.snapshot
      const steps = [
        JSON.stringify({
          stepType: 'replace',
          from: 1,
          to: 1,
          slice: { content: [{ type: 'text', text: 'Unsent ' }] },
        }),
      ]
      const accepted = await applyCollaborationSteps(
        base,
        { ...base, clientId: 'alice/session_a', steps },
        {
          policy: { version: 2, components: {} },
        },
      )
      const recovery = {
        format: 1,
        clientId: 'alice/session_a',
        base: {
          ...base,
          ...(change === 'schema' ? { schemaRevision: 'ginko-editor-1' } : {}),
          ...(change === 'epoch' ? { epoch: 'old-room' } : {}),
          ...(change === 'policy' ? { policyRevision: 'old-policy' } : {}),
        },
        steps,
        groups: [1],
        document: accepted.snapshot.document,
      }
      const key = 'ginko-cms/body-recovery/v1/user%3Aalice/entry-one/en'
      const encoded = JSON.stringify(recovery)
      sessionStorage.setItem(key, encoded)
      const { wrapper, body } = mountBody()
      await flushPromises()
      expect(body.mode.value).toBe('error')
      expect(body.session.value).toBeUndefined()
      expect(body.recoveryMarkdown.value).toContain('Unsent Body.')
      expect(sessionStorage.getItem(key)).toBe(encoded)
      expect(
        mock.mutation.mock.calls.every(([name]) => name === 'open' || name === undefined),
      ).toBe(true)
      wrapper.unmount()
    },
  )

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
