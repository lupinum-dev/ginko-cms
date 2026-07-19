// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { ConvexError } from 'convex/values'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'

import { useCmsStudioPaginatedQuery } from '../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery'
import {
  CmsStudioQueryError,
  normalizeCmsStudioQueryError,
  useCmsStudioQuery,
} from '../../packages/cms/studio-app/src/composables/useCmsStudioQuery'

const host = vi.hoisted(() => ({
  bridge: { auth: null as null | Record<string, unknown> },
  convex: undefined as Record<string, ReturnType<typeof vi.fn>> | undefined,
}))

vi.mock('../../packages/cms/studio-app/src/boundary/studio-host-context', () => ({
  useStudioHostContext: () => ({
    getConvexClient: () => host.convex,
    getBridge: () => host.bridge,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: {
    read: 'read',
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    ready: computed(() => {
      const auth = host.bridge.auth as { isAuthenticated?: { value?: boolean } } | null | undefined
      return auth?.isAuthenticated?.value ?? true
    }),
    can: () => computed(() => true),
  }),
}))

// `normalizeCmsStudioQueryError` resolves the function path through the real
// `getFunctionName` from `convex/server` (vNext §10.8), which only recognizes
// an actual `FunctionReference` (the `Symbol.for('functionName')` marker) —
// not the pre-vNext ad hoc `{ _path }` shape.
const query = { [Symbol.for('functionName')]: 'ginkoCms.editor.getEntry' }

describe('useCmsStudioQuery', () => {
  it('retires identity data immediately and ignores queued callbacks from the old user', async () => {
    const user = ref<{ id: string } | null>({ id: 'user-a' })
    const isPending = ref(false)
    const subscriptions: Array<(value: unknown) => void> = []
    const transform = vi.fn((value: unknown) => value)
    const unsubscribe = vi.fn()
    host.bridge.auth = {
      status: computed(() => (isPending.value ? 'loading' : 'authenticated')),
      isPending: computed(() => isPending.value),
      isAuthenticated: computed(() => !isPending.value && user.value !== null),
      user,
    }
    host.convex = {
      onUpdate: vi.fn((_query, _args, next) => {
        subscriptions.push(next)
        return unsubscribe
      }),
    }

    const Host = defineComponent({
      setup() {
        return {
          result: useCmsStudioQuery(query as never, {}, { keepPreviousData: true, transform }),
        }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    await nextTick()

    subscriptions[0]?.({ owner: 'user-a' })
    await nextTick()
    expect(wrapper.vm.result.data.value).toEqual({ owner: 'user-a' })

    isPending.value = true
    await nextTick()
    expect(wrapper.vm.result.data.value).toBeNull()
    expect(unsubscribe).toHaveBeenCalledTimes(1)

    subscriptions[0]?.({ owner: 'retired-user-a' })
    await nextTick()
    expect(wrapper.vm.result.data.value).toBeNull()
    expect(transform).toHaveBeenCalledTimes(1)

    user.value = { id: 'user-b' }
    isPending.value = false
    await nextTick()
    expect(host.convex.onUpdate).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    host.bridge.auth = null
    host.convex = undefined
  })

  it('retires subscriptions across user, anonymous, and replacement-user transitions', async () => {
    const user = ref<{ id: string } | null>({ id: 'user-a' })
    const subscriptions: Array<(value: unknown) => void> = []
    const unsubscribe = vi.fn()
    host.bridge.auth = {
      status: computed(() => (user.value ? 'authenticated' : 'unauthenticated')),
      isPending: computed(() => false),
      isAuthenticated: computed(() => user.value !== null),
      user,
    }
    host.convex = {
      onUpdate: vi.fn((_query, _args, next) => {
        subscriptions.push(next)
        return unsubscribe
      }),
    }

    const Host = defineComponent({
      setup() {
        return { result: useCmsStudioQuery(query as never, {}, { keepPreviousData: true }) }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    await nextTick()
    subscriptions[0]?.({ owner: 'user-a' })
    await nextTick()

    user.value = null
    await nextTick()
    expect(wrapper.vm.result.data.value).toBeNull()
    expect(host.convex.onUpdate).toHaveBeenCalledTimes(1)

    user.value = { id: 'user-b' }
    await nextTick()
    expect(host.convex.onUpdate).toHaveBeenCalledTimes(2)
    subscriptions[1]?.({ owner: 'user-b' })
    await nextTick()
    expect(wrapper.vm.result.data.value).toEqual({ owner: 'user-b' })

    wrapper.unmount()
    host.bridge.auth = null
    host.convex = undefined
  })

  it('does not reacquire when auth rotates for the same identity', async () => {
    const user = ref<{ id: string; tokenVersion: number } | null>({
      id: 'user-a',
      tokenVersion: 1,
    })
    host.bridge.auth = {
      status: computed(() => 'authenticated'),
      isPending: computed(() => false),
      isAuthenticated: computed(() => true),
      user,
    }
    host.convex = { onUpdate: vi.fn(() => vi.fn()) }

    const Host = defineComponent({
      setup() {
        return { result: useCmsStudioQuery(query as never, {}) }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    await nextTick()

    user.value = { id: 'user-a', tokenVersion: 2 }
    await nextTick()
    expect(host.convex.onUpdate).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    host.bridge.auth = null
    host.convex = undefined
  })

  it('keeps normal and paginated reads active during authenticated background auth work', async () => {
    const isPending = ref(false)
    host.bridge.auth = {
      status: computed(() => 'authenticated'),
      isPending: computed(() => isPending.value),
      isAuthenticated: computed(() => true),
      user: ref({ id: 'user-a' }),
    }
    host.convex = {
      onUpdate: vi.fn(() => vi.fn()),
      query: vi.fn(async () => ({ page: [], continueCursor: null, isDone: true })),
    }

    const Host = defineComponent({
      setup() {
        return {
          query: useCmsStudioQuery(query as never, {}),
          paginated: useCmsStudioPaginatedQuery(query as never, {}, { initialNumItems: 25 }),
        }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    await nextTick()
    expect(host.convex.onUpdate).toHaveBeenCalledTimes(2)

    isPending.value = true
    await nextTick()
    expect(host.convex.onUpdate).toHaveBeenCalledTimes(2)
    expect(wrapper.vm.query.status.value).toBe('pending')
    expect(wrapper.vm.paginated.status.value).toBe('loading-first-page')

    wrapper.unmount()
    host.bridge.auth = null
    host.convex = undefined
  })

  it('does not reacquire or commit after scope disposal and is not promise-like', async () => {
    let onResult: ((value: unknown) => void) | null = null
    const transform = vi.fn((value: unknown) => value)
    host.convex = {
      onUpdate: vi.fn((_query, _args, next) => {
        onResult = next
        return vi.fn()
      }),
    }
    const Host = defineComponent({
      setup() {
        return { result: useCmsStudioQuery(query as never, {}, { transform }) }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    await nextTick()
    const result = wrapper.vm.result

    expect('then' in result).toBe(false)
    wrapper.unmount()
    await result.refresh()
    onResult?.({ secret: 'retired' })
    await nextTick()

    expect(host.convex.onUpdate).toHaveBeenCalledTimes(1)
    expect(transform).not.toHaveBeenCalled()
    expect(result.data.value).toBeNull()
    host.convex = undefined
  })

  it('normalizes Studio query errors with query metadata', () => {
    // A real Convex application error (vNext §10.8: classification only reads
    // the library-normalized `ConvexCallError`'s structured `data`, never a
    // bespoke `{ data }` bag bolted onto a plain `Error`).
    const cause = new ConvexError({
      code: 'UNAUTHENTICATED',
      message: 'Sign in required',
      status: 401,
    })

    const error = normalizeCmsStudioQueryError(cause, query)

    expect(error).toBeInstanceOf(CmsStudioQueryError)
    // The library preserves the Convex application error's structured `data`
    // verbatim (vNext §7); the human-readable message Ginko surfaces to
    // Studio UI comes from that structured payload, not from re-deriving a
    // top-level `Error.message` string.
    expect((error.data as { message?: string })?.message).toBe('Sign in required')
    expect(error.operation).toBe('query')
    expect(error.functionPath).toBe('ginkoCms.editor.getEntry')
    expect(error.code).toBe('UNAUTHENTICATED')
    expect(error.status).toBe(401)
    expect(error.category).toBe('auth')
    expect(error.data).toEqual(cause.data)
  })

  it('surfaces query callback failures through structured reactive error state', async () => {
    let onResult: ((value: unknown) => void) | null = null
    let onError: ((error: unknown) => void) | null = null
    const convex = {
      onUpdate: vi.fn((_query, _args, next, fail) => {
        onResult = next
        onError = fail
        return vi.fn()
      }),
    }
    host.convex = convex

    const Host = defineComponent({
      setup() {
        const result = useCmsStudioQuery(query as never, {})
        return { result }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Host)
    await nextTick()

    onError?.(new ConvexError({ code: 'NOT_FOUND', message: 'Entry not found.', status: 404 }))
    await nextTick()

    const result = wrapper.vm.result
    expect(result.status.value).toBe('error')
    expect(result.error.value).toBeInstanceOf(CmsStudioQueryError)
    expect((result.error.value as CmsStudioQueryError).functionPath).toBe(
      'ginkoCms.editor.getEntry',
    )
    expect((result.error.value as CmsStudioQueryError).category).toBe('not_found')

    onResult?.({ _id: 'entry_1' })
    await nextTick()

    expect(result.status.value).toBe('success')
    expect(result.error.value).toBeNull()
    expect(result.data.value).toEqual({ _id: 'entry_1' })
    host.convex = undefined
  })

  it('uses the same structured errors for paginated Studio queries', async () => {
    let onError: ((error: unknown) => void) | null = null
    const convex = {
      onUpdate: vi.fn((_query, _args, _next, fail) => {
        onError = fail
        return vi.fn()
      }),
    }
    host.convex = convex

    const Host = defineComponent({
      setup() {
        const result = useCmsStudioPaginatedQuery(query as never, {}, { initialNumItems: 10 })
        return { result }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Host)
    await nextTick()

    onError?.(new ConvexError({ code: 'LIMIT_RATE', message: 'Slow down.', status: 429 }))
    await nextTick()

    const result = wrapper.vm.result
    expect(result.status.value).toBe('error')
    expect(result.error.value).toBeInstanceOf(CmsStudioQueryError)
    expect((result.error.value as CmsStudioQueryError).functionPath).toBe(
      'ginkoCms.editor.getEntry',
    )
    expect((result.error.value as CmsStudioQueryError).category).toBe('rate_limit')

    host.convex = undefined
  })

  it('rebuilds loaded pages from the new cursor after a live first-page update', async () => {
    let onResult:
      | ((value: { page: string[]; isDone: boolean; continueCursor: string | null }) => void)
      | null = null
    const queryPage = vi
      .fn()
      .mockResolvedValueOnce({ page: ['C', 'D'], isDone: false, continueCursor: 'cursor-2' })
      .mockResolvedValueOnce({ page: ['B', 'C'], isDone: false, continueCursor: 'cursor-new-2' })
    const unsubscribe = vi.fn()
    const convex = {
      onUpdate: vi.fn((_query, _args, next) => {
        onResult = next
        return unsubscribe
      }),
      query: queryPage,
    }
    host.convex = convex

    const Host = defineComponent({
      setup() {
        const result = useCmsStudioPaginatedQuery(query as never, {}, { initialNumItems: 2 })
        return { result }
      },
      render() {
        return h('div')
      },
    })

    const wrapper = mount(Host)
    await nextTick()
    onResult?.({ page: ['A', 'B'], isDone: false, continueCursor: 'cursor-1' })
    await nextTick()

    wrapper.vm.result.loadMore(2)
    await vi.waitFor(() => {
      expect(wrapper.vm.result.results.value).toEqual(['A', 'B', 'C', 'D'])
    })

    // Inserting X moves B across the first cursor boundary. Reusing the old
    // tail would produce X,A,C,D and silently lose B from the visible window.
    onResult?.({ page: ['X', 'A'], isDone: false, continueCursor: 'cursor-new-1' })

    await vi.waitFor(() => {
      expect(wrapper.vm.result.results.value).toEqual(['X', 'A', 'B', 'C'])
    })
    expect(queryPage).toHaveBeenNthCalledWith(
      2,
      query,
      expect.objectContaining({ paginationOpts: { cursor: 'cursor-new-1', numItems: 2 } }),
    )
    expect(convex.onUpdate).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    host.convex = undefined
  })

  it('exposes first-page metadata without mixing it into paginated rows', async () => {
    let onResult:
      | ((value: {
          page: string[]
          isDone: boolean
          continueCursor: string | null
          facets: { activeCount: number }
        }) => void)
      | null = null
    host.convex = {
      onUpdate: vi.fn((_query, _args, next) => {
        onResult = next
        return vi.fn()
      }),
      query: vi.fn(),
    }
    const Host = defineComponent({
      setup() {
        return {
          result: useCmsStudioPaginatedQuery(query as never, {}, { initialNumItems: 2 }),
        }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    await nextTick()
    onResult?.({
      page: ['A'],
      isDone: true,
      continueCursor: null,
      facets: { activeCount: 41 },
    })
    await nextTick()

    expect(wrapper.vm.result.results.value).toEqual(['A'])
    expect(wrapper.vm.result.pageData.value).toEqual({ facets: { activeCount: 41 } })

    wrapper.unmount()
    expect(wrapper.vm.result.pageData.value).toBeNull()
    host.convex = undefined
  })

  it('deduplicates concurrent requests for the same pagination cursor', async () => {
    let onResult:
      | ((value: { page: string[]; isDone: boolean; continueCursor: string | null }) => void)
      | null = null
    let resolvePage!: (value: {
      page: string[]
      isDone: boolean
      continueCursor: string | null
    }) => void
    const pendingPage = new Promise<{
      page: string[]
      isDone: boolean
      continueCursor: string | null
    }>((resolve) => {
      resolvePage = resolve
    })
    host.convex = {
      onUpdate: vi.fn((_query, _args, next) => {
        onResult = next
        return vi.fn()
      }),
      query: vi.fn(() => pendingPage),
    }
    const Host = defineComponent({
      setup() {
        return {
          result: useCmsStudioPaginatedQuery(query as never, {}, { initialNumItems: 2 }),
        }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    await nextTick()
    onResult?.({ page: ['A'], isDone: false, continueCursor: 'same-cursor' })
    await nextTick()

    wrapper.vm.result.loadMore(2)
    wrapper.vm.result.loadMore(2)
    expect(host.convex.query).toHaveBeenCalledTimes(1)

    resolvePage({ page: ['B'], isDone: true, continueCursor: null })
    await vi.waitFor(() => expect(wrapper.vm.result.results.value).toEqual(['A', 'B']))
    wrapper.unmount()
    host.convex = undefined
  })

  it('continues after an empty server-filtered page when a keyset cursor remains', async () => {
    let onResult:
      | ((value: { page: string[]; isDone: boolean; continueCursor: string | null }) => void)
      | null = null
    host.convex = {
      onUpdate: vi.fn((_query, _args, next) => {
        onResult = next
        return vi.fn()
      }),
      query: vi.fn().mockResolvedValue({ page: ['match'], isDone: true, continueCursor: null }),
    }
    const Host = defineComponent({
      setup() {
        return {
          result: useCmsStudioPaginatedQuery(query as never, {}, { initialNumItems: 2 }),
        }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    await nextTick()
    onResult?.({ page: [], isDone: false, continueCursor: 'sparse-page-cursor' })
    await nextTick()

    expect(wrapper.vm.result.hasNextPage.value).toBe(true)
    wrapper.vm.result.loadMore(2)
    await vi.waitFor(() => expect(wrapper.vm.result.results.value).toEqual(['match']))
    expect(host.convex.query).toHaveBeenCalledWith(
      query,
      expect.objectContaining({
        paginationOpts: { cursor: 'sparse-page-cursor', numItems: 2 },
      }),
    )
    wrapper.unmount()
    host.convex = undefined
  })

  it('settles paginated disposal without refresh, load, transform, or stale commits', async () => {
    let onResult:
      | ((value: { page: string[]; isDone: boolean; continueCursor: string | null }) => void)
      | null = null
    const transform = vi.fn((items: string[]) => items)
    host.convex = {
      onUpdate: vi.fn((_query, _args, next) => {
        onResult = next
        return vi.fn()
      }),
      query: vi.fn(),
    }
    const Host = defineComponent({
      setup() {
        return {
          result: useCmsStudioPaginatedQuery(query as never, {}, { initialNumItems: 2, transform }),
        }
      },
      render: () => h('div'),
    })
    const wrapper = mount(Host)
    await nextTick()
    const result = wrapper.vm.result
    expect('then' in result).toBe(false)

    wrapper.unmount()
    await result.refresh()
    await result.reset()
    result.loadMore(2)
    onResult?.({ page: ['retired'], isDone: false, continueCursor: 'retired-cursor' })
    await nextTick()

    expect(host.convex.onUpdate).toHaveBeenCalledTimes(1)
    expect(host.convex.query).not.toHaveBeenCalled()
    expect(transform).not.toHaveBeenCalled()
    expect(result.results.value).toEqual([])
    host.convex = undefined
  })
})
