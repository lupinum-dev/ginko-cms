// @vitest-environment jsdom

import { createHash, webcrypto } from 'node:crypto'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import InvitationPage from '../../packages/cms/studio-app/src/pages/invitations/accept.vue'

const state = vi.hoisted(() => ({ hash: '', accept: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => state }))
vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: { ginkoCms: { members: { acceptMemberInvitation: 'accept' } } },
}))
vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => state.accept,
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

const wrappers: ReturnType<typeof mount>[] = []
const rawToken = `local-invitation-${'a'.repeat(64)}`

beforeEach(() => {
  state.hash = `#token=${rawToken}`
  state.accept.mockReset()
  vi.stubGlobal('crypto', webcrypto)
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
})

function page() {
  const wrapper = mount(InvitationPage, {
    global: {
      stubs: {
        Card: { template: '<section><slot /></section>' },
        CardHeader: { template: '<header><slot /></header>' },
        CardTitle: { template: '<h1><slot /></h1>' },
        CardDescription: { template: '<p><slot /></p>' },
        CardContent: { template: '<div><slot /></div>' },
        Button: { template: '<button><slot /></button>' },
        StudioNotice: { props: ['description'], template: '<p role="alert">{{ description }}</p>' },
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('Invitation acceptance recovery', () => {
  it('retains the same derived proof for a transient retry and clears the error after success', async () => {
    state.accept
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockResolvedValueOnce({ role: 'publisher' })
    const wrapper = page()
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(state.accept).toHaveBeenCalledTimes(1))
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('retryDescription')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    const expectedProof = createHash('sha256').update(rawToken).digest('hex')
    expect(state.accept.mock.calls).toEqual([
      [{ tokenProof: expectedProof }],
      [{ tokenProof: expectedProof }],
    ])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('acceptedTitle')
  })

  it('keeps definitive rejection enumeration-safe and disables a consumed invalid proof', async () => {
    state.accept.mockRejectedValue({
      data: { code: 'MEMBER_INVITATION_INVALID', message: 'Private server detail' },
    })
    const wrapper = page()
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(state.accept).toHaveBeenCalledTimes(1))
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('invitationPage.invalid')
    expect(wrapper.text()).not.toContain('Private server detail')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('does not reuse a previous mounted page proof when a new page has no invitation', async () => {
    state.accept.mockRejectedValue(new Error('Connection interrupted'))
    const first = page()
    await first.get('button').trigger('click')
    await vi.waitFor(() => expect(state.accept).toHaveBeenCalledTimes(1))
    await flushPromises()
    first.unmount()
    state.hash = ''
    const next = page()
    await next.get('button').trigger('click')
    await flushPromises()
    expect(state.accept).toHaveBeenCalledTimes(1)
    expect(next.get('button').attributes('disabled')).toBeDefined()
  })
})
