// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'

import StudioAssetMetadataFields from '../../packages/cms/studio-app/src/components/studio/assets/StudioAssetMetadataFields.vue'
import type { FinderAssetRecord } from '../../packages/cms/studio-app/src/composables/internal/assetFinderTypes'
import {
  createStudioAssetBrowserContext,
  provideStudioAssetBrowserContext,
} from '../../packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext'

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

function stubs() {
  return {
    Button: defineComponent({
      props: { disabled: Boolean, size: String, variant: String },
      emits: ['click'],
      template: `<button type="button" :disabled="disabled" v-bind="$attrs" @click="$emit('click')"><slot /></button>`,
    }),
    Input: defineComponent({
      props: { disabled: Boolean, modelValue: String },
      emits: ['update:modelValue'],
      template: `<input :disabled="disabled" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
    }),
    Label: { template: '<label><slot /></label>' },
  }
}

interface HarnessOverrides {
  canCopy?: boolean
  altDraft?: ReturnType<typeof ref<string>>
  captionDraft?: ReturnType<typeof ref<string>>
  saveMetadata?: () => void
  copyDefault?: () => void
}

function buildContext(overrides: HarnessOverrides = {}) {
  const altDraft = overrides.altDraft ?? ref('')
  const captionDraft = overrides.captionDraft ?? ref('')
  const canCopy = ref(overrides.canCopy ?? false)
  type ContextOptions = Parameters<typeof createStudioAssetBrowserContext>[0]
  const assets = ref<FinderAssetRecord[]>([])
  const finder = {
    selectedAsset: ref<FinderAssetRecord | null>(null),
    assets,
    selectedVisibleAssetIds: ref<string[]>([]),
    assetCount: ref(0),
    selectAsset: vi.fn(),
  } as ContextOptions['finder']
  const studioSettings = {
    locales: ref([
      { code: 'en', label: 'English', isDefault: true },
      { code: 'de', label: 'Deutsch', isDefault: false },
    ]),
    defaultLocale: ref('en'),
  } as ContextOptions['studioSettings']
  const createContext = () => {
    const context = createStudioAssetBrowserContext({
      finder,
      props: { mode: 'manage', aspectRatio: null, modelValue: null },
      emit: vi.fn(),
      t: (key) => key,
      studioSettings,
      updateAsset: vi.fn(),
      pendingUploadedAssetId: ref(null),
    })
    Object.assign(context.metadata, {
      activeLocale: ref('en'),
      localeOptions: ref([
        { code: 'en', label: 'English', isDefault: true },
        { code: 'de', label: 'Deutsch', isDefault: false },
      ]),
      altText: computed({
        get: () => altDraft.value ?? '',
        set: (value: string) => {
          altDraft.value = value
        },
      }),
      captionText: computed({
        get: () => captionDraft.value ?? '',
        set: (value: string) => {
          captionDraft.value = value
        },
      }),
      savingMeta: ref(false),
      saveMetadata: overrides.saveMetadata ?? vi.fn(),
      canCopyDefaultMetadata: canCopy,
      copyDefaultMetadataToMissingLocales: overrides.copyDefault ?? vi.fn(),
      coverage: () => ({ complete: true, missingAlt: [], missingCaption: [] }),
      coverageLabel: () => 'complete',
    } satisfies typeof context.metadata)
    return context
  }
  return { createContext, altDraft, captionDraft, canCopy }
}

function mountFields(props: Record<string, unknown>, harness: ReturnType<typeof buildContext>) {
  const asset = { id: 'a1', alt: null, caption: null } as unknown as FinderAssetRecord
  const Host = defineComponent({
    setup() {
      provideStudioAssetBrowserContext(harness.createContext())
      return () => h(StudioAssetMetadataFields, { asset, ...props })
    },
  })
  return mount(Host, { global: { stubs: stubs() } })
}

describe('StudioAssetMetadataFields', () => {
  it('binds the alt/caption inputs to the context metadata drafts', async () => {
    const harness = buildContext()
    const wrapper = mountFields({}, harness)

    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(2)

    await inputs[0]!.setValue('Hero alt')
    expect(harness.altDraft.value).toBe('Hero alt')

    await inputs[1]!.setValue('Hero caption')
    expect(harness.captionDraft.value).toBe('Hero caption')
  })

  it('gates the copy-to-missing-locales button on canCopyDefaultMetadata', async () => {
    const copyDefault = vi.fn()
    const harness = buildContext({ canCopy: false, copyDefault })
    const wrapper = mountFields({ showCopyButton: true }, harness)

    const copyButton = () =>
      wrapper.findAll('button').find((button) => button.text().includes('copyDefaultDetails'))

    // Hidden while there is nothing to copy.
    expect(copyButton()).toBeUndefined()

    // Appears once the context reports missing-locale coverage to fill.
    harness.canCopy.value = true
    await wrapper.vm.$nextTick()
    expect(copyButton()).toBeTruthy()

    await copyButton()!.trigger('click')
    expect(copyDefault).toHaveBeenCalledOnce()
  })

  it('omits the copy button entirely when showCopyButton is false', () => {
    const harness = buildContext({ canCopy: true })
    const wrapper = mountFields({}, harness)
    expect(
      wrapper.findAll('button').find((button) => button.text().includes('copyDefaultDetails')),
    ).toBeUndefined()
  })
})
