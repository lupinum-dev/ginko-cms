// @vitest-environment jsdom

import {
  setupBetterConvexTest,
  type BetterConvexTestRuntime,
} from '@lupinum/better-convex-nuxt/test'
import type { LocaleText } from '@lupinum/ginko-cms-contract/shared/types.js'
import type { GinkoCmsStudioHostApi } from '@lupinum/ginko-cms/public'
import { flushPromises, mount } from '@vue/test-utils'
import { makeFunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import { setApi } from '../../packages/cms/studio-app/src/boundary/api'
import StudioAssetMetadataDialog from '../../packages/cms/studio-app/src/components/studio/StudioAssetMetadataDialog.vue'

const mocks = vi.hoisted(() => {
  return {
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
const testRuntime = vi.hoisted(() => ({
  current: null as BetterConvexTestRuntime | null,
}))
const updateAssetReference = makeFunctionReference<
  'mutation',
  { assetId: string; alt: LocaleText; caption: LocaleText },
  null
>('ginkoCms/assets:updateAsset')

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
  useConvexForm: (...args: unknown[]) =>
    Reflect.apply(testRuntime.current!.composables.useConvexForm, undefined, args),
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

function mountDialog() {
  return mount(StudioAssetMetadataDialog, {
    props: {
      assetContext: {
        collection: 'blog-posts',
        locale: 'en',
      },
      assetId: 'asset_1',
      open: true,
    },
    global: {
      plugins: [testRuntime.current!.plugin],
      stubs: stubs(),
    },
  })
}

function saveButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.findAll('button').find((button) => button.text().includes('Save'))!
}

beforeEach(() => {
  testRuntime.current = setupBetterConvexTest({ auth: 'authenticated' })
  setApi({
    ginkoCms: { assets: { updateAsset: updateAssetReference } },
  } as GinkoCmsStudioHostApi)
  mocks.assets[0] = {
    _id: 'asset_1',
    filename: 'hero.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    width: 1200,
    height: 800,
    url: '/hero.jpg',
    alt: { en: 'Old EN', de: 'Old DE' },
    caption: { en: 'Caption EN', de: 'Caption DE' },
  }
})

describe('StudioAssetMetadataDialog', () => {
  it('[AST-03] edits metadata per configured locale without dropping values and explains immutable published-snapshot freshness', async () => {
    const updateAsset = testRuntime.current!.mutation(updateAssetReference)
    updateAsset.resolve(null)
    const wrapper = mountDialog()

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
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(updateAsset.calls).toEqual([
      {
        args: {
          assetId: 'asset_1',
          alt: {
            en: 'New EN',
            de: 'New DE',
          },
          caption: {
            en: 'Caption EN',
            de: 'Caption DE',
          },
        },
      },
    ])
  })

  it('treats legacy string metadata as default-locale metadata', async () => {
    const updateAsset = testRuntime.current!.mutation(updateAssetReference)
    updateAsset.resolve(null)
    mocks.assets[0] = {
      ...mocks.assets[0],
      alt: 'Legacy alt',
      caption: 'Legacy caption',
    }

    const wrapper = mountDialog()

    expect(wrapper.findAll('input')[0]!.element.value).toBe('Legacy alt')

    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(updateAsset.calls).toEqual([
      {
        args: {
          assetId: 'asset_1',
          alt: { en: 'Legacy alt' },
          caption: { en: 'Legacy caption' },
        },
      },
    ])
  })

  it('blocks malformed localized metadata before the mutation', async () => {
    const updateAsset = testRuntime.current!.mutation(updateAssetReference)
    mocks.assets[0] = {
      ...mocks.assets[0],
      alt: { en: 42 },
    }
    const wrapper = mountDialog()

    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(updateAsset.calls).toHaveLength(0)
    expect(wrapper.get('[role="alert"]').text()).not.toBe('')
  })

  it('renders a normalized mutation failure in the DOM', async () => {
    const updateAsset = testRuntime.current!.mutation(updateAssetReference)
    updateAsset.reject(new Error('metadata write failed'))
    const wrapper = mountDialog()

    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(updateAsset.calls).toHaveLength(1)
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'ginkoCms.studio.assetPicker.saveMetadataError',
    )
  })

  it('performs one mutation for rapid repeated saves', async () => {
    const updateAsset = testRuntime.current!.mutation(updateAssetReference)
    const wrapper = mountDialog()
    const save = saveButton(wrapper)

    const first = save.trigger('click')
    const second = save.trigger('click')
    await Promise.all([first, second])
    await flushPromises()

    expect(updateAsset.calls).toHaveLength(1)

    updateAsset.resolve(null)
    await flushPromises()
  })
})
