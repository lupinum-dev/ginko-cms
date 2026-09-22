// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'

import StudioEntryTopBar from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryTopBar.vue'
import { provideStudioEntryEditorContext } from '../../packages/cms/studio-app/src/composables/internal/studioEntryEditorContext'
import { useCmsI18n } from '../../packages/cms/studio-app/src/composables/useCmsI18n'
vi.mock('../../packages/cms/studio-app/src/composables/useCmsConfig', () => ({
  useCmsConfig: () => ({ preview: { route: '/preview' } }),
}))

function setup(publisher = true) {
  const editor = reactive({
    loader: {
      collection: 'landing',
      entryId: 'entry1',
      currentLocale: 'en',
      dateLocale: 'en',
      entry: { status: 'draft' },
      fields: [],
      locales: [{ code: 'en', label: 'English' }],
      localeVariants: [{ locale: 'en' }],
      collectionConfig: {},
      canEditEntries: true,
      canPublishEntries: publisher,
      canArchiveEntries: false,
      canDeleteEntries: false,
      t: useCmsI18n().t,
    },
    draft: {
      dataFields: {},
      saving: false,
      saveState: 'saved',
      conflicts: [],
      handleSaveDraft: vi.fn(async () => false),
      isDirty: false,
    },
    history: {},
    publishing: {
      publishSession: { readiness: { state: 'ready' } },
      handlePublish: vi.fn(() => true),
    },
  })
  const Host = defineComponent({
    setup() {
      provideStudioEntryEditorContext(editor as never)
      return () => h(StudioEntryTopBar)
    },
  })
  const wrapper = mount(Host, {
    global: {
      stubs: {
        Button: { template: '<button><slot /></button>' },
        StudioStatusPill: { props: ['label'], template: '<span>{{ label }}</span>' },
        DropdownMenu: { template: '<div />' },
        StudioDuplicateEntryDialog: true,
        DropdownMenuTrigger: true,
        DropdownMenuItem: true,
        DropdownMenuContent: true,
        DropdownMenuSeparator: true,
        StudioDraftConflicts: true,
        StudioNotice: true,
      },
    },
  })
  return { editor, wrapper }
}

describe('focused Studio actions', () => {
  it('offers Preview and Publish with a language name while saving stays automatic', () => {
    const { wrapper } = setup()
    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels).toContain('Preview')
    expect(wrapper.find('[aria-label="Publish English"]').exists()).toBe(true)
    expect(labels).not.toContain('Save draft')
    wrapper.unmount()
  })
  it('flushes pending work before preview and stays in Studio if saving fails', async () => {
    const { wrapper, editor } = setup()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Preview')!
      .trigger('click')
    await flushPromises()
    expect(editor.draft.handleSaveDraft).toHaveBeenCalledTimes(1)
    expect(wrapper.find('header').exists()).toBe(true)
    wrapper.unmount()
  })
  it('only shows Retry saving when persistence needs recovery', async () => {
    const { wrapper, editor } = setup()
    editor.draft.saveState = 'error'
    await flushPromises()
    const retry = wrapper.findAll('button').find((button) => button.text().includes('Retry saving'))
    expect(retry).toBeDefined()
    await retry!.trigger('click')
    expect(editor.draft.handleSaveDraft).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
