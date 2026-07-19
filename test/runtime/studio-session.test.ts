import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const auth = {
  isAuthenticated: ref(true),
  isPending: ref(false),
  status: ref('authenticated'),
  user: ref<{ id: string; name: string; email: string; image: null } | null>({
    id: 'member-1',
    name: 'Member',
    email: 'member@example.com',
    image: null,
  }),
  error: ref<Error | null>(null),
}
const bridgeState = {
  auth,
  onSignOut: vi.fn(async () => {
    auth.isAuthenticated.value = false
    auth.status.value = 'unauthenticated'
    auth.user.value = null
  }),
}

vi.doMock('../../packages/cms/studio-app/src/boundary/studio-host-context', () => ({
  useStudioHostContext: () => ({ getBridge: () => bridgeState }),
}))

const { useCmsAuthState } =
  await import('../../packages/cms/studio-app/src/composables/useCmsAuthState')

describe('Studio session boundary', () => {
  afterEach(() => {
    bridgeState.onSignOut.mockClear()
    auth.isAuthenticated.value = true
    auth.status.value = 'authenticated'
    auth.user.value = {
      id: 'member-1',
      name: 'Member',
      email: 'member@example.com',
      image: null,
    }
    auth.error.value = null
  })

  it('[ACC-03] signs out through the host session and clears reactive member state', async () => {
    const state = useCmsAuthState()
    expect(state.isAuthenticated.value).toBe(true)
    expect(state.user.value?.id).toBe('member-1')

    await state.signOut()

    expect(bridgeState.onSignOut).toHaveBeenCalledTimes(1)
    expect(state.isAuthenticated.value).toBe(false)
    expect(state.user.value).toBeNull()
    expect(state.principalKey.value).toBe('anonymous')
  })

  it('preserves authentication infrastructure failures as a distinct bridge state', () => {
    auth.error.value = new Error('authentication unavailable')
    auth.isAuthenticated.value = false
    auth.status.value = 'unauthenticated'
    auth.user.value = null

    const state = useCmsAuthState()
    expect(state.error.value?.message).toBe('authentication unavailable')
    expect(state.isAuthenticated.value).toBe(false)
  })
})
