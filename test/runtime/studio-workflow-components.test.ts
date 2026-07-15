// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'

import de from '../../packages/cms/src/public/locales/de'
import en from '../../packages/cms/src/public/locales/en'
import StudioCollectionContractSection from '../../packages/cms/studio-app/src/components/studio/collections/StudioCollectionContractSection.vue'
import StudioCheckpointDialog from '../../packages/cms/studio-app/src/components/studio/editor/StudioCheckpointDialog.vue'
import StudioEntryPublicWorkflowPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryPublicWorkflowPanel.vue'
import StudioEntryStatusRail from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryStatusRail.vue'
import StudioEntryTranslationReadinessPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryTranslationReadinessPanel.vue'
import StudioLocaleEditorPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioLocaleEditorPanel.vue'
import StudioPublishDialog from '../../packages/cms/studio-app/src/components/studio/editor/StudioPublishDialog.vue'
import StudioPublishOutcomeCard from '../../packages/cms/studio-app/src/components/studio/editor/StudioPublishOutcomeCard.vue'
import StudioSharedFieldsPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioSharedFieldsPanel.vue'
import StudioVersionHistoryCard from '../../packages/cms/studio-app/src/components/studio/editor/StudioVersionHistoryCard.vue'
import FieldArray from '../../packages/cms/studio-app/src/components/studio/fields/FieldArray.vue'
import FieldBlocks from '../../packages/cms/studio-app/src/components/studio/fields/FieldBlocks.vue'
import FieldObject from '../../packages/cms/studio-app/src/components/studio/fields/FieldObject.vue'
import FieldRelations from '../../packages/cms/studio-app/src/components/studio/fields/FieldRelations.vue'
import FieldRichtext from '../../packages/cms/studio-app/src/components/studio/fields/FieldRichtext.vue'
import StudioEmptyState from '../../packages/cms/studio-app/src/components/studio/StudioEmptyState.vue'
import StudioListFrame from '../../packages/cms/studio-app/src/components/studio/StudioListFrame.vue'
import StudioNotice from '../../packages/cms/studio-app/src/components/studio/StudioNotice.vue'
import StudioSegmentedControl from '../../packages/cms/studio-app/src/components/studio/StudioSegmentedControl.vue'
import FieldError from '../../packages/cms/studio-app/src/components/ui/field/FieldError.vue'
import { useStudioAdvancedEditor } from '../../packages/cms/studio-app/src/composables/useStudioAdvancedEditor'
import { provideStudioEntryEditorContext } from '../../packages/cms/studio-app/src/composables/internal/studioEntryEditorContext'

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

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery', () => ({
  useCmsStudioPaginatedQuery: () => ({
    hasNextPage: ref(false),
    results: ref([
      {
        _id: 'entry-1',
        slug: 'first-entry',
        stableId: 'stable-1',
        title: 'First entry',
      },
    ]),
    status: ref('loaded'),
  }),
}))

function mountWithStudioContext(
  component: unknown,
  editor: Record<string, unknown>,
  props?: Record<string, unknown>,
) {
  const Host = defineComponent({
    setup() {
      provideStudioEntryEditorContext(editor as never)
      return () => h(component as never, props)
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
    FieldDescription: { template: '<p><slot /></p>' },
    FieldError: { template: '<p role="alert"><slot /></p>' },
    FieldLegend: { template: '<legend><slot /></legend>' },
    FieldSet: { template: '<fieldset><slot /></fieldset>' },
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
    Item: { template: '<div><slot /></div>' },
    ItemActions: { template: '<div><slot /></div>' },
    ItemContent: { template: '<div><slot /></div>' },
    ItemDescription: { template: '<div><slot /></div>' },
    ItemTitle: { template: '<div><slot /></div>' },
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
    StudioDeveloperDetails: {
      props: { framed: Boolean, title: String },
      template: '<details><summary>{{ title || "Advanced details" }}</summary><slot /></details>',
    },
    StudioInspectorSection: {
      props: { title: String },
      template: '<section><h2>{{ title }}</h2><slot name="action" /><slot /></section>',
    },
    StudioNotice: {
      props: { description: String, title: String, tone: String },
      template:
        '<div role="alert"><strong v-if="title">{{ title }}</strong><p v-if="description">{{ description }}</p><slot /><slot name="action" /></div>',
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
  it('announces field validation errors', () => {
    const wrapper = mount(FieldError, { slots: { default: 'Title is required.' } })

    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.text()).toBe('Title is required.')
  })

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

function dictionaryT(messages: unknown) {
  return (key: string, params?: Record<string, unknown>, defaultValue?: string) => {
    let value: unknown = messages
    for (const segment of key.split('.')) {
      value =
        value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined
    }
    if (typeof value !== 'string') return defaultValue ?? key
    return Object.entries(params ?? {}).reduce(
      (message, [paramKey, paramValue]) => message.replaceAll(`{${paramKey}}`, String(paramValue)),
      value,
    )
  }
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

function createSharedFieldsPanelEditor(locales: string[] = ['en']) {
  return reactive({
    loader: {
      canEditEntries: true,
      currentLocale: 'en',
      isTree: false,
      locales,
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

function mountSharedFieldsPanel(locales: string[] = ['en']) {
  const editor = createSharedFieldsPanelEditor(locales)
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

const readyPublishImpact = {
  ...idleImpact,
  locales: [
    {
      blockingDiagnostics: [],
      changes: [
        { after: '/hello', before: '/old-page', kind: 'route', label: 'Public route' },
        { after: 'New search title', before: 'Old search title', kind: 'seo', label: 'Meta title' },
        { after: true, before: false, kind: 'nav', label: 'Navigation' },
      ],
      currentHref: '/old-page',
      currentPath: '/old-page',
      hiddenBlockerCount: 0,
      label: 'Website changes ready',
      locale: 'en',
      nav: { after: true, before: false },
      nextHref: '/hello',
      nextPath: '/hello',
      search: { after: true, before: true },
      sitemap: { after: true, before: true },
      status: 'ready',
      visibleBlockers: [],
      visibleWarnings: [],
      warnings: [],
    },
  ],
  message: 'Publish preview is ready.',
  state: 'ready',
  status: 'ready',
}

const publishReview = {
  blocked: false,
  failed: false,
  label: 'Ready',
  locales: ['en'],
  message: 'Ready to publish',
  stale: false,
  state: 'ready',
}

const baseReadinessDetail = {
  collection: 'docs',
  entryId: 'entry-1',
  primaryLocale: 'en',
  updatedAt: 1,
  locales: [
    {
      affectedPublicUrls: [
        {
          afterHref: '/hello',
          afterPath: '/hello',
          beforeHref: null,
          beforePath: null,
          entryId: 'entry-1',
          kind: 'current_entry',
          locale: 'en',
          reason: 'publish',
        },
      ],
      blockers: [],
      canArchive: true,
      canPreview: true,
      canPublish: true,
      canRequestReview: true,
      currentDraftVersion: 7,
      currentPublishedRevisionId: null,
      draftExists: true,
      draftUrl: '/hello',
      hasUnpublishedChanges: true,
      infos: [],
      locale: 'en',
      nextAction: {
        kind: 'publish_locale',
        locale: 'en',
        params: {},
        target: 'publish',
      },
      publicUrl: null,
      published: false,
      reviewRequestId: null,
      state: 'ready',
      warnings: [],
    },
  ],
}

function railEditor(translate = dictionaryT(en)) {
  return {
    draft: { computedPath: '/hello' },
    history: {},
    loader: {
      currentLocale: 'en',
      dateLocale: 'en',
      entry: { draftVersion: 7, publishedAt: null, status: 'draft' },
      entryId: 'entry-1',
      t: translate,
    },
    locales: {},
  }
}

describe('Studio workflow components', () => {
  it('renders shared properties without URL ownership copy', () => {
    // Multilingual sites get the shared-fields framing…
    const multilingual = mountSharedFieldsPanel(['en', 'de'])
    expect(multilingual.text()).toContain('ginkoCms.studio.collectionEditor.sharedFields')
    expect(multilingual.text()).toContain(
      'ginkoCms.studio.collectionEditor.appliesToAllLanguages',
    )

    // …single-language sites get plain "Details" with no language vocabulary
    // (design review S2, principle 6).
    const wrapper = mountSharedFieldsPanel()
    expect(wrapper.text()).toContain('ginkoCms.common.metadata')
    expect(wrapper.text()).not.toContain('ginkoCms.studio.collectionEditor.appliesToAllLanguages')
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

  it('shows stale publish impact without a confirmable preview', () => {
    const wrapper = mount(StudioEntryPublicWorkflowPanel, {
      global: { stubs: studioStubs() },
      props: {
        publicVisibility: baseVisibility,
        publishImpact: {
          ...idleImpact,
          message: 'Website changes preview is stale. Preview again before publishing.',
          state: 'stale',
        },
        publishImpactRequested: true,
        publishReview: { ...publishReview, stale: true, state: 'stale' },
        previewScope: 'publish',
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: null,
      },
    })

    expect(wrapper.text()).toContain('Website changes preview is stale')
    expect(wrapper.text()).not.toContain('Preview receipt')
  })

  it('renders backend readiness state and blockers in the status rail', () => {
    const readinessDetail = {
      ...baseReadinessDetail,
      locales: [
        {
          ...baseReadinessDetail.locales[0],
          blockers: [
            {
              code: 'required_localized_field_missing',
              diagnosticId: null,
              fieldPath: 'title',
              locale: 'en',
              messageParams: {},
              severity: 'blocker',
            },
          ],
          canPublish: false,
          nextAction: {
            kind: 'fill_required_localized_field',
            locale: 'en',
            params: { fieldPath: 'title' },
            target: 'field',
          },
          state: 'needs_work',
        },
      ],
    }
    const Host = defineComponent({
      setup() {
        provideStudioEntryEditorContext(railEditor() as never)
        return () =>
          h(StudioEntryStatusRail, {
            publicVisibility: baseVisibility,
            readinessDetail,
            publishImpact: idleImpact,
            publishImpactRequested: false,
            publishReview,
            previewScope: null,
            routeValidationRequested: false,
            routeValidationState: emptyRouteValidation,
            selectedPublishImpactLocale: null,
            translationReadiness: [],
          })
      },
    })
    const wrapper = mount(Host, { global: { stubs: studioStubs() } })

    // The six-step publishing-flow card is advanced-only now (design review
    // S2, say-it-once): the default rail leads with status + blockers.
    expect(wrapper.text()).not.toContain('Publishing flow')
    expect(wrapper.text()).toContain('Needs work')
    expect(wrapper.text()).toContain('EN: Required translation field is missing: title')
    expect(wrapper.text()).not.toContain('No blocking issues')
  })

  it('shows preview, review, and publish progress in the editor workflow spine', () => {
    // The spine only renders in advanced/diagnostics mode now (design review
    // S2); enable it the same way the app does — via ?diagnostics=1.
    window.history.replaceState({}, '', '/?diagnostics=1')
    const advanced = useStudioAdvancedEditor()
    advanced.value = true

    const wrapper = mountWithStudioContext(StudioEntryStatusRail, railEditor(), {
      publicVisibility: baseVisibility,
      readinessDetail: baseReadinessDetail,
      publishImpact: {
        ...idleImpact,
        message: 'Website changes are ready to review.',
        state: 'ready',
        status: 'ready',
      },
      publishImpactRequested: true,
      publishReview: {
        ...publishReview,
        message: 'Website changes are ready to review.',
      },
      routeValidationRequested: false,
      routeValidationState: emptyRouteValidation,
      translationReadiness: [],
    })

    expect(wrapper.text()).toContain('Publishing flow')
    expect(wrapper.text()).toContain('Website changes are ready to review.')
    expect(wrapper.text()).toContain('Prepared')
    expect(wrapper.text()).toContain('Reviewed')
    expect(wrapper.text()).toContain('Publish the approved website changes.')

    advanced.value = false
    window.history.replaceState({}, '', '/')
  })

  it('tracks live website state, language rollout, and refresh health in the editor rail', () => {
    const editor = railEditor()
    editor.loader.entry = { draftVersion: 8, publishedAt: 1, status: 'published' }
    const wrapper = mountWithStudioContext(StudioEntryStatusRail, editor, {
      publicVisibility: baseVisibility,
      readinessDetail: {
        ...baseReadinessDetail,
        locales: [
          {
            ...baseReadinessDetail.locales[0],
            canPreview: false,
            canPublish: false,
            draftUrl: '/hello',
            hasUnpublishedChanges: false,
            publicUrl: '/hello',
            published: true,
            state: 'live',
          },
        ],
      },
      publishImpact: idleImpact,
      publishImpactRequested: false,
      publishReview,
      routeValidationRequested: false,
      routeValidationState: emptyRouteValidation,
      translationReadiness: [],
    })

    expect(wrapper.text()).toContain('Track live website')
    expect(wrapper.text()).toContain('Live now')
    expect(wrapper.text()).toContain('Live since')
    expect(wrapper.text()).toContain('/hello')
    expect(wrapper.text()).toContain('ENLive')
    expect(wrapper.text()).toContain('No website refresh issues reported.')
  })

  it('shows a post-publish Track outcome with affected pages and refresh status', () => {
    const wrapper = mountWithStudioContext(StudioPublishOutcomeCard, railEditor(), {
      outcome: {
        dirtyLocales: [],
        draftVersion: 8,
        locales: ['en'],
        message: 'Launch update',
        mode: 'single',
        publishedAt: 1,
        versionId: 'version-1',
      },
      publicVisibility: baseVisibility,
      publishImpact: {
        ...readyPublishImpact,
        events: ['content.revalidate'],
      },
    })

    expect(wrapper.text()).toContain('Published to the website')
    expect(wrapper.text()).toContain('Track')
    expect(wrapper.text()).toContain('Published languages')
    expect(wrapper.text()).toContain('EN')
    expect(wrapper.text()).toContain('Launch update')
    expect(wrapper.text()).toContain('Open live page')
    expect(wrapper.text()).toContain('Affected pages')
    expect(wrapper.text()).toContain('Before publish')
    expect(wrapper.text()).toContain('/old-page')
    expect(wrapper.text()).toContain('Live now')
    expect(wrapper.text()).toContain('/hello')
    expect(wrapper.text()).toContain('Website refresh queued')
    expect(wrapper.text()).toContain('Website refresh is queued for the affected pages.')
    expect(wrapper.find('a[href="/hello"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('version-1')
    expect(wrapper.text()).not.toContain('content.revalidate')
  })

  it('renders status rail workflow copy through English and German dictionaries', () => {
    const readinessDetail = {
      ...baseReadinessDetail,
      locales: [
        {
          ...baseReadinessDetail.locales[0],
          blockers: [
            {
              code: 'required_localized_field_missing',
              diagnosticId: null,
              fieldPath: 'title',
              locale: 'en',
              messageParams: {},
              severity: 'blocker',
            },
          ],
          canPublish: false,
          nextAction: {
            kind: 'fill_required_localized_field',
            locale: 'en',
            params: { fieldPath: 'title' },
            target: 'field',
          },
          state: 'needs_work',
        },
      ],
    }
    const mountRail = (messages: unknown) =>
      mountWithStudioContext(StudioEntryStatusRail, railEditor(dictionaryT(messages)), {
        publicVisibility: baseVisibility,
        readinessDetail,
        publishImpact: idleImpact,
        publishImpactRequested: false,
        publishReview,
        previewScope: null,
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: null,
        translationReadiness: [],
      })

    expect(mountRail(en).text()).toContain('Required translation field is missing: title')
    expect(mountRail(de).text()).toContain('Pflichtfeld der Übersetzung fehlt: title')
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

    expect(wrapper.text()).toContain('Read-only publish check')
    expect(wrapper.text()).toContain('It does not confirm the header Publish action.')
    expect(wrapper.text()).not.toContain('Preview preview-hash')
  })

  it('renders a visual website preview from publish impact URLs', () => {
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
              currentHref: '/de/alt',
              currentPath: '/alt',
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
        previewScope: 'publish',
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: 'de',
      },
    })

    expect(wrapper.text()).toContain('Website preview')
    expect(wrapper.text()).toContain('Open preview')
    expect(wrapper.text()).toContain('Open live page')
    expect(wrapper.get('iframe').attributes('src')).toBe('/de/hallo')
    expect(wrapper.get('iframe').attributes('title')).toBe('Website preview for de')
    expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual(
      expect.arrayContaining(['/de/alt', '/de/hallo']),
    )
  })

  it('renders publish impact changes as marketer-readable website effects', () => {
    const wrapper = mount(StudioEntryPublicWorkflowPanel, {
      global: { stubs: studioStubs() },
      props: {
        publicVisibility: baseVisibility,
        publishImpact: {
          ...idleImpact,
          locales: [
            {
              blockingDiagnostics: [],
              changes: [
                {
                  after: '/campaign',
                  before: '/campaign-old',
                  kind: 'route',
                  label: 'Public route',
                },
                {
                  after: 'New campaign title',
                  before: 'Old campaign title',
                  kind: 'seo',
                  label: 'SEO title',
                },
                {
                  after: 'New campaign description',
                  before: 'Old campaign description',
                  kind: 'seo',
                  label: 'SEO description',
                },
                {
                  after: true,
                  before: false,
                  kind: 'sitemap',
                  label: 'Sitemap inclusion',
                },
                {
                  after: true,
                  before: false,
                  kind: 'nav',
                  label: 'Nav inclusion',
                },
              ],
              currentHref: '/campaign-old',
              currentPath: '/campaign-old',
              hiddenBlockerCount: 0,
              label: 'Ready to publish',
              locale: 'en',
              nav: { after: true, before: false },
              nextHref: '/campaign',
              nextPath: '/campaign',
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
        previewScope: 'publish',
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: 'en',
      },
    })

    expect(wrapper.text()).toContain('Current live page')
    expect(wrapper.text()).toContain('After publish')
    expect(wrapper.text()).toContain('Page address')
    expect(wrapper.text()).toContain('Page URL')
    expect(wrapper.text()).toContain('/campaign-old')
    expect(wrapper.text()).toContain('/campaign')
    expect(wrapper.text()).toContain('Search preview')
    expect(wrapper.text()).toContain('Old campaign title')
    expect(wrapper.text()).toContain('New campaign title')
    expect(wrapper.text()).toContain('Old campaign description')
    expect(wrapper.text()).toContain('New campaign description')
    expect(wrapper.text()).toContain('Website visibility')
    expect(wrapper.text()).toContain('Navigation')
    expect(wrapper.text()).toContain('Excluded')
    expect(wrapper.text()).toContain('Included')
    expect(wrapper.text()).not.toContain('Old campaign title -> New campaign title')
    expect(wrapper.text()).not.toContain('false -> true')
  })

  it('does not embed non-website publish preview URLs', () => {
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
              locale: 'en',
              nav: { after: true, before: false },
              nextHref: 'javascript:alert(1)',
              nextPath: null,
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
        previewScope: 'publish',
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: 'en',
      },
    })

    expect(wrapper.text()).not.toContain('Website preview')
    expect(wrapper.find('iframe').exists()).toBe(false)
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

    expect(wrapper.text()).toContain('Live website content')
    expect(wrapper.text()).toContain('No page URL is produced for this shared data collection.')
    expect(wrapper.text()).toContain('Shared data')
    expect(wrapper.text()).toContain('Issues blocking publish')
  })

  it('hides publish impact technical receipt unless diagnostics mode is enabled', () => {
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

    expect(wrapper.text()).not.toContain('Technical receipt')
    expect(wrapper.text()).not.toContain('entry:entry-1')
    expect(wrapper.text()).not.toContain('collection:docs')
    expect(wrapper.text()).not.toContain('entry.published')
  })

  it('can hide embedded publish impact when the editor page shows the preview summary', () => {
    const wrapper = mount(StudioEntryPublicWorkflowPanel, {
      global: { stubs: studioStubs() },
      props: {
        publicVisibility: baseVisibility,
        publishImpact: {
          ...idleImpact,
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
        showPublishImpactSummary: false,
      },
    })

    expect(wrapper.text()).toContain('Publish readiness')
    expect(wrapper.text()).toContain('What will change?')
    expect(wrapper.text()).not.toContain('Website changes')
    expect(wrapper.text()).not.toContain('Ready to publishReady to publish')
  })

  it('renders publish impact cache tags and events in diagnostics mode', () => {
    const restoreLocalStorage = installTestLocalStorage()
    try {
      window.history.replaceState(null, '', '/studio/docs/entry-1?diagnostics=1')
      localStorage.setItem('ginko-cms:studio:advanced-editor', 'true')
      // The composable's one-shot localStorage load may already have latched
      // earlier in this module; set the shared ref directly (legal while
      // ?diagnostics=1 is on) so this test is order-independent.
      useStudioAdvancedEditor().value = true
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

      expect(wrapper.text()).toContain('Technical receipt')
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

  it('gives array removal controls descriptive accessible names', () => {
    const wrapper = mount(FieldArray, {
      props: {
        field: {
          key: 'socials',
          type: 'array',
          required: false,
          description: null,
          fields: [
            { key: 'label', type: 'string', required: false },
            { key: 'to', type: 'string', required: false },
          ],
        },
        modelValue: [{ label: 'Website', to: 'https://example.com' }],
        label: 'Social links',
        fieldError: null,
      },
      global: { stubs: studioStubs() },
    })

    expect(wrapper.get('button[aria-label="Remove item 1"]').exists()).toBe(true)
  })

  it('keeps relation removal separate from the disclosure trigger and restores focus on Escape', async () => {
    const wrapper = mount(FieldRelations, {
      attachTo: document.body,
      props: {
        field: {
          key: 'related',
          type: 'relations',
          required: false,
          description: null,
          relation: { collectionId: 'articles' },
        },
        modelValue: ['stable-1'],
        locale: 'en',
        label: 'Related entries',
        fieldError: null,
      },
      global: { stubs: studioStubs() },
    })

    expect(wrapper.find('[role="button"] [role="button"]').exists()).toBe(false)
    expect(wrapper.find('button button').exists()).toBe(false)

    const trigger = wrapper.get('button[aria-controls="related-options"]')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#related-options').exists()).toBe(true)

    const search = wrapper.get('input[aria-label="Search entries..."]')
    search.element.focus()
    await search.trigger('keydown', { key: 'Escape' })
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger.element)

    const remove = wrapper.get('button[aria-label="Remove First entry"]')
    await remove.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[]])
    expect(trigger.attributes('aria-expanded')).toBe('false')

    wrapper.unmount()
  })

  it('passes automated accessibility checks for relation and array controls', async () => {
    const relations = mount(FieldRelations, {
      attachTo: document.body,
      props: {
        field: {
          key: 'related',
          type: 'relations',
          required: false,
          description: null,
          relation: { collectionId: 'articles' },
        },
        modelValue: ['stable-1'],
        locale: 'en',
        label: 'Related entries',
        fieldError: null,
      },
      global: { stubs: studioStubs() },
    })
    const array = mount(FieldArray, {
      attachTo: document.body,
      props: {
        field: {
          key: 'socials',
          type: 'array',
          required: false,
          description: null,
          fields: [
            { key: 'label', type: 'string', required: false },
            { key: 'to', type: 'string', required: false },
          ],
        },
        modelValue: [{ label: 'Website', to: 'https://example.com' }],
        label: 'Social links',
        fieldError: null,
      },
      global: { stubs: studioStubs() },
    })

    for (const wrapper of [relations, array]) {
      const result = await axe.run(wrapper.element, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(result.violations.map((violation) => violation.id)).toEqual([])
      wrapper.unmount()
    }
  })

  it.each([
    [
      'idle',
      false,
      { ...emptyRouteValidation, state: 'idle', message: '' },
      'Run validation to check site-wide URL and redirect conflicts.',
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

    expect(wrapper.text()).toContain('Missing language')
    expect(wrapper.text()).toContain('Missing URL')
    expect(wrapper.text()).toContain('Parent blocked')
    expect(wrapper.text()).toContain('Missing fields')
  })
})

describe('Studio destructive dialogs', () => {
  function fakeEditor(readinessState: string, hasConfirmation = false) {
    return {
      history: { entryAssets: [{ id: 'asset-1' }] },
      loader: {
        currentLocale: 'en',
        entry: { draftVersion: 7, publishedAt: 1, status: 'published' },
        entryId: 'entry-1',
        localeVariants: [{ locale: 'en' }],
        locales: [{ code: 'en' }],
        t: dictionaryT(en),
      },
      publishing: {
        confirmPublish: vi.fn(),
        publishMessage: '',
        publishMode: 'single',
        publishReadiness: {
          confirmationExpiresAt: hasConfirmation ? Date.now() + 60_000 : null,
          confirmationToken: hasConfirmation ? 'token' : null,
          locales: ['en'],
          message: `${readinessState} message`,
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

    expect(wrapper.text()).toContain('Preview website changes again before publishing.')
    expect(confirm.attributes('disabled')).toBeDefined()
  })

  it('renders backend readiness blockers as the primary publish dialog issue', () => {
    const readinessDetail = {
      ...baseReadinessDetail,
      locales: [
        {
          ...baseReadinessDetail.locales[0],
          blockers: [
            {
              code: 'route_parent_not_public',
              diagnosticId: null,
              fieldPath: null,
              locale: 'en',
              messageParams: {},
              severity: 'blocker',
            },
          ],
          canPublish: false,
          state: 'needs_work',
        },
      ],
    }
    const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor('blocked'), {
      readinessDetail,
      publishImpactRequested: true,
      publishReview,
      publicVisibility: baseVisibility,
    })

    expect(wrapper.text()).toContain('Parent page is not live in this language')
    expect(wrapper.text()).not.toContain('blocked message')
  })

  it.each(['ready'])('allows publish confirmation for %s readiness', (state) => {
    const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor(state, true), {
      readinessDetail: baseReadinessDetail,
      publishImpact: readyPublishImpact,
      publishImpactRequested: true,
      publishReview,
    })
    const buttons = wrapper.findAll('button')
    const confirm = buttons[buttons.length - 1]

    expect(wrapper.text()).toContain('No blocking issues')
    expect(wrapper.text()).toContain(
      'Review what will change on the website before this goes live.',
    )
    expect(confirm.attributes('disabled')).toBeUndefined()
  })

  it('summarizes website impact in the publish confirmation instead of raw fields', () => {
    const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor('ready', true), {
      readinessDetail: baseReadinessDetail,
      publishImpact: readyPublishImpact,
      publishImpactRequested: true,
      publishReview,
    })

    expect(wrapper.text()).toContain('Preview reviewed. Confirm to publish these website changes.')
    expect(wrapper.text()).toContain('Current live page')
    expect(wrapper.text()).toContain('/old-page')
    expect(wrapper.text()).toContain('After publish')
    expect(wrapper.text()).toContain('/hello')
    // Inclusion badges became one prose line, and the change-kind count
    // badges moved behind advanced details (design review S2).
    expect(wrapper.text()).toContain('Sitemap: included')
    expect(wrapper.text()).toContain('Search: included')
    expect(wrapper.text()).toContain('Navigation: included')
    expect(wrapper.text()).not.toContain('Page address 1')
    expect(wrapper.text()).not.toContain('Search preview 1')
    expect(wrapper.text()).not.toContain('Website visibility 1')
    expect(wrapper.text()).not.toContain('fields changed since last publish')
    expect(wrapper.text()).not.toContain('Meta title')
    expect(wrapper.text()).not.toContain('Public route')
  })
})

describe('Studio version history copy', () => {
  function historyEditor(previewVersionId: string | null = null) {
    return {
      history: {
        checkpointMessage: '',
        entryAssets: [],
        handleCreateCheckpoint: vi.fn(),
        previewVersionId,
        showCheckpointDialog: true,
        toggleVersionPreview: vi.fn(),
        versions: [
          {
            _id: 'version-1',
            action: 'checkpoint',
            createdAt: 1,
            createdBy: 'owner-1',
            displayAction: 'checkpoint',
            isCurrentPublished: false,
            message: 'Before campaign launch',
            publishedLocales: [],
            version: 3,
          },
        ],
      },
      loader: {
        dateLocale: 'en',
        t: (key: string) =>
          ({
            'ginkoCms.studio.collectionEditor.checkpointDialogDescription':
              'Save a named version of the current draft. You can restore it later.',
            'ginkoCms.studio.collectionEditor.checkpointDialogTitle': 'Save version',
            'ginkoCms.studio.collectionEditor.checkpointMessageLabel': 'Version note',
            'ginkoCms.studio.collectionEditor.checkpointMessagePlaceholder':
              'What should this version remember?',
            'ginkoCms.studio.collectionEditor.checkpointMessageRequired':
              'A version note is required.',
            'ginkoCms.studio.collectionEditor.confirmCheckpoint': 'Save version',
            'ginkoCms.studio.collectionEditor.createCheckpoint': 'Save version',
            'ginkoCms.studio.collectionEditor.versionArchived': 'Archived',
            'ginkoCms.studio.collectionEditor.versionCheckpoint': 'Saved version',
            'ginkoCms.studio.collectionEditor.versionPublished': 'Published',
            'ginkoCms.studio.collectionEditor.versionRestoredPublished': 'Restored version',
            'ginkoCms.studio.collectionEditor.versionUnpublished': 'Unpublished',
            'ginkoCms.studio.collectionEditor.versionRouteUpdated': 'URL updated',
          })[key] ?? key,
      },
    }
  }

  function routeUpdatedHistoryEditor() {
    const editor = historyEditor()
    editor.history.versions = [
      {
        _id: 'version-route',
        action: 'route_rebuild',
        createdAt: 2,
        createdBy: 'owner-1',
        displayAction: 'routeUpdated',
        isCurrentPublished: true,
        message: 'Updated public route after parent publish',
        publishedLocales: ['en'],
        version: 4,
      },
    ]
    return editor
  }

  it('uses save-version language as the primary history action', () => {
    const wrapper = mountWithStudioContext(StudioVersionHistoryCard, historyEditor())

    expect(wrapper.text()).toContain('Save version')
    expect(wrapper.text()).toContain('v3')
    expect(wrapper.text()).not.toContain('Checkpoint')
    expect(
      wrapper
        .get('button[aria-label="ginkoCms.studio.collectionEditor.versionDetailsAria"]')
        .attributes('aria-expanded'),
    ).toBe('false')
  })

  it('passes automated accessibility checks for version history', async () => {
    const wrapper = mountWithStudioContext(StudioVersionHistoryCard, historyEditor())
    const result = await axe.run(wrapper.element, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(result.violations.map((violation) => violation.id)).toEqual([])
    wrapper.unmount()
  })

  it('keeps raw revision ids in advanced details only', () => {
    const collapsed = mountWithStudioContext(StudioVersionHistoryCard, historyEditor())

    expect(collapsed.text()).not.toContain('version-1')
    expect(collapsed.text()).not.toContain('ginkoCms.studio.collectionEditor.versionRevisionId')

    const expanded = mountWithStudioContext(StudioVersionHistoryCard, historyEditor('version-1'))

    expect(expanded.text()).toContain('Advanced details')
    expect(expanded.text()).toContain('ginkoCms.studio.collectionEditor.versionRevisionId')
    expect(expanded.text()).toContain('version-1')
    expect(
      expanded
        .get('button[aria-label="ginkoCms.studio.collectionEditor.versionDetailsAria"]')
        .attributes('aria-expanded'),
    ).toBe('true')
  })

  it('lets users save a version without learning checkpoint terminology', () => {
    const wrapper = mountWithStudioContext(StudioCheckpointDialog, historyEditor())

    expect(wrapper.text()).toContain('Save version')
    expect(wrapper.text()).toContain('Version note')
    expect(wrapper.text()).not.toContain('checkpoint')
    expect(wrapper.text()).not.toContain('Checkpoint')
  })

  it('labels automatic descendant route rebuilds without calling them publishes', () => {
    const wrapper = mountWithStudioContext(StudioVersionHistoryCard, routeUpdatedHistoryEditor())

    expect(wrapper.text()).toContain('URL updated')
    expect(wrapper.text()).not.toContain('Published EN')
  })
})
