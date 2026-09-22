// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import StudioRichtextImageLibrary from '../../packages/cms/studio-app/src/components/studio/fields/StudioRichtextImageLibrary.vue'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  finalize: vi.fn(),
  query: vi.fn(),
  loadMore: vi.fn(),
}))
vi.mock('@lupinum/better-convex-vue', () => ({ useConvex: () => ({ query: mocks.query }) }))
vi.mock('@lupinum/ginko-editor', () => ({
  GinkoImagePicker: defineComponent({
    name: 'GinkoImagePicker',
    props: ['open', 'images', 'query', 'loading', 'error', 'hasMore'],
    emits: ['select', 'update:open', 'update:query', 'load-more'],
    setup() {
      return () => h('div')
    },
  }),
}))
vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexAction: () => mocks.finalize,
  useConvexUpload: () => ({ upload: mocks.upload }),
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery', () => ({
  useCmsStudioPaginatedQuery: () => ({
    data: ref([]),
    pending: ref(false),
    error: ref(null),
    canLoadMore: ref(true),
    loadMore: mocks.loadMore,
  }),
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.upload.mockResolvedValue({ sessionId: 'session', token: 'token' })
  mocks.finalize.mockResolvedValue('image-id')
  mocks.query.mockResolvedValue({ 'image-id': 'https://example.com/image.png' })
})

describe('Studio rich text image adapters', () => {
  it('cancels on abort and resolves its URL before completing a selection', async () => {
    const wrapper = mount(StudioRichtextImageLibrary, {
      props: { assetContext: { collection: 'docs' } },
    })
    try {
      const abort = new AbortController()
      const cancelled = wrapper.vm.pick({ signal: abort.signal })
      abort.abort()
      expect(await cancelled).toBeNull()
      const picked = wrapper.vm.pick({ signal: new AbortController().signal })
      await flushPromises()
      const picker = wrapper.findComponent({ name: 'GinkoImagePicker' })
      picker.vm.$emit('select', { id: 'image-id', url: 'https://example.com/image.png' })
      expect(await picked).toMatchObject({ id: 'image-id' })
      expect(wrapper.emitted('resolved')).toEqual([['image-id', 'https://example.com/image.png']])
      picker.vm.$emit('load-more')
      expect(mocks.loadMore).toHaveBeenCalledWith(40)
    } finally {
      wrapper.unmount()
    }
  })

  it('registers a finalized image in its existing ownership scope without flushing', async () => {
    const registered = vi.fn()
    const wrapper = mount(StudioRichtextImageLibrary, {
      props: { assetContext: { collection: 'docs', onAssetRegistered: registered } },
    })
    try {
      expect(
        await wrapper.vm.upload(new File(['image'], 'image.png', { type: 'image/png' }), {
          signal: new AbortController().signal,
        }),
      ).toEqual({ id: 'image-id', alt: 'image.png' })
      expect(mocks.finalize).toHaveBeenCalledWith({
        sessionId: 'session',
        token: 'token',
        filename: 'image.png',
        scope: 'collection',
        collection: 'docs',
      })
      expect(registered).toHaveBeenCalledWith('image-id', 'collection')
      expect(wrapper.emitted('resolved')).toEqual([['image-id', 'https://example.com/image.png']])
    } finally {
      wrapper.unmount()
    }
  })

  it('does not finalize a cancelled provisional upload session', async () => {
    const abort = new AbortController()
    mocks.upload.mockImplementation(async () => {
      abort.abort()
      return { sessionId: 'session', token: 'token' }
    })
    const wrapper = mount(StudioRichtextImageLibrary, {
      props: { assetContext: { collection: 'docs' } },
    })
    try {
      await expect(
        wrapper.vm.upload(new File(['image'], 'image.png', { type: 'image/png' }), {
          signal: abort.signal,
        }),
      ).rejects.toThrow()
      expect(mocks.finalize).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })
})
