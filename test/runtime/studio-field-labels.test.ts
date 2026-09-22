// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import StudioEntryHeroFields from '../../packages/cms/studio-app/src/components/studio/editor/StudioEntryHeroFields.vue'
import { fieldDisplayLabel } from '../../packages/cms/studio-app/src/lib/fieldLabel'

const locale = ref('de')
vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ currentLocale: locale, t: (key: string) => key }),
}))

describe('localized editorial field labels', () => {
  it('uses the interface language, with readable fallbacks for incomplete labels', () => {
    const field = { key: 'cta_href', label: { en: 'Button destination', de: 'Linkziel' } }
    expect(fieldDisplayLabel(field, 'de')).toBe('Linkziel')
    expect(fieldDisplayLabel(field, 'de-DE')).toBe('Linkziel')
    expect(fieldDisplayLabel(field, 'fr')).toBe('Button destination')
    expect(fieldDisplayLabel({ key: 'cta_href', label: { de: 'Linkziel' } }, 'en')).toBe('Linkziel')
    expect(fieldDisplayLabel({ key: 'cta_href', label: { de: null, en: '  ' } }, 'de')).toBe(
      'Cta href',
    )
    expect(fieldDisplayLabel({ key: 'url', label: 'URL' })).toBe('URL')
    expect(fieldDisplayLabel({ key: 'bodyMdc', label: 'BodyMdc' })).toBe('Body')
  })

  it('updates the rendered accessible field label when the interface language changes', async () => {
    locale.value = 'de'
    const wrapper = mount(StudioEntryHeroFields, {
      props: {
        titleField: { key: 'title', type: 'string', label: { en: 'Headline', de: 'Überschrift' } },
        values: { title: 'A shared garden' },
      },
    })
    expect(wrapper.find('label[for="title"]').text()).toBe('Überschrift')
    locale.value = 'en'
    await nextTick()
    expect(wrapper.find('label[for="title"]').text()).toBe('Headline')
    expect(wrapper.find('textarea').element.value).toBe('A shared garden')
  })
})
