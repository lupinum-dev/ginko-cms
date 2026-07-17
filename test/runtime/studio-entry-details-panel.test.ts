// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, toValue } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import StudioEntryDetailsPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryDetailsPanel.vue'
import { useStudioEntryEditorContext } from '../../packages/cms/studio-app/src/composables/internal/studioEntryEditorContext'
import {
  provideRightSidebar,
  useRightSidebarPanel,
  type RightSidebarController,
} from '../../packages/cms/studio-app/src/composables/useRightSidebar'

function installLocalStorage() {
  const values = new Map<string, string>()
  const storage = {
    get length() {
      return values.size
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  } satisfies Storage
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
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

// Real `t` is exercised through useCmsI18n (self-contained), so the panel's
// button labels resolve to the actual English strings.
function panelStubs() {
  return {
    // Render Collapsible content unconditionally so the child cards mount and can
    // exercise the re-provided context (the reka open/close animation is not
    // under test here).
    Collapsible: { template: '<div><slot /></div>' },
    CollapsibleTrigger: { template: '<button type="button"><slot /></button>' },
    CollapsibleContent: { template: '<div><slot /></div>' },
    Button: defineComponent({
      inheritAttrs: false,
      props: { disabled: Boolean, size: String, variant: String },
      emits: ['click'],
      template: `<button type="button" :disabled="disabled" v-bind="$attrs" @click="$emit('click')"><slot /></button>`,
    }),
    // Heavy workflow cards are stubbed. The StudioVersionHistoryCard stub is a
    // PROBE that injects the editor context: it renders only if the panel's
    // provideStudioEntryEditorContext(props.editor) reached it across the panel
    // boundary — otherwise useStudioEntryEditorContext() throws.
    StudioEntryStatusRail: { template: '<div data-testid="status-rail" />' },
    StudioPublishOutcomeCard: { template: '<div />' },
    StudioPublishImpactSummary: { template: '<div />' },
    StudioEntryPublicWorkflowPanel: { template: '<div />' },
    StudioEntryTranslationReadinessPanel: { template: '<div />' },
    StudioVersionHistoryCard: defineComponent({
      name: 'StudioVersionHistoryCard',
      setup() {
        const ctx = useStudioEntryEditorContext() as unknown as {
          history: { versions: Array<{ version: number }> }
        }
        return () => h('div', `history:v${ctx.history.versions[0]?.version}`)
      },
    }),
  }
}

function createPanelEditor(overrides: Record<string, unknown> = {}) {
  const workflow = {
    readinessDetail: null,
    readinessPending: false,
    publishImpactRequested: false,
    publishImpact: { state: 'idle', locales: [] },
    publishReview: { state: 'ready', locales: [] },
    publicVisibility: { isRouteBacked: true, localeRows: [] },
    requestReviewPending: false,
    routeValidationRequested: false,
    routeValidationState: { state: 'idle', message: '', diagnostics: [], hiddenDiagnosticCount: 0 },
    currentReadinessView: { canPreview: true },
    isRouteBackedEntry: true,
    selectedPublishImpactLocale: null,
    translationReadiness: [],
    previewPublishImpact: vi.fn(),
    validatePublicRoutes: vi.fn(),
    reviewTranslationReadiness: vi.fn(),
    requestPublishReview: vi.fn(),
  }
  return {
    loader: {
      pending: false,
      entry: { draftVersion: 7, publishedAt: null, status: 'draft' },
      canPublishEntries: true,
      currentLocale: 'en',
      dateLocale: 'en',
      entryId: 'entry-1',
      collection: 'docs',
      collectionConfig: { label: 'Docs', mode: 'route', routing: { mode: 'path' } },
      fields: [],
      locales: [{ code: 'en', label: 'English' }],
      localeVariants: [{ locale: 'en' }],
      t: (key: string) =>
        key === 'ginkoCms.studio.collectionEditor.createCheckpoint' ? 'Save version' : key,
    },
    draft: { saving: false, error: '', dataFields: {} },
    publishing: {
      publishReadiness: { state: 'ready' },
      handlePublish: vi.fn(() => true),
      publishOutcome: null,
      showPublishDialog: false,
      showCheckpointDialog: false,
    },
    history: {
      versions: [
        {
          _id: 'version-1',
          action: 'checkpoint',
          displayAction: 'checkpoint',
          version: 3,
          createdAt: 1,
          createdBy: 'owner-1',
          isCurrentPublished: false,
          message: 'Before launch',
          publishedLocales: [],
        },
      ],
      showCheckpointDialog: false,
      previewVersionId: null,
      toggleVersionPreview: vi.fn(),
    },
    workflow,
    ...overrides,
  }
}

function mountPanel(editor: ReturnType<typeof createPanelEditor>) {
  return mount(StudioEntryDetailsPanel, {
    attachTo: document.body,
    props: { editor: editor as never },
    global: { stubs: panelStubs() },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  installLocalStorage()
  installMatchMedia()
})

describe('StudioEntryDetailsPanel context re-provide', () => {
  it('re-provides the editor context from the prop so child cards inject through the panel boundary', () => {
    const editor = createPanelEditor()
    // The panel receives `editor` as a PROP (not via provide) and calls
    // provideStudioEntryEditorContext at its top. A real child card
    // (StudioVersionHistoryCard) injects that context — if the re-provide failed
    // it would throw "Studio entry editor context is not available".
    const wrapper = mountPanel(editor)

    expect(wrapper.find('[data-testid="status-rail"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('history:v3')
    wrapper.unmount()
  })

  it('shows all three grouped sections (Status / Workflow / History)', () => {
    const wrapper = mountPanel(createPanelEditor())

    expect(wrapper.text()).toContain('Status')
    expect(wrapper.text()).toContain('Workflow')
    expect(wrapper.text()).toContain('History')
    wrapper.unmount()
  })
})

describe('StudioEntryDetailsPanel publish trigger', () => {
  it('does not duplicate the publish CTA — the top bar owns the single publish action', () => {
    // Say-it-once: the design review moved the one publish CTA to the entry
    // top bar. The details panel reinforces state but must not offer a second
    // Publish button, even for users with publish permission.
    const editor = createPanelEditor()
    const wrapper = mountPanel(editor)

    const publishButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Publish')
    expect(publishButton).toBeUndefined()
    wrapper.unmount()
  })

  it('does not render the publish trigger without publish permission', () => {
    const editor = createPanelEditor()
    editor.loader.canPublishEntries = false
    const wrapper = mountPanel(editor)

    const publishButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Publish')
    expect(publishButton).toBeUndefined()
    wrapper.unmount()
  })
})

describe('StudioEntryDetailsPanel registration lifecycle', () => {
  async function mountRegistration() {
    const router: Router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/content/:collection/:id',
          name: 'studio-edit',
          meta: { rightSidebar: true },
          component: { render: () => h('div') },
        },
      ],
    })
    await router.push('/content/docs/entry-1')
    await router.isReady()

    const editor = createPanelEditor()
    const show = ref(true)
    let controller!: RightSidebarController

    const Child = defineComponent({
      setup() {
        useRightSidebarPanel({
          title: () => 'My Entry',
          description: () => 'Docs',
          component: StudioEntryDetailsPanel,
          props: () => ({ editor }),
          defaultOpen: true,
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
    return { controller, wrapper, show, editor }
  }

  it('registers the panel with the reactive entry title and editor props getter, defaultOpen true', async () => {
    const { controller, editor } = await mountRegistration()
    await nextTick()

    expect(controller.panel.value).not.toBeNull()
    expect(controller.panel.value?.component).toBe(StudioEntryDetailsPanel)
    expect(toValue(controller.panel.value?.title)).toBe('My Entry')
    expect(controller.panel.value?.defaultOpen).toBe(true)
    expect(toValue(controller.panel.value?.props)).toEqual({ editor })
    // defaultOpen applies while no stored preference exists.
    expect(controller.open.value).toBe(true)
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
