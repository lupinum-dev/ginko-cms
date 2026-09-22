// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'

import StudioEntryCompareToolbar from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryCompareToolbar.vue'
import { provideStudioEntryEditorContext } from '../../packages/cms/studio-app/src/composables/internal/studioEntryEditorContext'
import { useCmsI18n } from '../../packages/cms/studio-app/src/composables/useCmsI18n'

const detailsOpen = vi.hoisted(() => vi.fn())
vi.mock('../../packages/cms/studio-app/src/composables/useRightSidebar', () => ({
  useRightSidebar: () => ({ isMobile: ref(false), setOpen: detailsOpen, setOpenMobile: vi.fn() }),
}))

function setup(compare = false) {
  const editor = reactive({
    loader: {
      currentLocale: 'en',
      pending: false,
      dateLocale: 'en',
      locales: [
        { code: 'en', label: 'English' },
        { code: 'de', label: 'Deutsch' },
      ],
      localeVariants: [
        { locale: 'en', draftExists: true },
        { locale: 'de', draftExists: true },
      ],
      canEditEntries: true,
      t: useCmsI18n().t,
    },
    draft: { saving: false },
    locales: {
      translationMode: compare,
      secondaryLocale: compare ? 'de' : '',
      setTranslationMode: vi.fn(async () => false),
      handleSelectSecondaryLocale: vi.fn(async () => true),
      handleSwitchLocale: vi.fn(async () => false),
    },
  })
  const Host = defineComponent({
    setup() {
      provideStudioEntryEditorContext(editor as never)
      return () => h(StudioEntryCompareToolbar)
    },
  })
  const wrapper = mount(Host, {
    global: {
      stubs: Object.fromEntries(
        [
          'Button',
          'Select',
          'SelectTrigger',
          'SelectContent',
          'SelectItem',
          'Separator',
          'Icon',
          'RouterLink',
        ].map((name) => [
          name,
          { template: name === 'Button' ? '<button><slot /></button>' : '<div><slot /></div>' },
        ]),
      ),
    },
  })
  return { editor, wrapper }
}

describe('language view guards', () => {
  it('does not report languages missing while the entry query is loading', async () => {
    const { editor, wrapper } = setup()
    editor.loader.pending = true
    editor.loader.localeVariants = []
    await flushPromises()
    expect(wrapper.text()).not.toContain('Missing')
    editor.loader.pending = false
    await flushPromises()
    expect(wrapper.text()).toContain('Missing')
    wrapper.unmount()
  })
  it('names compact language and comparison controls for keyboard and screen-reader use', () => {
    const { wrapper } = setup()
    expect(wrapper.find('[aria-label="Choose language. Current: English"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Compare languages"]').attributes('aria-pressed')).toBe(
      'false',
    )
    wrapper.unmount()
  })
  it('opens the contextual translation panel through a named action', async () => {
    const { wrapper } = setup()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Translation review')!
      .trigger('click')
    expect(detailsOpen).toHaveBeenCalledWith(true)
    wrapper.unmount()
  })
  it('does not select a comparison language if pending content cannot flush', async () => {
    const { editor, wrapper } = setup()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Compare languages')!
      .trigger('click')
    await flushPromises()
    expect(editor.locales.setTranslationMode).toHaveBeenCalledWith(true)
    expect(editor.locales.handleSelectSecondaryLocale).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('awaits a successful mode switch before initializing comparison', async () => {
    const { editor, wrapper } = setup()
    editor.locales.setTranslationMode.mockResolvedValue(true)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Compare languages')!
      .trigger('click')
    await flushPromises()
    expect(editor.locales.handleSelectSecondaryLocale).toHaveBeenCalledWith('de')
    wrapper.unmount()
  })
  it('keeps comparison identity if switching the editing language is blocked', async () => {
    const { editor, wrapper } = setup(true)
    await wrapper.find('[aria-label="Swap languages"]').trigger('click')
    await flushPromises()
    expect(editor.locales.handleSwitchLocale).toHaveBeenCalledWith('de')
    expect(editor.locales.handleSelectSecondaryLocale).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
