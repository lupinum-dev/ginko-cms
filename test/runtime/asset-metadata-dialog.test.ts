// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import StudioAssetMetadataDialog from '../../packages/cms/studio-app/src/components/studio/StudioAssetMetadataDialog.vue'

const mocks = vi.hoisted(() => {
  return {
    updateAsset: vi.fn(),
    assets: [
      {
        _id: 'asset_1',
        filename: 'hero.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        width: 1200,
        height: 800,
        url: '/hero.jpg',
        alt: { en: 'Old EN', de: 'Old DE' },
        caption: { en: 'Caption EN', de: 'Caption DE' },
      },
    ],
  }
})

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({
    t: (key: string) =>
      key === 'ginkoCms.studio.assetMetadataDialog.description'
        ? 'Update image text used by editors. Live pages keep their current image details until they are published again.'
        : key,
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioSettings', () => ({
  useCmsStudioSettings: () => ({
    locales: {
      value: [
        { code: 'en', label: 'English', isDefault: true },
        { code: 'de', label: 'Deutsch' },
      ],
    },
    defaultLocale: {
      value: 'en',
    },
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', () => ({
  useCmsStudioQuery: () => ({
    data: {
      value: mocks.assets,
    },
  }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexMutation: () => mocks.updateAsset,
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
    DialogContent: { template: '<section><slot /></section>' },
    DialogDescription: { template: '<p><slot /></p>' },
    DialogFooter: { template: '<footer><slot /></footer>' },
    DialogHeader: { template: '<header><slot /></header>' },
    DialogTitle: { template: '<h2><slot /></h2>' },
    Input: defineComponent({
      props: { disabled: Boolean, modelValue: String },
      emits: ['update:modelValue'],
      template: `<input :disabled="disabled" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
    }),
    Label: { template: '<label><slot /></label>' },
  }
}

describe('StudioAssetMetadataDialog', () => {
  it('[AST-03] edits metadata per configured locale without dropping values and explains immutable published-snapshot freshness', async () => {
    mocks.updateAsset.mockResolvedValue(null)

    const wrapper = mount(StudioAssetMetadataDialog, {
      props: {
        assetContext: {
          collection: 'blog-posts',
          locale: 'en',
        },
        assetId: 'asset_1',
        open: true,
      },
      global: {
        stubs: stubs(),
      },
    })

    const inputs = wrapper.findAll('input')
    expect(inputs[0]!.element.value).toBe('Old EN')
    expect(wrapper.text()).toContain(
      'Live pages keep their current image details until they are published again.',
    )

    await inputs[0]!.setValue('New EN')
    await wrapper
      .findAll('button')
      .find((button) => button.text().trim().startsWith('de'))!
      .trigger('click')

    expect(wrapper.findAll('input')[0]!.element.value).toBe('Old DE')

    await wrapper.findAll('input')[0]!.setValue('New DE')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save'))!
      .trigger('click')

    expect(mocks.updateAsset).toHaveBeenCalledWith({
      assetId: 'asset_1',
      alt: {
        en: 'New EN',
        de: 'New DE',
      },
      caption: {
        en: 'Caption EN',
        de: 'Caption DE',
      },
    })
  })

  it('treats legacy string metadata as default-locale metadata', async () => {
    mocks.updateAsset.mockResolvedValue(null)
    mocks.assets[0] = {
      ...mocks.assets[0],
      alt: 'Legacy alt',
      caption: 'Legacy caption',
    }

    const wrapper = mount(StudioAssetMetadataDialog, {
      props: {
        assetContext: {
          collection: 'blog-posts',
          locale: 'en',
        },
        assetId: 'asset_1',
        open: true,
      },
      global: {
        stubs: stubs(),
      },
    })

    expect(wrapper.findAll('input')[0]!.element.value).toBe('Legacy alt')

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save'))!
      .trigger('click')

    expect(mocks.updateAsset).toHaveBeenCalledWith({
      assetId: 'asset_1',
      alt: { en: 'Legacy alt' },
      caption: { en: 'Legacy caption' },
    })
  })
})
