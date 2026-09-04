// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, toValue } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import StudioReviewDetailsPanel from '../../packages/cms/studio-app/src/components/studio/reviews/StudioReviewDetailsPanel.vue'
import {
  provideRightSidebar,
  useRightSidebarPanel,
  type RightSidebarController,
} from '../../packages/cms/studio-app/src/composables/useRightSidebar'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key, dateLocale: 'en' }),
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

function makeRequest(id = 'review-1') {
  return { _id: id, title: `Review ${id}` } as never
}

function panelStubs() {
  return {
    StudioEmptyState: {
      props: { description: String, title: String },
      template: '<section><h2>{{ title }}</h2><p>{{ description }}</p></section>',
    },
    // Probe: renders the request title it receives, proving the panel forwards the
    // selected request into the shared detail component (reuse, not duplicate).
    StudioReviewDetail: defineComponent({
      props: { request: { type: Object, required: true } },
      template: '<div data-testid="detail">detail:{{ request.title }}</div>',
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  installLocalStorage()
  installMatchMedia()
})

describe('StudioReviewDetailsPanel', () => {
  it('renders the shared review detail for the selected request', () => {
    const wrapper = mount(StudioReviewDetailsPanel, {
      props: { request: makeRequest('review-7') },
      global: { stubs: panelStubs() },
    })

    expect(wrapper.find('[data-testid="detail"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('detail:Review review-7')
    wrapper.unmount()
  })

  it('shows the empty-state hint when nothing is selected', () => {
    const wrapper = mount(StudioReviewDetailsPanel, {
      props: { request: null },
      global: { stubs: panelStubs() },
    })

    expect(wrapper.find('[data-testid="detail"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('ginkoCms.studio.reviewDetails.emptyTitle')
    expect(wrapper.text()).toContain('ginkoCms.studio.reviewDetails.emptyHint')
    wrapper.unmount()
  })
})

describe('StudioReviewDetailsPanel registration', () => {
  async function mountRegistration() {
    const router: Router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/reviews',
          name: 'studio-reviews',
          meta: { rightSidebar: true },
          component: { render: () => h('div') },
        },
      ],
    })
    await router.push('/reviews')
    await router.isReady()

    let controller!: RightSidebarController
    const selected = ref<ReturnType<typeof makeRequest> | null>(null)
    const show = ref(true)

    const Child = defineComponent({
      setup() {
        useRightSidebarPanel({
          title: () => 'Review details',
          component: StudioReviewDetailsPanel,
          props: () => ({ request: selected.value }),
          defaultOpen: false,
        })
        return () => h('div')
      },
    })

    const Harness = defineComponent({
      setup() {
        controller = provideRightSidebar()
        return () => (show.value ? h(Child) : h('div'))
      },
    })

    const wrapper = mount(Harness, { global: { plugins: [router] } })
    return { controller, wrapper, selected, show }
  }

  it('registers a defaultOpen:false panel whose props follow the selected review', async () => {
    const { controller, selected } = await mountRegistration()
    await nextTick()

    expect(controller.panel.value?.component).toBe(StudioReviewDetailsPanel)
    expect(controller.panel.value?.defaultOpen).toBe(false)
    expect(controller.open.value).toBe(false)
    expect(toValue(controller.panel.value?.props)).toEqual({ request: null })

    const request = makeRequest('review-2')
    selected.value = request
    await nextTick()
    expect(toValue(controller.panel.value?.props)).toEqual({ request })
  })

  it('disposes the panel when the page unmounts', async () => {
    const { controller, wrapper, show } = await mountRegistration()
    await nextTick()
    expect(controller.panel.value).not.toBeNull()

    show.value = false
    await nextTick()
    expect(controller.panel.value).toBeNull()
    wrapper.unmount()
  })
})
