// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

// §10.3 / "Ginko tests": sign-in and sign-up must resolve atomically off
// `useConvexAuth().signIn`/`signUp` alone — no manual `refreshAuth()` call and
// no separate `watch`-based redirect racing the post-submit navigation
// (vNext §5.3: `signIn`/`signUp` synchronize Convex automatically).

const navigateToMock = vi.hoisted(() => vi.fn())
const authState = vi.hoisted(() => ({
  isAuthenticated: { value: false },
  isPending: { value: false },
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  refresh: vi.fn(),
  awaitAuthReady: vi.fn(),
  refreshAuth: vi.fn(),
}))

vi.mock('#imports', async () => {
  const vue = await import('vue')
  return {
    computed: vue.computed,
    navigateTo: navigateToMock,
    onMounted: vue.onMounted,
    ref: vue.ref,
    useAttrs: vue.useAttrs,
    useConvexAuth: () => ({
      isAuthenticated: authState.isAuthenticated,
      isPending: authState.isPending,
      signIn: { email: authState.signInEmail },
      signUp: { email: authState.signUpEmail },
      // Present so a stray call is observable, but neither component may call it.
      refresh: authState.refresh,
    }),
    useRoute: () => ({ query: {} }),
  }
})

vi.mock('#ginko-cms-public/composables/useCmsI18n.js', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

const globalStubs = { NuxtLink: { template: '<a><slot /></a>' } }

const { default: CmsAuthSignIn } =
  await import('../../packages/cms/src/auth/components/CmsAuthSignIn.vue')
const { default: CmsAuthSignUp } =
  await import('../../packages/cms/src/auth/components/CmsAuthSignUp.vue')

describe('CmsAuthSignIn (vNext §10.3, no manual refresh)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    authState.isAuthenticated.value = false
    authState.isPending.value = false
  })

  it('navigates on successful sign-in without calling refreshAuth or auth.refresh', async () => {
    authState.signInEmail.mockResolvedValue({ error: null })
    const wrapper = mount(CmsAuthSignIn, {
      props: { redirectTo: '/studio' },
      global: { stubs: globalStubs },
    })

    await wrapper.find('[data-testid="cms-auth-email"]').setValue('user@example.com')
    await wrapper.find('[data-testid="cms-auth-password"]').setValue('correct horse battery')
    await wrapper.find('[data-testid="cms-auth-form"]').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(authState.signInEmail).toHaveBeenCalledTimes(1)
    expect(authState.refresh).not.toHaveBeenCalled()
    expect(authState.refreshAuth).not.toHaveBeenCalled()
    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/studio', { replace: true })
  })

  it('surfaces a sign-in error without navigating or refreshing', async () => {
    authState.signInEmail.mockResolvedValue({ error: { message: 'Invalid credentials' } })
    const wrapper = mount(CmsAuthSignIn, {
      props: { redirectTo: '/studio' },
      global: { stubs: globalStubs },
    })

    await wrapper.find('[data-testid="cms-auth-email"]').setValue('user@example.com')
    await wrapper.find('[data-testid="cms-auth-password"]').setValue('wrong')
    await wrapper.find('[data-testid="cms-auth-form"]').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.find('[data-testid="cms-auth-error"]').text()).toBe('Invalid credentials')
    expect(navigateToMock).not.toHaveBeenCalled()
    expect(authState.refresh).not.toHaveBeenCalled()
  })
})

describe('CmsAuthSignUp (vNext §10.3, no manual refresh)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    authState.isAuthenticated.value = false
    authState.isPending.value = false
  })

  it('navigates on successful sign-up without calling refreshAuth or auth.refresh', async () => {
    authState.signUpEmail.mockResolvedValue({ error: null })
    const wrapper = mount(CmsAuthSignUp, {
      props: { redirectTo: '/studio' },
      global: { stubs: globalStubs },
    })

    await wrapper.find('[data-testid="cms-auth-register-email"]').setValue('user@example.com')
    await wrapper.find('input#name').setValue('Jane Doe')
    await wrapper
      .find('[data-testid="cms-auth-register-password"]')
      .setValue('correct horse battery')
    await wrapper
      .find('[data-testid="cms-auth-register-confirm-password"]')
      .setValue('correct horse battery')
    await wrapper.find('[data-testid="cms-auth-register-form"]').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(authState.signUpEmail).toHaveBeenCalledTimes(1)
    expect(authState.refresh).not.toHaveBeenCalled()
    expect(authState.refreshAuth).not.toHaveBeenCalled()
    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/studio', { replace: true })
  })
})
