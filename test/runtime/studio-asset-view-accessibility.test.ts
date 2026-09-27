// @vitest-environment jsdom

import { mount, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import en from '../../packages/cms/src/public/locales/en'
import StudioAssetGridView from '../../packages/cms/studio-app/src/components/studio/assets/StudioAssetGridView.vue'
import StudioAssetListView from '../../packages/cms/studio-app/src/components/studio/assets/StudioAssetListView.vue'
import StudioAssetManageDrawer from '../../packages/cms/studio-app/src/components/studio/assets/StudioAssetManageDrawer.vue'
import StudioAssetMobileDetailsSheet from '../../packages/cms/studio-app/src/components/studio/assets/StudioAssetMobileDetailsSheet.vue'

vi.mock('../../packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext', () => ({
  useStudioAssetBrowserContext: () => context,
}))
vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    t: (key: string, values: Record<string, string> = {}) => {
      const name = key.split('.').at(-1)
      const labels: Record<string, string> = en.ginkoCms.studio.assetBrowser
      return (labels[name ?? ''] ?? key).replace(/\{(\w+)\}/g, (_, field) => values[field] ?? '')
    },
  }),
}))

const item = { id: 'asset-1', filename: 'forest.png', mimeType: 'image/png', size: 68 }
function createContext() {
  const selected = ref<string[]>([])
  const chosen = ref(false)
  return {
    finder: {
      currentItems: ref([item]),
      selectedAsset: ref(item),
      selectedAssetId: ref<string | null>(null),
      selectedAssetIds: selected,
      allVisibleAssetsSelected: ref(false),
      assetCount: ref(1),
      hasMoreAssets: ref(false),
      toggleAssetSelection: vi.fn((id: string) => {
        selected.value = [id]
      }),
      toggleAllVisibleAssets: vi.fn(),
      mimeIcon: () => 'image',
      formatFileSize: () => '68 B',
      formatDate: () => 'Today',
    },
    mode: { mode: ref('manage') },
    pick: {
      isChosen: () => chosen.value,
      togglePickerSelection: vi.fn(() => {
        chosen.value = !chosen.value
      }),
    },
    presentation: {
      itemKey: () => item.id,
      canShowPreview: () => false,
      ownerPathLabel: () => 'Shared library',
    },
    selection: { drawerOpen: ref(true), selectedAssetForDetails: ref(item) },
    tags: {},
    metadata: { coverage: () => ({ complete: true }), coverageLabel: () => 'Complete' },
    flow: {
      handleItemClick: vi.fn(),
      handleItemDoubleClick: vi.fn(),
      detailsOpen: ref(true),
    },
  }
}
const lgUp = ref(false)
const mediaListeners = new Set<(event: { matches: boolean }) => void>()
let context = createContext()
beforeEach(() => {
  context = createContext()
  lgUp.value = false
  mediaListeners.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      get matches() {
        return lgUp.value
      },
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        mediaListeners.delete(listener),
    }),
  })
})

const options = { global: { stubs: { Icon: { template: '<span />' } } } }
for (const [name, component] of [
  ['list', StudioAssetListView],
  ['grid', StudioAssetGridView],
] as const) {
  describe(`${name} asset keyboard controls`, () => {
    it('provides a named native details button without nested interactive controls', async () => {
      const wrapper = mount(component, options)
      const open = wrapper.get('button[aria-label="Open details for forest.png"]')
      expect((open.element as HTMLButtonElement).tabIndex).toBe(0)
      expect(open.attributes('type')).toBe('button')
      expect(open.find('button, input').exists()).toBe(false)
      await open.trigger('click')
      expect(context.flow.handleItemClick).toHaveBeenCalledExactlyOnceWith(item)
      expect(context.finder.toggleAssetSelection).not.toHaveBeenCalled()
      await open.trigger('dblclick')
      expect(context.flow.handleItemDoubleClick).toHaveBeenCalledExactlyOnceWith(item)
      wrapper.unmount()
    })

    it('names manage selection and prevents it from opening the asset', async () => {
      const wrapper = mount(component, options)
      const select = wrapper.get('[aria-label="Select forest.png"]')
      if (name === 'list') await select.setValue(true)
      else await select.trigger('click')
      expect(context.finder.toggleAssetSelection).toHaveBeenCalledExactlyOnceWith(item.id)
      expect(context.flow.handleItemClick).not.toHaveBeenCalled()
      if (name === 'grid') expect(select.attributes('aria-pressed')).toBe('true')
      wrapper.unmount()
    })

    it('exposes picker selection as a named toggle separate from details', async () => {
      context.mode.mode.value = 'pick'
      const wrapper = mount(component, options)
      const select = wrapper.get('button[aria-label="Select forest.png"]')
      expect(select.attributes('aria-pressed')).toBe('false')
      await select.trigger('click')
      await nextTick()
      expect(select.attributes('aria-pressed')).toBe('true')
      expect(context.pick.togglePickerSelection).toHaveBeenCalledExactlyOnceWith(item)
      expect(context.flow.handleItemClick).not.toHaveBeenCalled()
      await select.trigger('click')
      await select.trigger('dblclick')
      expect(context.pick.togglePickerSelection).toHaveBeenCalledTimes(2)
      expect(context.flow.handleItemDoubleClick).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })
}

it('names the select-all checkbox and disables it for an empty library', async () => {
  const wrapper = mount(StudioAssetListView, options)
  const all = wrapper.get('input[aria-label="Select all visible assets"]')
  await all.setValue(true)
  expect(context.finder.toggleAllVisibleAssets).toHaveBeenCalledOnce()
  context.finder.assetCount.value = 0
  await nextTick()
  expect(all.attributes('disabled')).toBeDefined()
  wrapper.unmount()
})

it('has only one open details sheet across the mobile breakpoint without losing selection', async () => {
  lgUp.value = false
  const sheetOptions = {
    global: {
      stubs: {
        Sheet: {
          props: ['open'],
          template: '<div data-sheet :data-open="open" />',
        },
      },
    },
  }
  const desktop = shallowMount(StudioAssetManageDrawer, sheetOptions)
  const mobile = shallowMount(StudioAssetMobileDetailsSheet, sheetOptions)
  expect(desktop.find('[data-sheet]').exists()).toBe(false)
  expect(mobile.get('[data-sheet]').attributes('data-open')).toBe('true')
  lgUp.value = true
  for (const listener of mediaListeners) listener({ matches: true })
  await nextTick()
  expect(desktop.get('[data-sheet]').attributes('data-open')).toBe('true')
  expect(mobile.get('[data-sheet]').attributes('data-open')).toBe('false')
  expect(context.finder.selectedAsset.value.id).toBe(item.id)
  desktop.unmount()
  mobile.unmount()
})
