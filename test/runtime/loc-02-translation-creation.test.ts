// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, effectScope, ref } from 'vue'

import StudioCreateTranslationDialog from '../../packages/cms/studio-app/src/components/studio/editor/StudioCreateTranslationDialog.vue'
import { useEntryLocales } from '../../packages/cms/studio-app/src/composables/internal/useEntryLocales'

const mutationState = vi.hoisted(() => ({
  create: vi.fn(),
  refreshSecondary: vi.fn(async () => undefined),
}))

vi.mock('../../packages/cms/studio-app/src/boundary/api', () => ({
  api: {
    ginkoCms: {
      editor: {
        createLocaleVariant: 'createLocaleVariant',
        getEntry: 'getEntry',
      },
    },
  },
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => mutationState.create,
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', async () => {
  const { ref: vueRef } = await import('vue')
  return {
    useCmsStudioQuery: () => ({
      data: vueRef(null),
      refresh: mutationState.refreshSecondary,
    }),
  }
})

vi.mock('@public/utils/cmsErrors', () => ({
  getCmsErrorMessage: (_cause: unknown, fallback: string) => fallback,
}))

const messages: Record<string, string> = {
  'ginkoCms.studio.collectionEditor.createTranslationTitle': 'Add DE translation',
  'ginkoCms.studio.collectionEditor.createTranslationDescription':
    'Start blank or copy a translation.',
  'ginkoCms.studio.collectionEditor.translationStartingContent': 'Starting content',
  'ginkoCms.studio.collectionEditor.translationStartBlank': 'Start blank',
  'ginkoCms.studio.collectionEditor.translationStartBlankDescription': 'Create empty fields.',
  'ginkoCms.studio.collectionEditor.translationCopyExisting': 'Copy an existing translation',
  'ginkoCms.studio.collectionEditor.translationCopyExistingDescription': 'Copy localized fields.',
  'ginkoCms.studio.collectionEditor.translationSourceLocale': 'Copy from',
  'ginkoCms.studio.collectionEditor.translationSharedUnaffected':
    'Shared fields and public output are unchanged.',
  'ginkoCms.studio.collectionEditor.createTranslationConfirm': 'Add translation',
  'ginkoCms.studio.confirmDialog.cancel': 'Cancel',
}

function t(key: string) {
  return messages[key] ?? key
}

beforeEach(() => {
  localStorage.clear()
  mutationState.create.mockReset().mockResolvedValue('draft-id')
  mutationState.refreshSecondary.mockClear()
})

function localeFixture() {
  const push = vi.fn(async () => undefined)
  const save = vi.fn(async () => true)
  const refreshEntry = vi.fn(async () => undefined)
  const cancelAutoSave = vi.fn()
  const entry = ref({
    _id: 'entry-1',
    locale: 'en',
    slug: 'reliability',
    status: 'draft' as const,
    draftVersion: 1,
    dirtyLocales: [],
    data: { title: 'Reliability' },
  })
  const locales = ref([
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
    { code: 'fr', label: 'Français' },
  ])
  const localeVariants = ref([
    { locale: 'en', draftExists: true },
    { locale: 'de', draftExists: false },
    { locale: 'fr', draftExists: false },
  ])
  const saving = ref(false)
  const error = ref('')
  const dirty = ref(false)
  const scope = effectScope()
  const subject = scope.run(() =>
    useEntryLocales({
      entry,
      entryId: ref('entry-1'),
      collection: ref('docs'),
      contentRoute: '/studio/content',
      router: { push } as never,
      collectionConfig: ref(null),
      locales,
      localeVariants,
      currentLocale: ref('en'),
      defaultLocale: ref('en'),
      localizedFields: ref([]),
      canEditEntries: ref(true),
      saving,
      error,
      isDirty: dirty,
      form: { slug: 'reliability' },
      handleSaveDraft: save,
      cancelAutoSave,
      refreshEntry,
      t,
    }),
  )!
  return {
    subject,
    scope,
    dirty,
    localeVariants,
    push,
    save,
    refreshEntry,
    cancelAutoSave,
  }
}

describe('missing translation workflow', () => {
  it('[LOC-02] never creates a locale by selecting it and sends the explicit blank or chosen copy source only after confirmation', async () => {
    const fixture = localeFixture()
    try {
      await fixture.subject.handleSwitchLocale('de')
      expect(fixture.push).toHaveBeenCalledWith({
        path: '/studio/content/docs/entry-1',
        query: { locale: 'de' },
      })
      expect(mutationState.create).not.toHaveBeenCalled()

      await fixture.subject.handleSelectSecondaryLocale('fr')
      expect(fixture.subject.secondaryLocale.value).toBe('fr')
      expect(mutationState.create).not.toHaveBeenCalled()

      fixture.dirty.value = true
      fixture.subject.beginLocaleCreation('de')
      expect(fixture.subject.localeCreationOpen.value).toBe(true)
      expect(fixture.subject.existingLocaleOptions.value.map((locale) => locale.code)).toEqual([
        'en',
      ])
      await expect(fixture.subject.confirmLocaleCreation({ kind: 'blank' })).resolves.toBe(true)
      expect(fixture.cancelAutoSave).toHaveBeenCalledOnce()
      expect(fixture.save).toHaveBeenCalledWith(true)
      expect(mutationState.create).toHaveBeenLastCalledWith({
        entryId: 'entry-1',
        locale: 'de',
        source: { kind: 'blank' },
      })
      expect(fixture.refreshEntry).toHaveBeenCalledOnce()

      fixture.dirty.value = false
      fixture.localeVariants.value = [
        { locale: 'en', draftExists: true },
        { locale: 'de', draftExists: true },
        { locale: 'fr', draftExists: false },
      ]
      fixture.subject.beginLocaleCreation('fr')
      expect(fixture.subject.existingLocaleOptions.value.map((locale) => locale.code)).toEqual([
        'en',
        'de',
      ])
      await expect(
        fixture.subject.confirmLocaleCreation({ kind: 'locale', locale: 'de' }),
      ).resolves.toBe(true)
      expect(mutationState.create).toHaveBeenLastCalledWith({
        entryId: 'entry-1',
        locale: 'fr',
        source: { kind: 'locale', locale: 'de' },
      })
      expect(mutationState.refreshSecondary).toHaveBeenCalledOnce()
    } finally {
      fixture.scope.stop()
    }
  })

  it('[LOC-02] presents an accessible intentional blank-or-copy choice and emits the selected source', async () => {
    const passthrough = defineComponent({ template: '<div><slot /></div>' })
    const button = defineComponent({
      inheritAttrs: false,
      props: { disabled: Boolean },
      emits: ['click'],
      template:
        '<button type="button" :disabled="disabled" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
    })
    const wrapper = mount(StudioCreateTranslationDialog, {
      props: {
        open: true,
        targetLocale: 'de',
        sourceLocales: [
          { code: 'en', label: 'English' },
          { code: 'fr', label: 'Français' },
        ],
        busy: false,
      },
      global: {
        stubs: {
          Dialog: passthrough,
          DialogContent: passthrough,
          DialogHeader: passthrough,
          DialogTitle: defineComponent({ template: '<h2><slot /></h2>' }),
          DialogDescription: defineComponent({ template: '<p><slot /></p>' }),
          DialogFooter: passthrough,
          StudioNotice: defineComponent({
            props: { description: String },
            template: '<p>{{ description }}</p>',
          }),
          Button: button,
          Label: defineComponent({ template: '<label v-bind="$attrs"><slot /></label>' }),
        },
      },
    })

    expect(wrapper.get('fieldset').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('legend').text()).toBe('Starting content')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Start blank')
    expect(wrapper.text()).toContain('Copy an existing translation')
    expect(wrapper.text()).toContain(
      'Shared fields, existing language drafts, reviews, history, and public output are not changed.',
    )

    const submit = wrapper
      .findAll('button')
      .find((candidate) => candidate.text().includes('Add translation'))!
    await submit.trigger('click')
    expect(wrapper.emitted('confirm')?.at(-1)).toEqual([{ kind: 'blank' }])

    await wrapper.get('input[value="locale"]').setValue(true)
    await wrapper.get('select').setValue('fr')
    await submit.trigger('click')
    expect(wrapper.emitted('confirm')?.at(-1)).toEqual([{ kind: 'locale', locale: 'fr' }])
  })
})
