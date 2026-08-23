// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

const nuxtLifecycle = vi.hoisted(() => ({
  fullPath: '/',
  pageFinished: undefined as (() => Promise<void>) | undefined,
  isHydrating: false,
}))

vi.mock('#imports', async () => {
  const vue = await import('vue')
  return {
    onMounted: vue.onMounted,
    ref: vue.ref,
    useConvexConfig: () => ({ siteUrl: 'http://127.0.0.1:3211' }),
    useNuxtApp: () => ({
      get isHydrating() {
        return nuxtLifecycle.isHydrating
      },
      hooks: {
        hookOnce: (_name: 'page:finish', callback: () => Promise<void>) => {
          nuxtLifecycle.pageFinished = callback
        },
      },
    }),
    useRoute: () => ({
      get fullPath() {
        return nuxtLifecycle.fullPath
      },
    }),
  }
})

const { useVerifiedOAuthTransaction } =
  await import('../../packages/cms/src/auth/oauth/useVerifiedOAuthTransaction')

describe('verified OAuth transaction', () => {
  afterEach(() => {
    nuxtLifecycle.pageFinished = undefined
    nuxtLifecycle.fullPath = '/'
    nuxtLifecycle.isHydrating = false
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('uses the Nuxt route as the signed transaction source', async () => {
    const parameters = new URLSearchParams({
      client_id: 'client-codex',
      resource: 'http://127.0.0.1:3211/mcp',
      scope: 'cms.read cms.entries.edit',
      state: 'provider-signed-state',
      sig: 'provider-signature',
    })
    window.history.replaceState({}, '', `/oauth/consent?${parameters.toString()}`)
    nuxtLifecycle.fullPath = `/oauth/consent?${parameters.toString()}`
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ client_id: 'client-codex', client_name: 'Codex' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(
      defineComponent({
        setup() {
          const state = useVerifiedOAuthTransaction()
          return () => h('div', state.transaction.value?.clientName ?? state.errorMessage.value)
        },
      }),
    )

    await vi.waitFor(() => expect(wrapper.text()).toBe('Codex'))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/oauth2/public-client-prelogin',
      expect.objectContaining({
        body: JSON.stringify({
          client_id: 'client-codex',
          oauth_query: parameters.toString(),
        }),
      }),
    )
  })

  it('waits for Nuxt to restore the signed query during hydration', async () => {
    nuxtLifecycle.isHydrating = true
    window.history.replaceState({}, '', '/oauth/consent')
    nuxtLifecycle.fullPath = '/oauth/consent'
    const parameters = new URLSearchParams({
      client_id: 'client-codex',
      resource: 'http://127.0.0.1:3211/mcp',
      scope: 'cms.read cms.entries.edit',
      state: 'provider-signed-state',
      sig: 'provider-signature',
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ client_id: 'client-codex', client_name: 'Codex' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(
      defineComponent({
        setup() {
          const state = useVerifiedOAuthTransaction()
          return () => h('div', state.transaction.value?.clientName ?? state.errorMessage.value)
        },
      }),
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(nuxtLifecycle.pageFinished).toBeTypeOf('function')
    nuxtLifecycle.fullPath = `/oauth/consent?${parameters.toString()}`
    await nuxtLifecycle.pageFinished?.()

    await vi.waitFor(() => expect(wrapper.text()).toBe('Codex'))
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
