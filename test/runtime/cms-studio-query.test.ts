// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { ConvexError } from 'convex/values'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'

import { useCmsStudioPaginatedQuery } from '../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery'
import {
  CmsStudioQueryError,
  normalizeCmsStudioQueryError,
  useCmsStudioQuery,
} from '../../packages/cms/studio-app/src/composables/useCmsStudioQuery'

const host = vi.hoisted(() => ({
  convex: undefined as
    | {
        onUpdate: ReturnType<typeof vi.fn>
      }
    | undefined,
}))

vi.mock('../../packages/cms/studio-app/src/boundary/studio-host-context', () => ({
  useStudioHostContext: () => ({
    getConvexClient: () => host.convex,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: {
    read: 'read',
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    ready: computed(() => true),
    can: () => computed(() => true),
  }),
}))

// `normalizeCmsStudioQueryError` resolves the function path through the real
// `getFunctionName` from `convex/server` (vNext §10.8), which only recognizes
// an actual `FunctionReference` (the `Symbol.for('functionName')` marker) —
// not the pre-vNext ad hoc `{ _path }` shape.
const query = { [Symbol.for('functionName')]: 'ginkoCms.editor.getEntry' }

describe('useCmsStudioQuery', () => {
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
})
