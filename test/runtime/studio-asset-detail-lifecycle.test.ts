// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import type { FinderAssetRecord } from '../../packages/cms/studio-app/src/composables/internal/assetFinderTypes'
import { createStudioAssetBrowserContext } from '../../packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext'

type ContextOptions = Parameters<typeof createStudioAssetBrowserContext>[0]
function setup() {
  const asset = { id: 'asset-1', filename: 'forest.png' } as FinderAssetRecord
  const selected = ref<FinderAssetRecord | null>(null)
  // Only the finder members read by the real context in these sequences are needed.
  const finder = {
    selectedAsset: selected,
    assets: ref([asset]),
    selectedVisibleAssetIds: ref<string[]>([]),
    assetCount: ref(1),
    selectAsset: (id: string | null) => {
      selected.value = id ? asset : null
    },
  } as unknown as ContextOptions['finder']
  let context!: ReturnType<typeof createStudioAssetBrowserContext>
  const host = mount(
    defineComponent({
      setup() {
        context = createStudioAssetBrowserContext({
          finder,
          props: { mode: 'manage', aspectRatio: null, modelValue: null },
          emit: vi.fn(),
          t: (key) => key,
          studioSettings: {
            locales: ref([{ code: 'en', label: 'English', isDefault: true }]),
            defaultLocale: ref('en'),
          } as ContextOptions['studioSettings'],
          updateAsset: vi.fn(),
          pendingUploadedAssetId: ref(null),
        })
        return () => null
      },
    }),
  )
  return { context, asset, host }
}

describe('asset details open intent', () => {
  it('desktop close clears the mobile open intent before a viewport shrink', () => {
    const { context, asset, host } = setup()
    context.flow.handleItemClick(asset)
    expect(context.selection.drawerOpen.value).toBe(true)
    expect(context.flow.detailsOpen.value).toBe(true)
    context.selection.drawerOpen.value = false
    expect(context.flow.detailsOpen.value).toBe(false)
    expect(context.selection.selectedAssetForDetails.value).toBeNull()
    host.unmount()
  })

  it('mobile close keeps a later desktop layout closed even with retained selection', () => {
    const { context, asset, host } = setup()
    context.flow.handleItemClick(asset)
    context.flow.detailsOpen.value = false
    expect(context.selection.selectedAssetForDetails.value?.id).toBe(asset.id)
    expect(context.selection.drawerOpen.value).toBe(false)
    context.flow.handleItemClick(asset)
    expect(context.selection.drawerOpen.value).toBe(true)
    host.unmount()
  })
})
