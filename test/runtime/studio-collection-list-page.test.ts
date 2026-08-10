// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { provideRightSidebar } from '../../packages/cms/studio-app/src/composables/useRightSidebar'
import StudioCollectionListPage from '../../packages/cms/studio-app/src/pages/[collection]/index.vue'

// The collection list page registers a right-sidebar details panel, so mounting
// it needs the layout's right-sidebar controller (provideRightSidebar) in an
// ancestor plus the jsdom globals its VueUse dependencies read.
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
      removeItem: (key: string) => {
        values.delete(key)
      },
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
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

async function mountListPage(
  url: string,
): Promise<{ router: Router; wrapper: ReturnType<typeof mount> }> {
  installLocalStorage()
  installMatchMedia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/studio/content/:collection',
        name: 'studio-collection-list',
        meta: { rightSidebar: true },
        component: { render: () => h('div') },
      },
    ],
  })
  await router.push(url)
  // Layout harness that provides the right-sidebar controller the page registers into.
  const Harness = defineComponent({
    setup() {
      provideRightSidebar()
      return () => h(StudioCollectionListPage)
    },
  })
  const wrapper = mount(Harness, {
    global: {
      plugins: [router],
      stubs: stubs(),
    },
  })
  return { router, wrapper }
}

const collectionDetail = vi.hoisted(() => ({
  _id: 'collection-1',
  slug: 'pages',
  label: 'Pages',
  type: 'flat',
  mode: 'route',
  singleton: false,
  locales: ['en'],
}))

const paginatedQueryState = vi.hoisted(() => ({
  canLoadMore: false,
  loadMore: vi.fn(),
}))

const accessState = vi.hoisted(() => ({ canCreateEntries: true }))

vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: {
    ginkoCms: {
      collections: {
        getCollection: 'getCollection',
      },
      editor: {
        listEntriesForStudio: 'listEntriesForStudio',
        listEntrySummaries: 'listEntrySummaries',
        reorderEntry: 'reorderEntry',
      },
    },
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/permissions', () => ({
  cmsPermissionKeys: {
    createEntries: 'createEntries',
    manageCollections: 'manageCollections',
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsConfig', () => ({
  useCmsConfig: () => ({
    collections: {},
    defaultLocale: 'en',
    route: '/studio',
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    dateLocale: 'en',
    t: (key: string) => key,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({
    can: (permission: string) =>
      ref(permission === 'createEntries' ? accessState.canCreateEntries : true),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery', () => ({
  useCmsStudioPaginatedQuery: () => ({
    error: ref(null),
    canLoadMore: ref(paginatedQueryState.canLoadMore),
    data: ref([]),
    isLoading: ref(false),
    loadMore: paginatedQueryState.loadMore,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: (query: string) => {
    if (query === 'getCollection') {
      return {
        data: ref(collectionDetail),
        error: ref(null),
        pending: ref(false),
      }
    }
    return {
      data: ref([]),
      error: ref(null),
      pending: ref(false),
    }
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioSettings', () => ({
  useCmsStudioSettings: () => ({
    defaultLocale: ref('en'),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () =>
    Object.assign(
      vi.fn(async () => undefined),
      {
        pending: ref(false),
      },
    ),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioDebug', () => ({
  useStudioDebug: () => ({
    watchQueryError: vi.fn(),
  }),
}))

vi.mock('@public/utils/cmsErrors', () => ({
  getCmsErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

function stubs() {
  return {
    Badge: { props: { variant: String }, template: '<span><slot /></span>' },
    Button: defineComponent({
      inheritAttrs: false,
      props: { disabled: Boolean, size: String, variant: String },
      emits: ['click'],
      template:
        '<button type="button" :disabled="disabled" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
    }),
    Input: defineComponent({
      props: { modelValue: String, placeholder: String },
      emits: ['update:modelValue'],
      template:
        '<input data-testid="search-input" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    }),
    NuxtTime: { props: { datetime: [Number, String] }, template: '<time>{{ datetime }}</time>' },
    ScrollArea: { template: '<div><slot /></div>' },
    Select: defineComponent({
      name: 'Select',
      props: { modelValue: String },
      emits: ['update:modelValue'],
      template: '<div data-testid="filter-select" :data-value="modelValue"><slot /></div>',
    }),
    SelectContent: { template: '<div><slot /></div>' },
    SelectItem: { props: { value: String }, template: '<div><slot /></div>' },
    SelectTrigger: { template: '<div><slot /></div>' },
    SelectValue: { props: { placeholder: String }, template: '<span />' },
    Skeleton: { template: '<div />' },
    StudioEmptyState: {
      props: { description: String, title: String },
      template:
        '<section><slot name="icon" /><h2>{{ title }}</h2><p>{{ description }}</p><slot name="action" /></section>',
    },
    StudioNotice: {
      props: { description: String, title: String },
      template: '<section><h2>{{ title }}</h2><p>{{ description }}</p></section>',
    },
    StudioPageBody: { template: '<div><slot /></div>' },
    StudioPageHeader: {
      props: { description: String, eyebrow: String, title: String },
      template:
        '<header><span>{{ eyebrow }}</span><h1>{{ title }}</h1><p>{{ description }}</p><slot name="actions" /></header>',
    },
    StudioStatusPill: {
      props: { label: String, tone: String },
      template: '<span>{{ label }}</span>',
    },
    StudioWorkspace: {
      template: '<main><slot name="header" /><slot name="toolbar" /><slot /></main>',
    },
  }
}

describe('Studio collection list page', () => {
  beforeEach(() => {
    paginatedQueryState.canLoadMore = false
    paginatedQueryState.loadMore.mockReset()
    accessState.canCreateEntries = true
  })

  it('[CON-05] renders a role-aware empty collection action', async () => {
    const editor = await mountListPage('/studio/content/pages')
    expect(editor.wrapper.text()).toContain('ginkoCms.studio.collectionListPage.emptyTitle')
    expect(editor.wrapper.text()).toContain('ginkoCms.studio.collectionListPage.newEntry')

    editor.wrapper.unmount()
    accessState.canCreateEntries = false
    const viewer = await mountListPage('/studio/content/pages')
    expect(viewer.wrapper.text()).toContain('ginkoCms.studio.collectionListPage.emptyTitle')
    expect(viewer.wrapper.text()).not.toContain('ginkoCms.studio.collectionListPage.newEntry')
  })

  it('initializes filters from ?status=, ?work=, and ?q= deep-link params', async () => {
    const { wrapper } = await mountListPage(
      '/studio/content/pages?status=published&work=blocked&q=campaign',
    )

    const selects = wrapper.findAll('[data-testid="filter-select"]')
    expect(selects).toHaveLength(2)
    expect(selects[0].attributes('data-value')).toBe('published')
    expect(selects[1].attributes('data-value')).toBe('blocked')
    expect((wrapper.find('[data-testid="search-input"]').element as HTMLInputElement).value).toBe(
      'campaign',
    )
  })

  it('ignores query values outside the filter unions', async () => {
    const { wrapper } = await mountListPage('/studio/content/pages?status=bogus&work=everything')

    const selects = wrapper.findAll('[data-testid="filter-select"]')
    expect(selects[0].attributes('data-value')).toBe('all')
    expect(selects[1].attributes('data-value')).toBe('all')
    expect((wrapper.find('[data-testid="search-input"]').element as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('mirrors filter changes into the URL and drops defaults again', async () => {
    const { router, wrapper } = await mountListPage('/studio/content/pages')

    const statusSelect = wrapper.findAllComponents({ name: 'Select' })[0]
    statusSelect.vm.$emit('update:modelValue', 'draft')
    await nextTick()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.status).toBe('draft')
    })

    statusSelect.vm.$emit('update:modelValue', 'all')
    await nextTick()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.status).toBeUndefined()
    })
  })

  it('keeps later filtered pages reachable when the current page is empty', async () => {
    paginatedQueryState.canLoadMore = true
    const { wrapper } = await mountListPage('/studio/content/pages?work=blocked')

    const loadMore = wrapper
      .findAll('button')
      .find((button) => button.text() === 'ginkoCms.common.loadMore')
    expect(loadMore).toBeTruthy()
    await loadMore!.trigger('click')
    expect(paginatedQueryState.loadMore).toHaveBeenCalledWith(50)
  })
})
