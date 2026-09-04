// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'

import StudioDuplicateEntryDialog from '../../packages/cms/studio-app/src/components/studio/editor/StudioDuplicateEntryDialog.vue'
import StudioEntryTopBar from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryTopBar.vue'
import { provideStudioEntryEditorContext } from '../../packages/cms/studio-app/src/composables/internal/studioEntryEditorContext'
import {
  duplicateSlugCandidate,
  duplicateTitleCandidate,
  isValidDuplicateSlug,
} from '../../packages/cms/studio-app/src/lib/duplicateEntry'

const mutationState = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: { ginkoCms: { editor: { duplicateEntry: 'duplicateEntry' } } },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => mutationState.execute,
}))

vi.mock('@public/utils/cmsErrors', () => ({
  getCmsErrorMessage: (_cause: unknown, fallback: string) => fallback,
}))

const messages: Record<string, string> = {
  'ginkoCms.studio.collectionEditor.duplicateAction': 'Duplicate entry',
  'ginkoCms.studio.collectionEditor.duplicateTitle': 'Duplicate entry',
  'ginkoCms.studio.collectionEditor.duplicateDescription': 'Create a separate draft.',
  'ginkoCms.studio.collectionEditor.duplicateCopyPolicy':
    'Draft fields, body, relations, and asset references are copied. Asset files are reused. Publication, reviews, history, and audit identity stay with the source.',
  'ginkoCms.studio.collectionEditor.duplicateSaveFirst': 'Save first.',
  'ginkoCms.studio.collectionEditor.duplicateNewTitle': 'New title',
  'ginkoCms.studio.collectionEditor.duplicateNewSlug': 'New slug',
  'ginkoCms.studio.collectionEditor.duplicateLocales': 'Locale drafts to copy',
  'ginkoCms.studio.collectionEditor.duplicateLocalesHelp': 'Select saved locales.',
  'ginkoCms.studio.collectionEditor.duplicateConfirm': 'Create duplicate draft',
  'ginkoCms.studio.collectionEditor.duplicateError': 'Failed to duplicate entry.',
  'ginkoCms.studio.collectionEditor.duplicateSingletonBlocked':
    'Singleton entries cannot be duplicated.',
  'ginkoCms.studio.collectionEditor.saveStateSaved': 'Saved',
  'ginkoCms.common.untitled': 'Untitled',
  'ginkoCms.common.draft': 'Draft',
  'ginkoCms.common.saveDraft': 'Save draft',
  'ginkoCms.studio.confirmDialog.cancel': 'Cancel',
}

function t(key: string) {
  return messages[key] ?? key
}

function editorFixture(
  overrides: {
    singleton?: boolean
    dirty?: boolean
    slugMode?: 'shared' | 'localized'
  } = {},
) {
  const push = vi.fn(async () => undefined)
  const save = vi.fn(async () => true)
  const refresh = vi.fn(async () => undefined)
  const titleField = { key: 'title', type: 'text', localized: true }
  return reactive({
    loader: {
      entry: {
        _id: 'source-entry',
        draftVersion: 7,
        status: 'draft',
        slug: 'reliability',
        baseSlug: 'reliability',
        data: { title: 'Reliability' },
        dirtyLocales: [],
        locales: [
          {
            locale: 'en',
            draftExists: true,
            draftSlug: 'reliability',
            draftPath: '/docs/reliability',
            draft: { values: { title: 'Reliability' }, bodyMdc: '# EN' },
            data: { title: 'Reliability' },
          },
          {
            locale: 'de',
            draftExists: true,
            draftSlug: 'zuverlaessigkeit',
            draftPath: '/dokumentation/zuverlaessigkeit',
            draft: { values: { title: 'Zuverlässigkeit' }, bodyMdc: '# DE' },
            data: { title: 'Zuverlässigkeit' },
          },
          {
            locale: 'fr',
            draftExists: false,
            draftSlug: null,
            draftPath: '/docs/reliability',
            draft: { values: {}, bodyMdc: '' },
            data: {},
          },
        ],
      },
      fields: [titleField],
      collectionConfig: {
        type: 'tree',
        routing: {
          mode: 'route',
          slugMode: overrides.slugMode ?? 'localized',
          singleton: overrides.singleton ?? false,
        },
        fields: [titleField],
        settings: {},
      },
      collection: 'docs',
      contentRoute: '/studio/content',
      currentLocale: 'en',
      defaultLocale: 'en',
      localeVariants: [
        { locale: 'en', published: false },
        { locale: 'de', published: false },
      ],
      canEditEntries: true,
      canPublishEntries: false,
      canArchiveEntries: false,
      canDeleteEntries: false,
      dateLocale: 'en',
      router: { push },
      refreshEntry: refresh,
      t,
    },
    draft: {
      isDirty: ref(overrides.dirty ?? false),
      saving: ref(false),
      saveState: ref('saved'),
      lastSaved: ref(null),
      dataFields: { title: 'Reliability' },
      handleSaveDraft: save,
      requestHydrate: vi.fn(),
    },
    publishing: {
      publishSession: { readiness: { state: 'ready' } },
      handlePublish: vi.fn(),
      handlePublishAll: vi.fn(),
      handleRestore: vi.fn(),
      handleUnpublish: vi.fn(),
      handleUnpublishAll: vi.fn(),
      handleArchive: vi.fn(),
      handlePermanentDelete: vi.fn(),
    },
    history: { showCheckpointDialog: false },
    __spies: { push, save, refresh },
  })
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, variant: String, size: String },
  emits: ['click'],
  template:
    '<button type="button" :disabled="disabled" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
})

const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String },
  emits: ['update:modelValue'],
  template:
    '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})

const CheckboxStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template:
    '<input type="checkbox" v-bind="$attrs" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
})

function dialogStubs() {
  return {
    Button: ButtonStub,
    Checkbox: CheckboxStub,
    Dialog: { template: '<div><slot /></div>' },
    DialogContent: { template: '<section><slot /></section>' },
    DialogDescription: { template: '<p><slot /></p>' },
    DialogFooter: { template: '<footer><slot /></footer>' },
    DialogHeader: { template: '<header><slot /></header>' },
    DialogTitle: { template: '<h2><slot /></h2>' },
    Input: InputStub,
    Label: { template: '<label><slot /></label>' },
    StudioNotice: {
      props: { description: String },
      template: '<div class="notice">{{ description }}</div>',
    },
  }
}

function mountWithEditor(
  component: typeof StudioDuplicateEntryDialog | typeof StudioEntryTopBar,
  editor: ReturnType<typeof editorFixture>,
  props: Record<string, unknown>,
  stubs: Record<string, unknown>,
) {
  const Harness = defineComponent({
    setup() {
      provideStudioEntryEditorContext(editor as never)
      return () => h(component, props)
    },
  })
  return mount(Harness, { global: { stubs } })
}

describe('Studio intentional duplication', () => {
  it('[CON-04] derives a visibly new title and valid route candidate', () => {
    expect(duplicateTitleCandidate('Reliability')).toBe('Reliability copy')
    expect(duplicateSlugCandidate('Reliability Notes')).toBe('reliability-notes-copy')
    expect(duplicateSlugCandidate('reliability-notes')).not.toBe('reliability-notes')
    expect(isValidDuplicateSlug('reliability-notes-copy')).toBe(true)
    expect(isValidDuplicateSlug('Reliability copy')).toBe(false)
  })

  it('[CON-04] submits only explicitly selected saved locales and opens the fresh draft', async () => {
    mutationState.execute.mockReset()
    mutationState.execute.mockResolvedValue({ entryId: 'duplicate-entry' })
    const editor = editorFixture()
    const wrapper = mountWithEditor(
      StudioDuplicateEntryDialog,
      editor,
      { open: true },
      dialogStubs(),
    )
    await nextTick()

    expect(wrapper.text()).toContain('Draft fields, body, relations, and asset references')
    expect(wrapper.text()).toContain('Asset files are reused')
    expect(wrapper.text()).toContain('Publication, reviews, history, and audit identity')
    expect(wrapper.find('#duplicate-locale-en').exists()).toBe(true)
    expect(wrapper.find('#duplicate-locale-de').exists()).toBe(true)
    expect(wrapper.find('#duplicate-locale-fr').exists()).toBe(false)
    await wrapper.find('#duplicate-locale-de').setValue(false)
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Create duplicate draft'))!
      .trigger('click')

    expect(mutationState.execute).toHaveBeenCalledWith({
      sourceEntryId: 'source-entry',
      expectedSourceDraftVersion: 7,
      variants: [{ locale: 'en', title: 'Reliability copy', slug: 'reliability-copy' }],
    })
    expect(editor.__spies.push).toHaveBeenCalledWith({
      path: '/studio/content/docs/duplicate-entry',
      query: {},
    })
    wrapper.unmount()
  })

  it('[CON-04] saves pending source edits before opening and disables singleton duplication', async () => {
    const editor = editorFixture({ dirty: true })
    const wrapper = mountWithEditor(
      StudioEntryTopBar,
      editor,
      { mode: 'edit' },
      {
        Button: ButtonStub,
        DropdownMenu: { template: '<div><slot /></div>' },
        DropdownMenuContent: { template: '<div><slot /></div>' },
        DropdownMenuItem: ButtonStub,
        DropdownMenuSeparator: { template: '<hr />' },
        DropdownMenuTrigger: { template: '<div><slot /></div>' },
        StudioDuplicateEntryDialog: {
          props: { open: Boolean },
          template: '<div data-testid="duplicate-dialog" :data-open="String(open)" />',
        },
        StudioNotice: { template: '<div><slot /></div>' },
        StudioStatusPill: { template: '<span />' },
      },
    )
    await nextTick()
    const action = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Duplicate entry'))!
    await action.trigger('click')
    await nextTick()

    expect(editor.__spies.save).toHaveBeenCalledOnce()
    expect(editor.__spies.refresh).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid="duplicate-dialog"]').attributes('data-open')).toBe('true')
    wrapper.unmount()

    const singleton = editorFixture({ singleton: true })
    const singletonWrapper = mountWithEditor(
      StudioEntryTopBar,
      singleton,
      { mode: 'edit' },
      {
        Button: ButtonStub,
        DropdownMenu: { template: '<div><slot /></div>' },
        DropdownMenuContent: { template: '<div><slot /></div>' },
        DropdownMenuItem: ButtonStub,
        DropdownMenuSeparator: { template: '<hr />' },
        DropdownMenuTrigger: { template: '<div><slot /></div>' },
        StudioDuplicateEntryDialog: { template: '<div />' },
        StudioNotice: { template: '<div><slot /></div>' },
        StudioStatusPill: { template: '<span />' },
      },
    )
    const disabledAction = singletonWrapper
      .findAll('button')
      .find((button) => button.text().includes('Duplicate entry'))!
    expect(disabledAction.attributes('disabled')).toBeDefined()
    expect(disabledAction.attributes('title')).toBe('Singleton entries cannot be duplicated.')
    singletonWrapper.unmount()
  })
})
