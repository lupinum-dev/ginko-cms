// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
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

const query = { _path: 'ginkoCms.editor.getEntry' }

describe('useCmsStudioQuery', () => {
  it('normalizes Studio query errors with query metadata', () => {
    const cause = new Error('Raw auth failure') as Error & {
      data?: { code: string; message: string; status: number }
      status?: number
    }
    cause.data = {
      code: 'UNAUTHENTICATED',
      message: 'Sign in required',
      status: 401,
    }
    cause.status = 401

    const error = normalizeCmsStudioQueryError(cause, query)

    expect(error).toBeInstanceOf(CmsStudioQueryError)
    expect(error.message).toBe('Sign in required')
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

    onError?.(
      Object.assign(new Error('Query failed'), {
        data: { code: 'NOT_FOUND', message: 'Entry not found.', status: 404 },
      }),
    )
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

    onError?.({ code: 'LIMIT_RATE', message: 'Slow down.', status: 429 })
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
})
