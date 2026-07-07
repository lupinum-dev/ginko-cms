// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
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
import StudioSharedFieldsPanel from '../../packages/cms/studio-app/src/components/studio/editor/StudioSharedFieldsPanel.vue'
import StudioVersionHistoryCard from '../../packages/cms/studio-app/src/components/studio/editor/StudioVersionHistoryCard.vue'
import FieldArray from '../../packages/cms/studio-app/src/components/studio/fields/FieldArray.vue'
import FieldBlocks from '../../packages/cms/studio-app/src/components/studio/fields/FieldBlocks.vue'
import FieldObject from '../../packages/cms/studio-app/src/components/studio/fields/FieldObject.vue'
import FieldRichtext from '../../packages/cms/studio-app/src/components/studio/fields/FieldRichtext.vue'
import StudioEmptyState from '../../packages/cms/studio-app/src/components/studio/StudioEmptyState.vue'
import StudioListFrame from '../../packages/cms/studio-app/src/components/studio/StudioListFrame.vue'
import StudioNotice from '../../packages/cms/studio-app/src/components/studio/StudioNotice.vue'
import StudioSegmentedControl from '../../packages/cms/studio-app/src/components/studio/StudioSegmentedControl.vue'
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
      template: '<details><summary>{{ title || "Developer details" }}</summary><slot /></details>',
    },
    StudioInspectorSection: {
      props: { title: String },
      template: '<section><h2>{{ title }}</h2><slot name="action" /><slot /></section>',
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
    const wrapper = mountSharedFieldsPanel()

    expect(wrapper.text()).toContain('Shared properties')
    expect(wrapper.text()).toContain('Applies to all languages')
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

  it('shows stale publish impact without a confirmable preview hash', () => {
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
        publishReview: { ...publishReview, previewHash: null, stale: true, state: 'stale' },
        previewScope: 'publish',
        routeValidationRequested: false,
        routeValidationState: emptyRouteValidation,
        selectedPublishImpactLocale: null,
      },
    })

    expect(wrapper.text()).toContain('Website changes preview is stale')
    expect(wrapper.text()).not.toContain('Preview preview-hash')
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

    expect(wrapper.text()).toContain('Needs work')
    expect(wrapper.text()).toContain('EN: Required translation field is missing: title')
    expect(wrapper.text()).not.toContain('No blocking issues')
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
  function fakeEditor(readinessState: string, previewHash: string | null = null) {
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
    const wrapper = mountWithStudioContext(StudioPublishDialog, fakeEditor(state, 'hash'), {
      readinessDetail: baseReadinessDetail,
    })
    const buttons = wrapper.findAll('button')
    const confirm = buttons[buttons.length - 1]

    expect(wrapper.text()).toContain('No blocking issues')
    expect(wrapper.text()).toContain(
      'Review what will change on the website before this goes live.',
    )
    expect(confirm.attributes('disabled')).toBeUndefined()
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
  })

  it('keeps raw revision ids in developer details only', () => {
    const collapsed = mountWithStudioContext(StudioVersionHistoryCard, historyEditor())

    expect(collapsed.text()).not.toContain('version-1')
    expect(collapsed.text()).not.toContain('Revision ID')

    const expanded = mountWithStudioContext(StudioVersionHistoryCard, historyEditor('version-1'))

    expect(expanded.text()).toContain('Developer details')
    expect(expanded.text()).toContain('Revision ID')
    expect(expanded.text()).toContain('version-1')
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
