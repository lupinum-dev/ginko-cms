// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import StudioAssetPicker from '../../packages/cms/studio-app/src/components/studio/StudioAssetPicker.vue'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    t: (key: string) =>
      ({
        'ginkoCms.studio.assetPicker.chooseAsset': 'Choose asset',
        'ginkoCms.studio.assetPicker.manageAssets': 'Manage assets',
        'ginkoCms.studio.assetPicker.description': 'Select or upload an asset.',
        'ginkoCms.studio.assetPicker.emptyGroup': 'No assets.',
        'ginkoCms.studio.assetPicker.entry': 'Entry',
        'ginkoCms.studio.assetPicker.collection': 'Collection',
        'ginkoCms.studio.assetPicker.global': 'Global',
        'ginkoCms.studio.assetPicker.title': 'Assets',
      })[key] ?? key,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({
    data: ref([]),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioSettings', () => ({
  useCmsStudioSettings: () => ({
    locales: ref([{ code: 'en', label: 'English', isDefault: true }]),
    defaultLocale: ref('en'),
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => vi.fn(),
  useConvexUpload: () => ({
    upload: vi.fn(),
  }),
}))

function stubs() {
  return {
    Button: defineComponent({
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
    DialogHeader: { template: '<header><slot /></header>' },
    DialogTitle: { template: '<h2><slot /></h2>' },
    Input: defineComponent({
      props: { modelValue: String },
      emits: ['update:modelValue'],
      template: '<input :value="modelValue" />',
    }),
    Label: { template: '<label><slot /></label>' },
    StudioAssetBrowser: defineComponent({
      name: 'StudioAssetBrowser',
      props: {
        acceptedTypes: Array,
        assetContext: Object,
        modelValue: [String, Array],
        multiple: Boolean,
      },
      emits: ['update:modelValue', 'select-asset', 'close'],
      template: `
        <div data-testid="asset-browser">
          <button data-testid="inspect" type="button">Inspect</button>
          <button
            data-testid="select"
            type="button"
            @click="$emit('update:modelValue', 'asset-stable-2'); $emit('select-asset', { _id: 'asset-stable-2', filename: 'hero.png', mimeType: 'image/png' })"
          >Select</button>
          <button data-testid="cancel" type="button" @click="$emit('close')">Cancel</button>
        </div>
      `,
    }),
  }
}

function mountPicker(props: Record<string, unknown> = {}) {
  return mount(StudioAssetPicker, {
    props: {
      modelValue: null,
      kind: 'image',
      label: 'Avatar',
      assetContext: {
        collection: 'authors',
        locale: 'en',
      },
      ...props,
    },
    global: {
      stubs: stubs(),
    },
  })
}

describe('StudioAssetPicker', () => {
  it('shows the choose/upload entry point by default', () => {
    const wrapper = mountPicker()

    const trigger = wrapper.get('[data-testid="studio-asset-picker-trigger"]')
    expect(trigger.text()).toContain('Choose asset')
  })

  it('can hide the trigger for externally controlled embeds', () => {
    const wrapper = mountPicker({ showTrigger: false, open: false })

    expect(wrapper.find('[data-testid="studio-asset-picker-trigger"]').exists()).toBe(false)
  })

  it('[AST-04] returns only the chosen stable asset ID, preserves the field on browse/cancel, enforces type constraints, and denies disabled selection', async () => {
    const wrapper = mountPicker({
      accept: ['image/png'],
      modelValue: 'asset-stable-1',
      open: true,
    })
    const browser = wrapper.getComponent({ name: 'StudioAssetBrowser' })
    expect(browser.props('acceptedTypes')).toEqual(['image/png'])

    await wrapper.get('[data-testid="inspect"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.get('[data-testid="cancel"]').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.setProps({ open: true })
    await wrapper.get('[data-testid="select"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['asset-stable-2']])
    expect(wrapper.emitted('select-asset')?.[0]?.[0]).toMatchObject({
      _id: 'asset-stable-2',
      mimeType: 'image/png',
    })

    const disabled = mountPicker({ disabled: true, modelValue: 'asset-stable-1', open: true })
    await disabled.get('[data-testid="select"]').trigger('click')
    expect(disabled.emitted('update:modelValue')).toBeUndefined()
    expect(disabled.emitted('select-asset')).toBeUndefined()
  })
})
