// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import StudioDraftConflicts from '../../packages/cms/studio-app/src/components/studio/editor/StudioDraftConflicts.vue'
import { contentLanguageLabel } from '../../packages/cms/studio-app/src/lib/contentLanguageLabel'

describe('shared draft conflict recovery', () => {
  it('preserves both text values and resolves only the selected field', async () => {
    const path = ['localized', 'en', 'title']
    const wrapper = mount(StudioDraftConflicts, {
      props: {
        fields: [{ key: 'title', label: { en: 'Headline', de: 'Überschrift' } }],
        conflicts: [
          {
            path,
            before: 'Original',
            mine: '<img src=x onerror=alert(1)>',
            shared: 'Their headline',
          },
        ],
      },
      global: { stubs: { Button: { template: '<button><slot /></button>' } } },
    })
    expect(wrapper.text()).toContain('Headline')
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('Their headline')
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(wrapper.emitted('resolve')).toEqual([[path, 'mine']])
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('resolve')?.[1]).toEqual([path, 'shared'])
    expect(wrapper.text()).toContain('Their headline')
    wrapper.unmount()
  })
})

describe('content language labels', () => {
  it('honors configured names and otherwise expands codes in the interface language', () => {
    expect(contentLanguageLabel('de', [{ code: 'de', label: 'Deutsch' }])).toBe('Deutsch')
    expect(contentLanguageLabel('de', [{ code: 'de', label: 'de' }], 'en')).toBe('German')
    expect(contentLanguageLabel('en', [], 'de')).toBe('Englisch')
    expect(contentLanguageLabel('invalid_code', [], 'en')).toBe('invalid_code')
  })
})
