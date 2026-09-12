// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import {
  provideStudioRichtextFlush,
  type StudioRichtextFlush,
} from '../../packages/cms/studio-app/src/composables/internal/studioRichtextFlush'

function mountRegistry() {
  let registry: StudioRichtextFlush | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        registry = provideStudioRichtextFlush()
        return () => h('div')
      },
    }),
  )
  return { registry: registry!, wrapper }
}

describe('Studio rich-text flush registry', () => {
  it('flushes registered editors and tracks pending work until unregister', async () => {
    const { registry, wrapper } = mountRegistry()
    const flush = vi.fn().mockResolvedValue({ emitted: true, ok: true })
    const unregister = registry.register('body:en', {
      flush,
      hasPendingChanges: () => true,
      removeSelectedMedia: () => false,
    })
    registry.setPending('body:en', true)

    expect(registry.hasPending.value).toBe(true)
    await expect(registry.flush()).resolves.toEqual({ emitted: true, ok: true })
    expect(flush).toHaveBeenCalledOnce()

    unregister()
    expect(registry.hasPending.value).toBe(false)
    wrapper.unmount()
  })
})
