// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// §10.3 / "Ginko tests": sign-in and sign-up must resolve atomically off
// `useConvexAuth().signIn`/`signUp` alone — no manual `refreshAuth()` call and
// no separate `watch`-based redirect racing the post-submit navigation
// (vNext §5.3: `signIn`/`signUp` synchronize Convex automatically).

const navigateToMock = vi.hoisted(() => vi.fn())
const routeQuery = vi.hoisted(() => ({}) as Record<string, string>)
const authState = vi.hoisted(() => ({
  isAuthenticated: { value: false },
  isPending: { value: false },
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  refresh: vi.fn(),
  awaitAuthReady: vi.fn(),
  refreshAuth: vi.fn(),
}))

vi.mock('#imports', async () => {
  const vue = await import('vue')
  authState.isAuthenticated = vue.ref(authState.isAuthenticated.value)
  authState.isPending = vue.ref(authState.isPending.value)
  return {
    computed: vue.computed,
    navigateTo: navigateToMock,
    onMounted: vue.onMounted,
    ref: vue.ref,
    useAttrs: vue.useAttrs,
    watch: vue.watch,
    useConvexAuth: () => ({
      isAuthenticated: authState.isAuthenticated,
      isPending: authState.isPending,
      signIn: { email: authState.signInEmail },
      signUp: { email: authState.signUpEmail },
      client: {
        requestPasswordReset: authState.requestPasswordReset,
        resetPassword: authState.resetPassword,
      },
      // Present so a stray call is observable, but neither component may call it.
      refresh: authState.refresh,
    }),
    useRoute: () => ({ query: routeQuery }),
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
const { default: CmsAuthRecover } =
  await import('../../packages/cms/src/auth/components/CmsAuthRecover.vue')
const { default: CmsAuthResetPassword } =
  await import('../../packages/cms/src/auth/components/CmsAuthResetPassword.vue')

describe('CmsAuthSignIn (vNext §10.3, no manual refresh)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    authState.isAuthenticated.value = false
    authState.isPending.value = false
    for (const key of Object.keys(routeQuery)) Reflect.deleteProperty(routeQuery, key)
  })

  it('[ACC-01] returns a successful sign-in to the requested protected deep link', async () => {
    routeQuery.redirect = '/studio/reviews?locale=de'
    authState.signInEmail.mockResolvedValue({ error: null })
    const wrapper = mount(CmsAuthSignIn, {
      props: { redirectTo: '/studio' },
      global: { stubs: globalStubs },
    })
    await nextTick()

    await wrapper.find('[data-testid="cms-auth-email"]').setValue('user@example.com')
    await wrapper.find('[data-testid="cms-auth-password"]').setValue('correct horse battery')
    await wrapper.find('[data-testid="cms-auth-form"]').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(authState.signInEmail).toHaveBeenCalledTimes(1)
    expect(authState.refresh).not.toHaveBeenCalled()
    expect(authState.refreshAuth).not.toHaveBeenCalled()
    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/studio/reviews?locale=de', { replace: true })
  })

  it('does not re-enter protected navigation while atomic sign-in is pending', async () => {
    let resolveSignIn!: (result: { error: null }) => void
    authState.signInEmail.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve
      }),
    )
    const wrapper = mount(CmsAuthSignIn, {
      props: { redirectTo: '/studio' },
      global: { stubs: globalStubs },
    })
    await nextTick()

    await wrapper.find('[data-testid="cms-auth-email"]').setValue('user@example.com')
    await wrapper.find('[data-testid="cms-auth-password"]').setValue('correct horse battery')
    await wrapper.find('[data-testid="cms-auth-form"]').trigger('submit')
    await vi.waitFor(() => expect(authState.signInEmail).toHaveBeenCalledTimes(1))

    authState.isAuthenticated.value = true
    await nextTick()
    expect(navigateToMock).not.toHaveBeenCalled()

    resolveSignIn({ error: null })
    await vi.waitFor(() => expect(navigateToMock).toHaveBeenCalledTimes(1))
    expect(navigateToMock).toHaveBeenCalledWith('/studio', { replace: true })
  })

  it('surfaces a sign-in error without navigating or refreshing', async () => {
    authState.signInEmail.mockResolvedValue({ error: { message: 'Invalid credentials' } })
    const wrapper = mount(CmsAuthSignIn, {
      props: { redirectTo: '/studio' },
      global: { stubs: globalStubs },
    })
    await nextTick()

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
    for (const key of Object.keys(routeQuery)) Reflect.deleteProperty(routeQuery, key)
  })

  it('navigates on successful sign-up without calling refreshAuth or auth.refresh', async () => {
    authState.signUpEmail.mockResolvedValue({ error: null })
    const wrapper = mount(CmsAuthSignUp, {
      props: { redirectTo: '/studio' },
      global: { stubs: globalStubs },
    })
    await nextTick()

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

describe('[ACC-05] Better Auth password recovery', () => {
  afterEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(routeQuery)) Reflect.deleteProperty(routeQuery, key)
  })

  it('[ACC-05] uses one enumeration-safe response and a same-origin provider callback', async () => {
    routeQuery.email = 'person@example.com'
    authState.requestPasswordReset.mockResolvedValueOnce({ error: null })
    const success = mount(CmsAuthRecover, {
      props: { redirectTo: '/studio/reviews', studioRoute: '/studio' },
      global: { stubs: globalStubs },
    })
    await success.find('[data-testid="cms-auth-recovery-form"]').trigger('submit')
    await vi.waitFor(() =>
      expect(success.find('[data-testid="cms-auth-recovery-submitted"]').exists()).toBe(true),
    )
    const successCopy = success.find('[data-testid="cms-auth-recovery-submitted"]').text()
    expect(authState.requestPasswordReset).toHaveBeenCalledWith({
      email: 'person@example.com',
      redirectTo: 'http://localhost:3000/studio/auth/reset-password?redirect=%2Fstudio%2Freviews',
    })

    authState.requestPasswordReset.mockRejectedValueOnce(new Error('delivery unavailable'))
    const unavailable = mount(CmsAuthRecover, {
      props: { redirectTo: '/studio/reviews', studioRoute: '/studio' },
      global: { stubs: globalStubs },
    })
    await unavailable.find('[data-testid="cms-auth-recovery-form"]').trigger('submit')
    await vi.waitFor(() =>
      expect(unavailable.find('[data-testid="cms-auth-recovery-submitted"]').exists()).toBe(true),
    )
    expect(unavailable.find('[data-testid="cms-auth-recovery-submitted"]').text()).toBe(successCopy)
  })

  it('submits the provider token once and returns to sign-in without granting CMS access', async () => {
    routeQuery.token = 'one-time-token'
    authState.resetPassword.mockResolvedValueOnce({ data: { status: true }, error: null })
    const wrapper = mount(CmsAuthResetPassword, {
      props: { redirectTo: '/studio/content/posts', studioRoute: '/studio' },
      global: { stubs: globalStubs },
    })
    await wrapper.find('[data-testid="cms-auth-reset-password"]').setValue('new password 123')
    await wrapper
      .find('[data-testid="cms-auth-reset-confirm-password"]')
      .setValue('new password 123')
    await wrapper.find('[data-testid="cms-auth-reset-form"]').trigger('submit')
    await vi.waitFor(() => expect(authState.resetPassword).toHaveBeenCalledTimes(1))

    expect(authState.resetPassword).toHaveBeenCalledWith({
      newPassword: 'new password 123',
      token: 'one-time-token',
    })
    expect(navigateToMock).toHaveBeenCalledWith(
      '/studio/auth/signin?redirect=%2Fstudio%2Fcontent%2Fposts&recovered=1',
      { replace: true },
    )

    navigateToMock.mockClear()
    authState.resetPassword.mockResolvedValueOnce({
      data: null,
      error: { code: 'INVALID_TOKEN' },
    })
    const reused = mount(CmsAuthResetPassword, {
      props: { redirectTo: '/studio/content/posts', studioRoute: '/studio' },
      global: { stubs: globalStubs },
    })
    await reused.find('[data-testid="cms-auth-reset-password"]').setValue('new password 123')
    await reused
      .find('[data-testid="cms-auth-reset-confirm-password"]')
      .setValue('new password 123')
    await reused.find('[data-testid="cms-auth-reset-form"]').trigger('submit')
    await vi.waitFor(() =>
      expect(reused.find('[data-testid="cms-auth-reset-error"]').text()).toContain(
        'ginkoCms.auth.recovery.invalidToken',
      ),
    )
    expect(navigateToMock).not.toHaveBeenCalled()
  })
})
