// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, toValue } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import StudioAssetDetailsPanel from '../../packages/cms/studio-app/src/components/studio/StudioAssetDetailsPanel.vue'
import {
  provideRightSidebar,
  useRightSidebarPanel,
  type RightSidebarController,
} from '../../packages/cms/studio-app/src/composables/useRightSidebar'
import { provideStudioAssetSelection } from '../../packages/cms/studio-app/src/composables/useStudioAssetSelection'

const mocks = vi.hoisted(() => ({
  updateAsset: vi.fn(),
  asset: {
    _id: 'asset_1',
    filename: 'hero.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    width: 1200,
    height: 800,
    url: '/hero.jpg',
    alt: { en: 'Alt EN' },
    caption: { en: 'Caption EN' },
  } as Record<string, unknown>,
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioSettings', () => ({
  useCmsStudioSettings: () => ({
    locales: { value: [{ code: 'en', label: 'English', isDefault: true }] },
    defaultLocale: { value: 'en' },
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({ data: { value: mocks.asset } }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => mocks.updateAsset,
}))

function installLocalStorage() {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return values.size
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  })
}

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function panelStubs() {
  return {
    Button: defineComponent({
      inheritAttrs: false,
      props: { disabled: Boolean, size: String, variant: String },
      emits: ['click'],
      template: `<button type="button" :disabled="disabled" v-bind="$attrs" @click="$emit('click')"><slot /></button>`,
    }),
    Input: defineComponent({
      props: { disabled: Boolean, modelValue: String },
      emits: ['update:modelValue'],
      template: `<input :disabled="disabled" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
    }),
    StudioEmptyState: {
      props: { description: String, title: String },
      template: '<section><h2>{{ title }}</h2><p>{{ description }}</p></section>',
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  installLocalStorage()
  installMatchMedia()
})

describe('StudioAssetDetailsPanel', () => {
  it('renders the shared metadata form for the selected asset', () => {
    const wrapper = mount(StudioAssetDetailsPanel, {
      props: { assetId: 'asset_1', assetContext: { locale: 'en' } },
      global: { stubs: panelStubs() },
    })

    // The shared StudioAssetMetadataForm mounts (filename + alt input present),
    // and the empty-state hint does NOT show while an asset is selected.
    expect(wrapper.text()).toContain('hero.jpg')
    expect(wrapper.findAll('input')[0]!.element.value).toBe('Alt EN')
    expect(wrapper.text()).not.toContain('ginkoCms.studio.assetDetails.emptyHint')
    wrapper.unmount()
  })

  it('[QUA-05] shows the empty-state hint when nothing is selected', () => {
    const wrapper = mount(StudioAssetDetailsPanel, {
      props: { assetId: null },
      global: { stubs: panelStubs() },
    })

    expect(wrapper.text()).toContain('ginkoCms.studio.assetDetails.emptyTitle')
    expect(wrapper.text()).toContain('ginkoCms.studio.assetDetails.emptyHint')
    expect(wrapper.find('input').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('StudioAssetDetailsPanel registration', () => {
  async function mountRegistration() {
    const router: Router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/assets',
          name: 'studio-assets',
          meta: { rightSidebar: true },
          component: { render: () => h('div') },
        },
      ],
    })
    await router.push('/assets')
    await router.isReady()

    let controller!: RightSidebarController
    let selection!: ReturnType<typeof provideStudioAssetSelection>

    const Child = defineComponent({
      setup() {
        selection = provideStudioAssetSelection()
        useRightSidebarPanel({
          title: () => 'Asset details',
          component: StudioAssetDetailsPanel,
          props: () => ({
            assetId: selection.selectedAssetId.value,
            assetContext: selection.assetContext.value,
          }),
          defaultOpen: false,
        })
        return () => h('div')
      },
    })

    const Harness = defineComponent({
      setup() {
        controller = provideRightSidebar()
        return () => h(Child)
      },
    })

    const wrapper = mount(Harness, { global: { plugins: [router] } })
    return { controller, wrapper, getSelection: () => selection }
  }

  it('registers a defaultOpen:false panel whose props follow the lifted selection', async () => {
    const { controller, getSelection } = await mountRegistration()
    await nextTick()

    expect(controller.panel.value?.component).toBe(StudioAssetDetailsPanel)
    expect(controller.panel.value?.defaultOpen).toBe(false)
    // No stored preference + defaultOpen:false => the panel starts closed.
    expect(controller.open.value).toBe(false)
    // Selection is empty initially, so the props getter yields a null assetId.
    expect(toValue(controller.panel.value?.props)).toEqual({
      assetId: null,
      assetContext: undefined,
    })

    // Driving the lifted selection flows straight through the props getter.
    getSelection().selectedAssetId.value = 'asset_1'
    getSelection().assetContext.value = { locale: 'en' }
    await nextTick()
    expect(toValue(controller.panel.value?.props)).toEqual({
      assetId: 'asset_1',
      assetContext: { locale: 'en' },
    })
  })
})
