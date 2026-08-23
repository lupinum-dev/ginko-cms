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
import StudioEntryTopBar from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryTopBar.vue'
import StudioEntryTranslationReadinessPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryTranslationReadinessPanel.vue'
import StudioLocaleEditorPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioLocaleEditorPanel.vue'
import StudioPublishDialog from '../../packages/cms/studio-app/src/components/studio/editor/StudioPublishDialog.vue'
import StudioPublishOutcomeCard from '../../packages/cms/studio-app/src/components/studio/editor/StudioPublishOutcomeCard.vue'
import StudioSharedFieldsPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioSharedFieldsPanel.vue'
import StudioVersionDiffList from '../../packages/cms/studio-app/src/components/studio/editor/StudioVersionDiffList.vue'
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
import { provideStudioEntryEditorContext } from '../../packages/cms/studio-app/src/composables/internal/studioEntryEditorContext'
import { useStudioAdvancedEditor } from '../../packages/cms/studio-app/src/composables/useStudioAdvancedEditor'

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
    canLoadMore: ref(false),
    data: ref([
      {
        _id: 'entry-1',
        slug: 'first-entry',
        stableId: 'stable-1',
        title: 'First entry',
      },
    ]),
    status: ref('exhausted'),
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
    DropdownMenuContent: {
      props: { side: String },
      template: '<div :data-side="side"><slot /></div>',
    },
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
      props: { title: 'Operations', loading: true },
    })
    const empty = mount(StudioListFrame, {
      global: { stubs: studioStubs() },
      props: { title: 'Operations', empty: true },
      slots: { empty: '<p>No imports</p>' },
    })
    const loaded = mount(StudioListFrame, {
      global: { stubs: studioStubs() },
      props: { title: 'Operations', count: 2 },
      slots: { default: '<div>Run 1</div>' },
    })

    expect(loading.text()).toContain('Operations')
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
    'ginkoCms.studio.collectionsPage.codeDefinedBadge': 'Managed by developers',
    'ginkoCms.studio.collectionsPage.supportedLocales': 'Supported locales',
    'ginkoCms.studio.collectionsPage.fieldsCount': `${params?.count ?? 0} fields`,
    'ginkoCms.studio.collectionsPage.widthHalfLabel': 'half width',
    'ginkoCms.studio.collectionsPage.noFields': 'No fields defined yet.',
    'ginkoCms.studio.collectionContract.createsWebsitePages': 'Creates website pages',
    'ginkoCms.studio.collectionContract.sharedContent': 'Shared content',
    'ginkoCms.studio.collectionContract.routeModeDescription':
      'Creates public pages with localized routes, visibility diagnostics, sitemap/search/nav participation, SEO, and website-change checks.',
    'ginkoCms.studio.collectionContract.dataModeDescription':
      'Stores structured content for lists, relations, single-entry content, and site-wide content without page routes.',
    'ginkoCms.studio.collectionContract.pageControlsHidden':
      'Page controls are hidden for shared-content types. Sitemap, search, navigation, and route diagnostics do not apply until this content type creates website pages.',
    'ginkoCms.studio.collectionContract.outOfDatePrefix': 'Out-of-date URL prefix:',
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
      defaultLocale: 'en',
      dateLocale: 'en',
      locales: [
        { code: 'en', label: 'English' },
        { code: 'de', label: 'Deutsch' },
      ],
      entry: { publishedAt: '2026-05-21T12:52:50.899Z' },
      localizedFields: [{ key: 'title', label: 'Title', type: 'text', localized: true }],
      // Writing-surface split (W4): the hero absorbs title/description, the
      // generic loop renders the remaining detail fields.
      heroTitleField: { key: 'title', label: 'Title', type: 'text', localized: true },
      heroDescriptionField: null,
      localizedDetailFields: [],
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
      handleSwitchLocale: vi.fn(),
      secondaryAssetContext: {},
      secondaryDataFields: { title: 'Sicherheitsverbesserungen' },
      secondaryEditorContext: {},
      secondaryLocale: 'de',
    },
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

  const wrapper = mount(Host, {
    global: {
      stubs: studioStubs(),
    },
  })
  return { editor, wrapper }
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
      heroTitleField: null,
      heroDescriptionField: null,
      sharedDetailFields: [
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
    expect(multilingual.text()).toContain('ginkoCms.studio.collectionEditor.appliesToAllLanguages')

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
    const { wrapper } = mountLocalePanelComparison()
    const urlRows = wrapper.findAll('.studio-locale-panel__localized-url')

    expect(urlRows).toHaveLength(2)
    expect(urlRows[0]?.text()).toContain('This URL slug belongs to EN only.')
    expect((urlRows[1]?.find('input').element as HTMLInputElement).value).toBe('Managed in EN')
    expect(urlRows[1]?.text()).toContain('URL managed in EN.')
    expect(wrapper.text()).toContain('Title')
  })

  it('[LOC-03] keeps the comparison language read only until it becomes the editing target', async () => {
    const { editor, wrapper } = mountLocalePanelComparison()
    const panels = wrapper.findAll('section.studio-locale-panel')

    expect(panels).toHaveLength(2)
    expect(panels[0]!.text()).toContain('Editing')
    expect(panels[1]!.text()).toContain('Read only')
    expect(panels[1]!.text()).toContain('This language stays read only')
    expect(
      panels[1]!
        .findAll('input, textarea, select, button[contenteditable="true"]')
        .filter((control) => control.attributes('disabled') === undefined),
    ).toHaveLength(0)

    const editButton = panels[1]!
      .findAll('button')
      .find((button) => button.text().includes('Edit DE'))
    expect(editButton).toBeTruthy()
    await editButton!.trigger('click')

    expect(editor.locales.handleSwitchLocale).toHaveBeenCalledWith('de')
    expect(wrapper.text()).not.toContain('Save translation draft')
  })

  it('[ADM-03] renders the code-defined model with route, locale, public capability, and advanced contract details', () => {
    const wrapper = mountCollectionContractSection()

    expect(wrapper.text()).toContain('Content type details')
    expect(wrapper.text()).toContain('Managed by developers')
    expect(wrapper.text()).toContain('Creates website pages')
    // The capability chip row is gone (design review S3) — the explainer
    // sentence carries the capabilities in prose instead.
    expect(wrapper.text()).not.toContain('Page routes')
    expect(wrapper.text()).toContain('sitemap/search/nav')
    expect(wrapper.text()).toContain('contract-v1')
    expect(wrapper.text()).not.toContain('batch')
  })

  it('[ADM-03] renders shared-content fields without unsupported model editing controls', () => {
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
    // Capability chips removed (design review S3); the mode sentence stays.
    expect(wrapper.text()).toContain('lists, relations, single-entry content')
    expect(wrapper.text()).toContain('Page controls are hidden')
    expect(wrapper.text()).toContain('Out-of-date URL prefix')
    expect(wrapper.text()).toContain('/authors')
    expect(wrapper.text()).not.toContain('URL settings')
  })

  it('[ADM-03] shows a missing installed contract honestly without persisted projection state', () => {
    const wrapper = mountCollectionContractSection({
      collectionDetail: null,
    })

    expect(wrapper.text()).toContain('unknown')
    expect(wrapper.text()).toContain('not synced')
    expect(wrapper.text()).not.toContain('batch')
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
    // The spine only renders behind the "More details" preference (design
    // review S2); it is a plain persisted toggle now.
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
      translationReadiness: [],
    })

    expect(wrapper.text()).toContain('Publishing flow')
    expect(wrapper.text()).toContain('Website changes are ready to review.')
    expect(wrapper.text()).toContain('Prepared')
    expect(wrapper.text()).toContain('Reviewed')
    expect(wrapper.text()).toContain('Publish the approved website changes.')

    advanced.value = false
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
      translationReadiness: [],
    })

    expect(wrapper.text()).toContain('Track live website')
    // The redesigned track card states the live fact once via Status: Live
    // (say-it-once); the former "Live now" pill was removed deliberately.
    expect(wrapper.text()).toContain('Status')
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
        selectedPublishImpactLocale: 'de',
      },
    })

    expect(wrapper.text()).toContain('Read-only publish check')
    expect(wrapper.text()).toContain('It does not confirm the header Publish action.')
    expect(wrapper.text()).not.toContain('Preview preview-hash')
  })

  it('renders a visual website preview from publish impact URLs', () => {
    // EDT-10: the rendered preview link opens the guarded DRAFT preview route
    // (host convention /preview/[collection]/[entryId]?locale=…), never the
    // prospective live URL, and the preview opens in a new tab (no iframe).
    const editor = railEditor()
    const wrapper = mountWithStudioContext(
      StudioEntryPublicWorkflowPanel,
      {
        ...editor,
        loader: { ...editor.loader, collection: 'posts' },
        workflow: { draftPreviewOpened: false, markDraftPreviewOpened: vi.fn() },
      },
      {
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
        selectedPublishImpactLocale: 'de',
      },
    )

    expect(wrapper.text()).toContain('Website preview')
    expect(wrapper.text()).toContain('Preview draft')
    expect(wrapper.text()).toContain('Open live page')
    expect(wrapper.text()).toContain('/de/hallo')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual(
      expect.arrayContaining(['/de/alt', '/preview/posts/entry-1?locale=de']),
    )
    // The prospective live URL is shown as text but never offered as the
    // preview link for unpublished content.
    expect(wrapper.find('a[href="/de/hallo"]').exists()).toBe(false)
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

  it('loads paged descendant URL impact through the canonical publish session', async () => {
    const loadMorePublishImpact = vi.fn()
    const editor = railEditor(dictionaryT(en))
    const wrapper = mountWithStudioContext(
      StudioEntryPublicWorkflowPanel,
      {
        ...editor,
        loader: { ...editor.loader, collection: 'pages' },
        workflow: { loadMorePublishImpact },
      },
      {
        publicVisibility: baseVisibility,
        publishImpact: {
          ...readyPublishImpact,
          locales: [
            {
              ...readyPublishImpact.locales[0],
              routeImpact: {
                total: null,
                listed: 25,
                hasMore: true,
                continueCursor: 'next-page',
                routeGeneration: 7,
                impactHash: 'routes:fixture',
                loading: false,
                error: null,
              },
            },
          ],
        },
        publishImpactRequested: true,
        publishReview,
        previewScope: 'publish',
        selectedPublishImpactLocale: 'en',
      },
    )

    expect(wrapper.text()).toContain('Showing 25 of 25+ affected child-page URLs.')
    const loadMore = wrapper.findAll('button').find((button) => button.text() === 'Load more')
    expect(loadMore).toBeTruthy()
    await loadMore!.trigger('click')
    expect(loadMorePublishImpact).toHaveBeenCalledWith('en')
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
      localStorage.setItem('ginko-cms:studio:advanced-editor', 'true')
      // The composable's one-shot localStorage load may already have latched
      // earlier in this module; set the shared ref directly so this test is
      // order-independent.
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
          selectedPublishImpactLocale: null,
        },
      })

      expect(wrapper.text()).toContain('Technical receipt')
      expect(wrapper.text()).toContain('entry:entry-1')
      expect(wrapper.text()).toContain('collection:docs')
      expect(wrapper.text()).toContain('entry.published')
    } finally {
      // The preference is a plain shared ref now — reset it so later tests
      // in this module see the default-off state.
      useStudioAdvancedEditor().value = false
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
          relation: { collection: 'articles' },
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
          relation: { collection: 'articles' },
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
  function fakeEditor(readinessState: string, hasConfirmation = false, draftPreviewOpened = false) {
    return {
      history: { entryAssets: [{ id: 'asset-1' }] },
      loader: {
        collection: 'posts',
        currentLocale: 'en',
        entry: { draftVersion: 7, publishedAt: 1, status: 'published' },
        entryId: 'entry-1',
        localeVariants: [{ locale: 'en' }],
        locales: [{ code: 'en' }],
        t: dictionaryT(en),
      },
      workflow: { markDraftPreviewOpened: vi.fn() },
      publishing: {
        confirmPublish: vi.fn(),
        publishSession: {
          open: true,
          mode: 'single',
          message: '',
          preview: null,
          impactRequested: true,
          impactLocale: null,
          impactStale: false,
          draftPreviewOpened,
          concurrentEdit: false,
          outcome: null,
          readiness: {
            confirmationExpiresAt: hasConfirmation ? Date.now() + 60_000 : null,
            confirmationToken: hasConfirmation ? 'token' : null,
            locales: ['en'],
            message: `${readinessState} message`,
            state: readinessState,
          },
        },
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

  it('[EDT-10] claims a reviewed private draft preview only after the preview was opened', () => {
    const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor('ready', true), {
      readinessDetail: baseReadinessDetail,
      publishImpact: readyPublishImpact,
      publishImpactRequested: true,
      publishReview,
    })

    expect(wrapper.text()).not.toContain('Preview reviewed.')
    expect(wrapper.text()).toContain(
      'You have not opened the draft preview yet. Check the page before publishing.',
    )
    expect(wrapper.find('a[href="/preview/posts/entry-1?locale=en"]').exists()).toBe(true)
  })

  it('summarizes website impact in the publish confirmation instead of raw fields', () => {
    const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor('ready', true, true), {
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

  it('labels an unfinished descendant traversal as a lower bound in publish counts', () => {
    const advanced = useStudioAdvancedEditor()
    advanced.value = true
    try {
      const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor('ready', true, true), {
        readinessDetail: baseReadinessDetail,
        publishImpact: {
          ...readyPublishImpact,
          locales: [
            {
              ...readyPublishImpact.locales[0],
              routeImpact: {
                total: null,
                listed: 25,
                hasMore: true,
                continueCursor: 'next-page',
                routeGeneration: 7,
                impactHash: 'routes:fixture',
                loading: false,
                error: null,
              },
            },
          ],
        },
        publishImpactRequested: true,
        publishReview,
      })

      expect(wrapper.text()).toContain('25+ child-page URLs will change.')
      expect(wrapper.text()).toMatch(/Page address\s+26\+/)
    } finally {
      advanced.value = false
    }
  })
})

describe('Studio version history copy', () => {
  function historyEditor(previewVersionId: string | null = null) {
    return {
      draft: { saving: false },
      history: {
        checkpointMessage: '',
        diffLeftVersionId: null as string | null,
        entryAssets: [],
        handleCreateCheckpoint: vi.fn(),
        handleRollback: vi.fn(),
        previewVersionId,
        showCheckpointDialog: true,
        toggleDiff: vi.fn(),
        toggleVersionPreview: vi.fn(),
        versionDiff: null,
        versionDiffPending: false,
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
        canEditEntries: false,
        canPublishEntries: false,
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

  it('[LIF-04] uses editorial save-version language and accessible actions in history', () => {
    const wrapper = mountWithStudioContext(StudioVersionHistoryCard, historyEditor())

    expect(wrapper.text()).toContain('Save version')
    expect(wrapper.text()).toContain('v3')
    expect(wrapper.text()).not.toContain('Checkpoint')
    expect(
      wrapper
        .find('button[aria-label="ginkoCms.studio.collectionEditor.versionActionsAria"]')
        .exists(),
    ).toBe(true)
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
    expect(expanded.get('button[aria-expanded]').attributes('aria-expanded')).toBe('true')
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

  function actionableHistoryEditor() {
    const editor = historyEditor()
    editor.loader.canEditEntries = true
    editor.loader.canPublishEntries = true
    editor.loader.t = dictionaryT(en)
    editor.history.versions = [
      {
        _id: 'version-2',
        action: 'publish',
        createdAt: 2,
        createdBy: 'owner-1',
        displayAction: 'published',
        isCurrentPublished: true,
        message: 'Campaign launch',
        publishedLocales: ['en'],
        version: 4,
      },
      ...editor.history.versions,
    ]
    return editor
  }

  it('offers compare and restore actions on historical versions', async () => {
    const editor = actionableHistoryEditor()
    const wrapper = mountWithStudioContext(StudioVersionHistoryCard, editor)

    // Compare is only offered against the current version, so the latest row
    // has none and there is exactly one compare action for the older version.
    const compareButtons = wrapper
      .findAll('button')
      .filter((button) => button.text().trim() === 'Compare with current version')
    expect(compareButtons).toHaveLength(1)
    await compareButtons[0].trigger('click')
    expect(editor.history.toggleDiff).toHaveBeenCalledWith('version-1')

    const restoreDraft = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Restore as draft')
    await restoreDraft!.trigger('click')
    expect(editor.history.handleRollback).toHaveBeenCalledWith('version-2')

    const restorePublish = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Restore and publish')
    await restorePublish!.trigger('click')
    expect(editor.history.handleRollback).toHaveBeenCalledWith('version-2', true)
  })

  it('opens history actions above the bottom-anchored inspector rows', () => {
    const wrapper = mountWithStudioContext(StudioVersionHistoryCard, actionableHistoryEditor())

    expect(wrapper.findAll('[data-side="top"]')).toHaveLength(2)
  })

  it('gates restore actions by permissions', () => {
    const publisherless = actionableHistoryEditor()
    publisherless.loader.canPublishEntries = false
    const wrapper = mountWithStudioContext(StudioVersionHistoryCard, publisherless)
    expect(wrapper.text()).toContain('Restore as draft')
    expect(wrapper.text()).not.toContain('Restore and publish')

    const viewer = actionableHistoryEditor()
    viewer.loader.canEditEntries = false
    viewer.loader.canPublishEntries = false
    const viewerWrapper = mountWithStudioContext(StudioVersionHistoryCard, viewer)
    expect(viewerWrapper.text()).not.toContain('Restore as draft')
    expect(viewerWrapper.text()).not.toContain('Restore and publish')
  })

  it('collapses long histories to five versions with a show-all toggle', async () => {
    const editor = actionableHistoryEditor()
    editor.history.versions = Array.from({ length: 7 }, (_, index) => ({
      _id: `version-${7 - index}`,
      action: 'checkpoint',
      createdAt: 7 - index,
      createdBy: 'owner-1',
      displayAction: 'checkpoint',
      isCurrentPublished: false,
      message: '',
      publishedLocales: [] as string[],
      version: 7 - index,
    }))
    const wrapper = mountWithStudioContext(StudioVersionHistoryCard, editor)

    expect(wrapper.text()).toContain('v7')
    expect(wrapper.text()).toContain('v3')
    expect(wrapper.text()).not.toContain('v2')
    const showAll = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Show all 7 versions')
    expect(showAll).toBeDefined()
    await showAll!.trigger('click')
    expect(wrapper.text()).toContain('v1')
    expect(wrapper.text()).toContain('Show fewer versions')
  })
})

describe('Studio version diff list', () => {
  function diffEditor(overrides: Record<string, unknown> = {}) {
    return {
      history: {
        versionDiff: {
          changes: [
            { field: 'locale.en.values.title', left: 'Old title', right: 'New title' },
            { field: 'shared.baseSlug', left: null, right: 'hello-page' },
            { field: 'locale.de.values.title', left: 'Alter Titel', right: '' },
          ],
          leftVersionId: 'version-1',
          rightVersionId: 'version-2',
        },
        versionDiffPending: false,
        ...overrides,
      },
      loader: {
        fields: [{ key: 'title', label: 'Title', localized: true }],
        locales: [
          { code: 'en', label: 'English' },
          { code: 'de', label: 'Deutsch' },
        ],
        t: dictionaryT(en),
      },
    }
  }

  it('[LIF-05] compares versions with explicit field, locale, added, removed, and changed semantics beyond color', () => {
    const wrapper = mountWithStudioContext(StudioVersionDiffList, diffEditor())

    expect(wrapper.text()).toContain('Compared with the current version')
    expect(wrapper.text()).toContain('Title · English')
    expect(wrapper.text()).toContain('Title · Deutsch')
    expect(wrapper.text()).toContain('URL slug')
    expect(wrapper.text()).toContain('Changed')
    expect(wrapper.text()).toContain('Added')
    expect(wrapper.text()).toContain('Removed')
    expect(wrapper.text()).toContain('This version')
    expect(wrapper.text()).toContain('Current version')
    expect(wrapper.text()).toContain('Old title')
    expect(wrapper.text()).toContain('New title')
  })

  it('shows a calm empty state when versions match', () => {
    const wrapper = mountWithStudioContext(
      StudioVersionDiffList,
      diffEditor({ versionDiff: { changes: [], leftVersionId: 'a', rightVersionId: 'b' } }),
    )

    expect(wrapper.text()).toContain('This version matches the current version.')
  })

  it('shows a loading message while the comparison resolves', () => {
    const wrapper = mountWithStudioContext(
      StudioVersionDiffList,
      diffEditor({ versionDiff: null, versionDiffPending: true }),
    )

    expect(wrapper.text()).toContain('Comparing versions…')
  })
})

describe('Studio entry top bar restore action', () => {
  function topBarEditor(status: 'draft' | 'published' | 'archived') {
    return reactive({
      draft: {
        dataFields: {},
        handleSaveDraft: vi.fn(),
        lastSaved: null,
        saveState: 'saved',
        saving: false,
      },
      history: { showCheckpointDialog: false },
      loader: {
        canArchiveEntries: true,
        canEditEntries: true,
        canPublishEntries: true,
        collectionConfig: { settings: {} },
        currentLocale: 'en',
        dateLocale: 'en',
        entry: { status },
        fields: [],
        localeVariants: [{ locale: 'en' }],
        t: dictionaryT(en),
      },
      publishing: {
        handleArchive: vi.fn(),
        handlePublish: vi.fn(),
        handlePublishAll: vi.fn(),
        handleRestore: vi.fn(),
        handleUnpublish: vi.fn(),
        publishSession: { readiness: { state: 'not_previewed' } },
      },
    })
  }

  function menuLabels(wrapper: ReturnType<typeof mountWithStudioContext>) {
    return wrapper.findAll('button').map((button) => button.text().trim())
  }

  it('offers restore instead of archive for archived entries', async () => {
    const editor = topBarEditor('archived')
    const wrapper = mountWithStudioContext(StudioEntryTopBar, editor)

    const labels = menuLabels(wrapper)
    expect(labels).toContain('Restore draft')
    expect(labels).not.toContain('Archive')

    const restoreItem = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Restore draft')
    await restoreItem?.trigger('click')
    expect(editor.publishing.handleRestore).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('offers archive but not restore for non-archived entries', () => {
    const draft = mountWithStudioContext(StudioEntryTopBar, topBarEditor('draft'))
    expect(menuLabels(draft)).toContain('Archive')
    expect(menuLabels(draft)).not.toContain('Restore draft')
    draft.unmount()

    const published = mountWithStudioContext(StudioEntryTopBar, topBarEditor('published'))
    expect(menuLabels(published)).toContain('Archive')
    expect(menuLabels(published)).not.toContain('Restore draft')
    published.unmount()
  })

  it('exposes the locale-independent save state for automation and assistive diagnostics', () => {
    const wrapper = mountWithStudioContext(StudioEntryTopBar, topBarEditor('draft'))
    expect(wrapper.find('.studio-entry-topbar__save-indicator').attributes('data-save-state')).toBe(
      'saved',
    )
    wrapper.unmount()
  })
})
