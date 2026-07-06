// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'

import StudioCollectionContractSection from '../../packages/cms/studio-app/src/components/studio/collections/StudioCollectionContractSection.vue'
import StudioEntryCompareToolbar from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryCompareToolbar.vue'
import StudioEntryPublicWorkflowPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryPublicWorkflowPanel.vue'
import StudioEntryTranslationReadinessPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryTranslationReadinessPanel.vue'
import StudioLocaleEditorPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioLocaleEditorPanel.vue'
import StudioPublishDialog from '../../packages/cms/studio-app/src/components/studio/editor/StudioPublishDialog.vue'
import StudioSharedFieldsPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioSharedFieldsPanel.vue'
import FieldArray from '../../packages/cms/studio-app/src/components/studio/fields/FieldArray.vue'
import FieldBlocks from '../../packages/cms/studio-app/src/components/studio/fields/FieldBlocks.vue'
import FieldObject from '../../packages/cms/studio-app/src/components/studio/fields/FieldObject.vue'
import FieldRichtext from '../../packages/cms/studio-app/src/components/studio/fields/FieldRichtext.vue'
import StudioEmptyState from '../../packages/cms/studio-app/src/components/studio/StudioEmptyState.vue'
import StudioListFrame from '../../packages/cms/studio-app/src/components/studio/StudioListFrame.vue'
import StudioNotice from '../../packages/cms/studio-app/src/components/studio/StudioNotice.vue'
import StudioSegmentedControl from '../../packages/cms/studio-app/src/components/studio/StudioSegmentedControl.vue'
import { provideStudioEntryEditorContext } from '../../packages/cms/studio-app/src/composables/internal/studioEntryEditorContext'
import { useStudioInspectorVisible } from '../../packages/cms/studio-app/src/composables/useStudioInspectorVisible'

function createTestLocalStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, String(value))
    },
  }
}

function installTestLocalStorage(): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: createTestLocalStorage(),
  })

  return () => {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', previous)
      return
    }
    delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
  }
}

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({
    data: ref({ changes: [] }),
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))

function mountWithStudioContext(component: unknown, editor: Record<string, unknown>) {
  const Host = defineComponent({
    setup() {
      provideStudioEntryEditorContext(editor as never)
      return () => h(component as never)
    },
  })

  return mount(Host, {
    attachTo: document.body,
    global: {
      stubs: studioStubs(),
    },
  })
}

function studioStubs() {
  return {
    Badge: defineComponent({
      props: { variant: String },
      template: '<span><slot /></span>',
    }),
    Button: defineComponent({
      inheritAttrs: false,
      props: { disabled: Boolean, size: String, variant: String },
      emits: ['click'],
      template: `<button type="button" :disabled="disabled" v-bind="$attrs" @click="$emit('click')"><slot /></button>`,
    }),
    Dialog: defineComponent({
      props: { open: Boolean },
      template: '<div v-if="open"><slot /></div>',
    }),
    DialogContent: { template: '<div><slot /></div>' },
    DialogDescription: { template: '<p><slot /></p>' },
    DialogFooter: { template: '<footer><slot /></footer>' },
    DialogHeader: { template: '<header><slot /></header>' },
    DialogTitle: { template: '<h2><slot /></h2>' },
    DropdownMenu: { template: '<div><slot /></div>' },
    DropdownMenuContent: { template: '<div><slot /></div>' },
    DropdownMenuItem: { template: '<button type="button"><slot /></button>' },
    DropdownMenuTrigger: { template: '<span><slot /></span>' },
    Globe: { template: '<span />' },
    Label: { template: '<label><slot /></label>' },
    Loader2: { template: '<span />' },
    NuxtTime: {
      props: { datetime: [Number, String] },
      template: '<time>{{ datetime }}</time>',
    },
    Icon: { template: '<span />' },
    Input: defineComponent({
      props: { disabled: Boolean, id: String, modelValue: [String, Number] },
      emits: ['update:modelValue'],
      template:
        '<input :id="id" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    }),
    RouterLink: {
      props: { to: String },
      template: '<a :href="to"><slot /></a>',
    },
    Select: { template: '<div><slot /></div>' },
    SelectContent: { template: '<div><slot /></div>' },
    SelectItem: { template: '<div><slot /></div>' },
    SelectTrigger: { template: '<button type="button"><slot /></button>' },
    Separator: { template: '<span />' },
    Skeleton: { template: '<div />' },
    StudioFieldRenderer: {
      props: { field: Object, modelValue: null },
      template: '<div>{{ field?.label || field?.key }}</div>',
    },
    StudioFieldShell: {
      props: { for: String, label: String },
      template: '<div><label :for="$props.for">{{ label }}</label><slot /></div>',
    },
    StudioSection: {
      props: { badge: String, title: String },
      template:
        '<section><h2>{{ title }}</h2><span v-if="badge">{{ badge }}</span><slot /></section>',
    },
    StudioStatusPill: {
      props: { label: String },
      template: '<span>{{ label }}</span>',
    },
    StudioConfirmDialog: defineComponent({
      props: {
        confirmLabel: String,
        description: String,
        open: Boolean,
        title: String,
      },
      emits: ['confirm', 'update:open'],
      template: `<section v-if="open"><h2>{{ title }}</h2><p>{{ description }}</p><slot /><button type="button" @click="$emit('confirm')">{{ confirmLabel || 'Confirm' }}</button></section>`,
    }),
    Textarea: defineComponent({
      props: { modelValue: String, placeholder: String },
      emits: ['update:modelValue'],
      template: '<textarea :value="modelValue" :placeholder="placeholder" />',
    }),
  }
}

describe('Studio shadcn surface wrappers', () => {
  it('renders notices with tone, title, body, and action slot', () => {
    const wrapper = mount(StudioNotice, {
      global: { stubs: studioStubs() },
      props: {
        tone: 'warning',
        title: 'Usage affected',
        description: 'Review content before deleting this asset.',
      },
      slots: {
        action: '<button type="button">Review</button>',
      },
    })

    expect(wrapper.text()).toContain('Usage affected')
    expect(wrapper.text()).toContain('Review content before deleting this asset.')
    expect(wrapper.text()).toContain('Review')
    expect(wrapper.classes().join(' ')).toContain('border-warning')
  })

  it('renders empty states with custom action content', () => {
    const wrapper = mount(StudioEmptyState, {
      global: { stubs: studioStubs() },
      props: {
        title: 'No changed drafts',
        description: 'Start from Content when ready.',
      },
      slots: {
        action: '<button type="button">Create</button>',
      },
    })

    expect(wrapper.text()).toContain('No changed drafts')
    expect(wrapper.text()).toContain('Start from Content when ready.')
    expect(wrapper.text()).toContain('Create')
  })

  it('keeps list frame loading, empty, and row states distinct', () => {
    const loading = mount(StudioListFrame, {
      global: { stubs: studioStubs() },
      props: { title: 'Imports', loading: true },
    })
    const empty = mount(StudioListFrame, {
      global: { stubs: studioStubs() },
      props: { title: 'Imports', empty: true },
      slots: { empty: '<p>No imports</p>' },
    })
    const loaded = mount(StudioListFrame, {
      global: { stubs: studioStubs() },
      props: { title: 'Imports', count: 2 },
      slots: { default: '<div>Run 1</div>' },
    })

    expect(loading.text()).toContain('Imports')
    expect(empty.text()).toContain('No imports')
    expect(loaded.text()).toContain('Run 1')
    expect(loaded.text()).toContain('2')
  })

  it('emits selected segment changes with radio semantics', async () => {
    const wrapper = mount(StudioSegmentedControl, {
      global: {
        stubs: {
          ToggleGroup: defineComponent({
            props: { ariaLabel: String, modelValue: String },
            emits: ['update:modelValue'],
            template: '<div role="radiogroup" :aria-label="ariaLabel"><slot /></div>',
          }),
          ToggleGroupItem: defineComponent({
            props: { value: String },
            emits: ['click'],
            template:
              '<button type="button" role="radio" @click="$parent?.$emit?.(\'update:modelValue\', value)"><slot /></button>',
          }),
        },
      },
      props: {
        ariaLabel: 'Editor mode',
        modelValue: 'single',
        items: [
          { value: 'single', label: 'Single' },
          { value: 'compare', label: 'Compare' },
        ],
      },
    })

    expect(wrapper.attributes('role')).toBe('radiogroup')
    await wrapper.findAll('button')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['compare'])
  })
})

const t = (key: string, params?: Record<string, unknown>) => {
  const labels: Record<string, string> = {
    'ginkoCms.studio.collectionsPage.collectionSettings': 'Content type details',
    'ginkoCms.studio.collectionsPage.supportedLocales': 'Supported locales',
    'ginkoCms.studio.collectionsPage.fieldsCount': `${params?.count ?? 0} fields`,
    'ginkoCms.studio.collectionsPage.widthHalfLabel': 'half width',
    'ginkoCms.studio.collectionsPage.noFields': 'No fields defined yet.',
  }
  return labels[key] ?? key
}

function mountCollectionContractSection(overrides: Record<string, unknown> = {}) {
  return mount(StudioCollectionContractSection, {
    global: { stubs: studioStubs() },
    props: {
      collectionDetail: {
        contract: { source: 'code', version: 'contract-v1' },
        projectionStatus: {
          activeCollectionProjectionRunId: 'collection-batch-1',
          activeSiteProjectionRunId: 'site-batch-1',
          activatedAt: Date.now(),
        },
        routing: { slugMode: 'localized', rootSlug: 'index' },
        type: 'tree',
      },
      collectionDraft: {
        icon: 'lucide:file-text',
        id: 'collection-id',
        label: 'Docs',
        localized: 'en, de',
        maxDepth: '3',
        mode: 'route',
        pathPrefix: '/docs',
        singleton: false,
      },
      locales: [
        { code: 'en', label: 'English' },
        { code: 'de', label: 'Deutsch' },
      ],
      selectedCollection: 'docs',
      t,
      ...overrides,
    },
  })
}

function createCompareToolbarEditor() {
  const translationMode = ref(false)
  const secondaryLocale = ref('')

  return reactive({
    loader: {
      canEditEntries: true,
      currentLocale: 'en',
      locales: [
        { code: 'en', label: 'English' },
        { code: 'de', label: 'Deutsch' },
      ],
    },
    draft: {
      saving: false,
    },
    locales: {
      translationMode,
      secondaryLocale,
      handleSelectSecondaryLocale: (locale: string) => {
        secondaryLocale.value = locale
      },
      handleSwitchLocale: vi.fn(),
      setTranslationMode: (enabled: boolean) => {
        translationMode.value = enabled
      },
    },
  })
}

function createLocalePanelEditor() {
  return reactive({
    loader: {
      canEditEntries: true,
      collectionConfig: {
        mode: 'route',
        pathPrefix: '/changelog',
        routing: { mode: 'path', slugMode: 'localized' },
        slugMode: 'localized',
      },
      currentLocale: 'en',
      dateLocale: 'en',
      entry: { publishedAt: '2026-05-21T12:52:50.899Z' },
      localizedFields: [{ key: 'title', label: 'Title', type: 'text' }],
      t: (key: string) => (key === 'ginkoCms.common.path' ? 'Path' : key),
    },
    draft: {
      assetContext: {},
      computedPath: '/changelog/security',
      dataFields: { title: 'Security Enhancements' },
      editorContext: {},
      form: { slug: 'security' },
      saving: false,
    },
    locales: {
      handleSaveSecondaryDraft: vi.fn(),
      secondaryAssetContext: {},
      secondaryDataFields: { title: 'Sicherheitsverbesserungen' },
      secondaryEditorContext: {},
      secondaryLocale: 'de',
    },
    copyPrimaryToSecondary: vi.fn(),
  })
}

function mountLocalePanelComparison() {
  const editor = createLocalePanelEditor()
  const Host = defineComponent({
    setup() {
      provideStudioEntryEditorContext(editor as never)
      return () =>
        h('div', [
          h(StudioLocaleEditorPanel, { side: 'primary' }),
          h(StudioLocaleEditorPanel, { side: 'secondary', status: 'Public' }),
        ])
    },
  })

  return mount(Host, {
    global: {
      stubs: studioStubs(),
    },
  })
}

function createSharedFieldsPanelEditor() {
  return reactive({
    loader: {
      canEditEntries: true,
      currentLocale: 'en',
      isTree: false,
      parentOptions: [],
      sharedFields: [
        { key: 'date', label: 'Date', localized: false, type: 'date' },
        { key: 'image', label: 'Image', localized: false, type: 'asset' },
      ],
      t: (key: string) => key,
    },
    draft: {
      assetContext: {},
      dataFields: {
        date: '2024-12-11',
        image: 'asset-id',
      },
      editorContext: {},
      form: {
        badge: '',
        icon: '',
        kind: 'page',
        parentEntryId: '',
        slug: 'security',
      },
    },
  })
}

function mountSharedFieldsPanel() {
  const editor = createSharedFieldsPanelEditor()
  const Host = defineComponent({
    setup() {
      provideStudioEntryEditorContext(editor as never)
      return () => h(StudioSharedFieldsPanel)
    },
  })

  return mount(Host, {
    global: {
      stubs: studioStubs(),
    },
  })
}

const baseVisibility = {
  error: null,
  errorMessage: '',
  globalDiagnostics: [],
  isRouteBacked: true,
  localeRows: [
    {
      current: true,
      diagnostics: [],
      draftPath: '/hello',
      draftState: 'Draft exists',
      hiddenDiagnosticCount: 0,
      href: '/hello',
      label: 'Public',
      locale: 'en',
      missingRequiredFields: [],
      nav: 'included',
      path: '/hello',
      publishedPath: '/hello',
      publishedState: 'Published',
      reasons: [],
      search: 'included',
      secondaryLabels: [],
      sitemap: 'included',
      visibleDiagnostics: [],
    },
  ],
  pending: false,
  publishedLocales: ['en'],
  status: 'Visibility by locale',
  hiddenGlobalDiagnosticCount: 0,
}

const emptyRouteValidation = {
  diagnostics: [],
  hiddenDiagnosticCount: 0,
  message: '',
  state: 'idle',
}

const idleImpact = {
  cacheTags: [],
  error: null,
  events: [],
  locales: [],
  message: '',
  pending: false,
  state: 'idle',
  status: null,
}

const publishReview = {
  blocked: false,
  failed: false,
  label: 'Ready',
  locales: ['en'],
  message: 'Ready to publish',
  previewHash: 'preview-hash',
  stale: false,
  state: 'ready',
}

describe('Studio workflow components', () => {
  it('renders shared properties without URL ownership copy', () => {
    const wrapper = mountSharedFieldsPanel()

    expect(wrapper.text()).toContain('Shared properties')
    expect(wrapper.text()).toContain('Applies to all locales')
    expect(wrapper.text()).toContain('Date')
    expect(wrapper.text()).toContain('Image')
    expect(wrapper.text()).not.toContain('Publishing details')
    expect(wrapper.text()).not.toContain('Locale-specific URLs')
    expect(wrapper.text()).not.toContain('Each locale manages its URL')
    expect(wrapper.text()).not.toContain('Public URL')
  })

  it('keeps localized URL rows present in both compare columns', () => {
    const wrapper = mountLocalePanelComparison()
    const urlRows = wrapper.findAll('.studio-locale-panel__localized-url')

    expect(urlRows).toHaveLength(2)
    expect(urlRows[0]?.text()).toContain('This URL slug belongs to EN only.')
    expect((urlRows[1]?.find('input').element as HTMLInputElement).value).toBe('Managed in EN')
    expect(urlRows[1]?.text()).toContain('URL managed in EN.')
    expect(wrapper.text()).toContain('Title')
  })

  it('restores the inspector after Compare auto-collapses it and Single is selected', async () => {
    const restoreLocalStorage = installTestLocalStorage()
    try {
      const inspectorVisible = useStudioInspectorVisible()
      inspectorVisible.value = true
      const wrapper = mountWithStudioContext(
        StudioEntryCompareToolbar,
        createCompareToolbarEditor(),
      )
      const compareButton = wrapper
        .findAll('button')
        .find((button) => button.text().includes('Compare'))
      const singleButton = wrapper
        .findAll('button')
        .find((button) => button.text().includes('Single'))

      expect(compareButton).toBeTruthy()
      expect(singleButton).toBeTruthy()

      await compareButton?.trigger('click')
      expect(inspectorVisible.value).toBe(false)

      await singleButton?.trigger('click')
      expect(inspectorVisible.value).toBe(true)
    } finally {
      restoreLocalStorage()
    }
  })

  it('does not reopen the inspector when it was already hidden before Compare', async () => {
    const restoreLocalStorage = installTestLocalStorage()
    try {
      const inspectorVisible = useStudioInspectorVisible()
      inspectorVisible.value = false
      const wrapper = mountWithStudioContext(
        StudioEntryCompareToolbar,
        createCompareToolbarEditor(),
      )
      const compareButton = wrapper
        .findAll('button')
        .find((button) => button.text().includes('Compare'))
      const singleButton = wrapper
        .findAll('button')
        .find((button) => button.text().includes('Single'))

      expect(compareButton).toBeTruthy()
      expect(singleButton).toBeTruthy()

      await compareButton?.trigger('click')
      await singleButton?.trigger('click')

      expect(inspectorVisible.value).toBe(false)
    } finally {
      restoreLocalStorage()
    }
  })

  it('renders page-backed content setup as developer-managed website capability', () => {
    const wrapper = mountCollectionContractSection()

    expect(wrapper.text()).toContain('Content type details')
    expect(wrapper.text()).toContain('Managed by developers')
    expect(wrapper.text()).toContain('Creates website pages')
    expect(wrapper.text()).toContain('Page routes')
    expect(wrapper.text()).toContain('Sitemap')
    expect(wrapper.text()).toContain('contract-v1')
    expect(wrapper.text()).toContain('collection-batch-1')
  })

  it('renders shared-content setup without page controls and with actionable drift', () => {
    const wrapper = mountCollectionContractSection({
      collectionDetail: {
        contract: { source: 'code', version: 'authors-v1' },
        type: 'flat',
      },
      collectionDraft: {
        icon: 'lucide:user',
        id: 'authors-id',
        label: 'Authors',
        localized: '',
        maxDepth: '',
        mode: 'none',
        pathPrefix: '/authors',
        singleton: false,
      },
      selectedCollection: 'authors',
    })

    expect(wrapper.text()).toContain('Shared content')
    expect(wrapper.text()).toContain('Lists')
    expect(wrapper.text()).toContain('Relations')
    expect(wrapper.text()).toContain('Page controls are hidden')
    expect(wrapper.text()).toContain('Stale URL prefix')
    expect(wrapper.text()).toContain('/authors')
    expect(wrapper.text()).not.toContain('URL settings')
  })

  it('shows missing contract and projection state honestly', () => {
    const wrapper = mountCollectionContractSection({
      collectionDetail: null,
    })

    expect(wrapper.text()).toContain('unknown')
    expect(wrapper.text()).toContain('not synced')
    expect(wrapper.text()).toContain('none active')
  })

  it('shows stale publish impact without a confirmable preview hash', () => {
    const wrapper = mount(StudioEntryPublicWorkflowPanel, {
      global: { stubs: studioStubs() },
      props: {
        publicVisibility: baseVisibility,
        publishImpact: {
          ...idleImpact,
          message: 'Publish impact preview is stale. Preview again before publishing.',
          state: 'stale',
        },
        publishImpactRequested: true,
        publishReview: { ...publishReview, previewHash: null, stale: true, state: 'stale' },
        previewScope: 'publish',
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: null,
      },
    })

    expect(wrapper.text()).toContain('Publish impact preview is stale')
    expect(wrapper.text()).not.toContain('Preview preview-hash')
  })

  it('labels translation readiness previews as read-only', () => {
    const wrapper = mount(StudioEntryPublicWorkflowPanel, {
      global: { stubs: studioStubs() },
      props: {
        publicVisibility: baseVisibility,
        publishImpact: {
          ...idleImpact,
          locales: [
            {
              blockingDiagnostics: [],
              changes: [],
              currentHref: null,
              currentPath: null,
              hiddenBlockerCount: 0,
              label: 'Ready to publish',
              locale: 'de',
              nav: { after: true, before: false },
              nextHref: '/de/hallo',
              nextPath: '/hallo',
              search: { after: true, before: false },
              sitemap: { after: true, before: false },
              status: 'ready',
              visibleBlockers: [],
              visibleWarnings: [],
              warnings: [],
            },
          ],
          message: 'Ready to publish',
          state: 'ready',
          status: 'ready',
        },
        publishImpactRequested: true,
        publishReview,
        previewScope: 'workflow',
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: 'de',
      },
    })

    expect(wrapper.text()).toContain('Read-only readiness preview')
    expect(wrapper.text()).toContain('It does not confirm the header Publish action.')
    expect(wrapper.text()).not.toContain('Preview preview-hash')
  })

  it('renders global visibility diagnostics once at panel level', () => {
    const wrapper = mount(StudioEntryPublicWorkflowPanel, {
      global: { stubs: studioStubs() },
      props: {
        publicVisibility: {
          ...baseVisibility,
          globalDiagnostics: [
            {
              code: 'redirect_target_missing',
              href: '/missing',
              message: 'Redirect target is missing.',
              path: '/missing',
              severity: 'error',
            },
          ],
          hiddenGlobalDiagnosticCount: 1,
        },
        publishImpact: idleImpact,
        publishImpactRequested: false,
        publishReview,
        previewScope: null,
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: null,
      },
    })

    expect(wrapper.text()).toContain('Redirect target missing')
    expect(wrapper.text()).toContain('Redirect target is missing.')
    expect(wrapper.text()).toContain('+1 more global diagnostic')
  })

  it('summarizes public output without treating data-only entries as routed pages', () => {
    const wrapper = mount(StudioEntryPublicWorkflowPanel, {
      global: { stubs: studioStubs() },
      props: {
        publicVisibility: {
          ...baseVisibility,
          isRouteBacked: false,
          localeRows: [
            {
              ...baseVisibility.localeRows[0],
              diagnostics: [
                {
                  code: 'missing_required_localized_field',
                  message: 'Title is missing.',
                  severity: 'error',
                },
              ],
              missingRequiredFields: ['title'],
            },
          ],
          publishedLocales: [],
          status: 'Data-only',
        },
        publishImpact: idleImpact,
        publishImpactRequested: false,
        publishReview,
        previewScope: null,
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: null,
      },
    })

    expect(wrapper.text()).toContain('Published website content')
    expect(wrapper.text()).toContain('No page route is produced for this data-only collection.')
    expect(wrapper.text()).toContain('List-only')
    expect(wrapper.text()).toContain('Blocking rows')
  })

  it('hides publish impact developer diagnostics unless diagnostics mode is enabled', () => {
    const wrapper = mount(StudioEntryPublicWorkflowPanel, {
      global: { stubs: studioStubs() },
      props: {
        publicVisibility: baseVisibility,
        publishImpact: {
          ...idleImpact,
          cacheTags: ['entry:entry-1', 'collection:docs'],
          events: ['entry.published'],
          message: 'Ready to publish',
          state: 'ready',
          status: 'ready',
        },
        publishImpactRequested: true,
        publishReview,
        previewScope: 'publish',
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: null,
      },
    })

    expect(wrapper.text()).not.toContain('Developer diagnostics')
    expect(wrapper.text()).not.toContain('entry:entry-1')
    expect(wrapper.text()).not.toContain('collection:docs')
    expect(wrapper.text()).not.toContain('entry.published')
  })

  it('renders publish impact cache tags and events in diagnostics mode', () => {
    const restoreLocalStorage = installTestLocalStorage()
    try {
      window.history.replaceState(null, '', '/studio/docs/entry-1?diagnostics=1')
      localStorage.setItem('ginko-cms:studio:advanced-editor', 'true')
      const wrapper = mount(StudioEntryPublicWorkflowPanel, {
        global: { stubs: studioStubs() },
        props: {
          publicVisibility: baseVisibility,
          publishImpact: {
            ...idleImpact,
            cacheTags: ['entry:entry-1', 'collection:docs'],
            events: ['entry.published'],
            message: 'Ready to publish',
            state: 'ready',
            status: 'ready',
          },
          publishImpactRequested: true,
          publishReview,
          previewScope: 'publish',
          routeValidationRequested: false,
          routeValidationState: emptyRouteValidation,
          selectedPublishImpactLocale: null,
        },
      })

      expect(wrapper.text()).toContain('Developer diagnostics')
      expect(wrapper.text()).toContain('entry:entry-1')
      expect(wrapper.text()).toContain('collection:docs')
      expect(wrapper.text()).toContain('entry.published')
    } finally {
      window.history.replaceState(null, '', '/')
      restoreLocalStorage()
    }
  })

  it('does not dirty rich text while disabled', async () => {
    const wrapper = mount(FieldRichtext, {
      props: {
        field: {
          key: 'body',
          type: 'richtext',
          required: false,
          description: null,
        },
        modelValue: 'Original',
        label: 'Body',
        fieldError: null,
        disabled: true,
      },
      global: {
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          Icon: { template: '<span />' },
          StudioAssetMetadataDialog: { template: '<div />' },
          StudioAssetPicker: { template: '<div />' },
          StudioFieldShell: { template: '<section><slot name="action" /><slot /></section>' },
          RichtextEditor: defineComponent({
            props: { disabled: Boolean, modelValue: String },
            emits: ['update:modelValue'],
            template:
              '<button type="button" data-testid="richtext-editor" :data-disabled="String(disabled)" @click="$emit(\'update:modelValue\', \'Changed\')">{{ modelValue }}</button>',
          }),
        },
      },
    })

    const editor = wrapper.get('[data-testid="richtext-editor"]')
    expect(editor.attributes('data-disabled')).toBe('true')
    await editor.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it.each([
    ['array', FieldArray, []],
    ['object', FieldObject, {}],
    ['blocks', FieldBlocks, []],
  ])(
    'renders required state and inline errors for %s container fields',
    (_type, component, value) => {
      const wrapper = mount(component, {
        props: {
          field: {
            key: 'socials',
            type: _type,
            required: true,
            description: null,
            fields: [],
          },
          modelValue: value,
          label: 'Socials',
          fieldError: 'Socials is required.',
        },
        global: {
          stubs: {
            ...studioStubs(),
            Icon: { template: '<span />' },
            StudioFieldRenderer: { template: '<div />' },
            Select: { template: '<div><slot /></div>' },
            SelectTrigger: { template: '<button type="button"><slot /></button>' },
            SelectValue: { template: '<span />' },
            SelectContent: { template: '<div><slot /></div>' },
            SelectItem: { template: '<div><slot /></div>' },
          },
        },
      })

      expect(wrapper.text()).toContain('Socials')
      expect(wrapper.text()).toContain('*')
      expect(wrapper.text()).toContain('Socials is required.')
    },
  )

  it.each([
    [
      'idle',
      false,
      { ...emptyRouteValidation, state: 'idle', message: '' },
      'Run validation to check site-wide route and redirect conflicts.',
    ],
    [
      'pending',
      true,
      { ...emptyRouteValidation, state: 'pending', message: 'Validating public routes...' },
      'Validating public routes...',
    ],
    [
      'failed',
      true,
      { ...emptyRouteValidation, state: 'error', message: 'Route validation failed.' },
      'Route validation failed.',
    ],
    [
      'empty',
      true,
      {
        ...emptyRouteValidation,
        state: 'empty',
        message: 'Site route validation: no diagnostics.',
      },
      'Site route validation: no diagnostics.',
    ],
    [
      'malformed',
      true,
      {
        ...emptyRouteValidation,
        state: 'missing',
        message: 'Route validation returned no usable result.',
      },
      'Route validation returned no usable result.',
    ],
    [
      'diagnostics',
      true,
      {
        diagnostics: [
          {
            code: 'route_collision',
            href: '/docs',
            message: 'Route collision found.',
            path: '/docs',
            severity: 'error',
          },
        ],
        hiddenDiagnosticCount: 0,
        message: 'Site route validation: 1 diagnostic.',
        state: 'found',
      },
      'Route collision found.',
    ],
  ])('renders route validation state: %s', (_name, requested, routeValidationState, text) => {
    const wrapper = mount(StudioEntryPublicWorkflowPanel, {
      global: { stubs: studioStubs() },
      props: {
        publicVisibility: baseVisibility,
        publishImpact: idleImpact,
        publishImpactRequested: false,
        publishReview,
        previewScope: null,
        routeValidationRequested: requested,
        routeValidationState,
        selectedPublishImpactLocale: null,
      },
    })

    expect(wrapper.text()).toContain(text)
  })

  it('emits translation readiness review for the selected locale', async () => {
    const wrapper = mount(StudioEntryTranslationReadinessPanel, {
      global: { stubs: studioStubs() },
      props: {
        currentLocale: 'en',
        items: [
          {
            draftPath: '/hallo',
            exists: true,
            impactLabel: 'Not previewed',
            label: 'Deutsch',
            locale: 'de',
            missingFields: [],
            missingRoute: false,
            parentBlocked: false,
            published: false,
            status: 'Draft only',
            suggestedAction: 'Draft exists. Review the translation and preview publish impact.',
          },
        ],
        saving: false,
      },
    })

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('review')?.[0]).toEqual(['de'])
  })

  it('renders translation readiness blockers as scannable badges', () => {
    const wrapper = mount(StudioEntryTranslationReadinessPanel, {
      global: { stubs: studioStubs() },
      props: {
        currentLocale: 'en',
        items: [
          {
            draftPath: null,
            exists: false,
            impactLabel: 'Blocked',
            label: 'Deutsch',
            locale: 'de',
            missingFields: ['title'],
            missingRoute: true,
            parentBlocked: true,
            published: false,
            status: 'Visibility unknown',
            suggestedAction: 'Create this locale variant before translating.',
          },
        ],
        saving: false,
      },
    })

    expect(wrapper.text()).toContain('Missing locale')
    expect(wrapper.text()).toContain('Missing route')
    expect(wrapper.text()).toContain('Parent blocked')
    expect(wrapper.text()).toContain('Missing fields')
  })
})

describe('Studio destructive dialogs', () => {
  function fakeEditor(readinessState: string, previewHash: string | null = null) {
    return {
      history: { entryAssets: [{ id: 'asset-1' }] },
      loader: {
        currentLocale: 'en',
        entry: { draftVersion: 7, publishedAt: 1, status: 'published' },
        entryId: 'entry-1',
        localeVariants: [{ locale: 'en' }],
        locales: [{ code: 'en' }],
        t: (key: string, params?: Record<string, unknown>) =>
          params?.count ? `${key} ${params.count}` : key,
      },
      publishing: {
        confirmPublish: vi.fn(),
        publishMessage: '',
        publishMode: 'single',
        publishReadiness: {
          confirmationExpiresAt: previewHash ? Date.now() + 60_000 : null,
          confirmationToken: previewHash ? 'token' : null,
          locales: ['en'],
          message: `${readinessState} message`,
          previewHash,
          state: readinessState,
        },
        showPublishDialog: true,
      },
    }
  }

  it.each(['not_previewed', 'blocked', 'stale', 'pending', 'failed'])(
    'disables publish confirmation for %s readiness',
    (state) => {
      const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor(state))
      const buttons = wrapper.findAll('button')
      const confirm = buttons[buttons.length - 1]

      expect(confirm.attributes('disabled')).toBeDefined()
    },
  )

  it('disables publish confirmation when ready readiness has no confirmation token', () => {
    const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor('ready'))
    const buttons = wrapper.findAll('button')
    const confirm = buttons[buttons.length - 1]

    expect(wrapper.text()).toContain('Publish confirmation token is missing. Preview again.')
    expect(confirm.attributes('disabled')).toBeDefined()
  })

  it.each(['ready'])('allows publish confirmation for %s readiness', (state) => {
    const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor(state, 'hash'))
    const buttons = wrapper.findAll('button')
    const confirm = buttons[buttons.length - 1]

    expect(wrapper.text()).toContain('No blocking issues')
    expect(wrapper.text()).toContain('Review readiness, website changes')
    expect(confirm.attributes('disabled')).toBeUndefined()
  })
})
