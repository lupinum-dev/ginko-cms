import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'

import type { FinderAssetRecord } from '../../packages/cms/studio-app/src/composables/internal/assetFinderTypes'
import { useStudioAssetMetadata } from '../../packages/cms/studio-app/src/composables/internal/useStudioAssetMetadata'

function asset(overrides: Partial<FinderAssetRecord> = {}) {
  return {
    id: 'asset-1',
    alt: { en: 'Hero alt' },
    caption: { en: 'Hero caption' },
    ...overrides,
  } as FinderAssetRecord
}

function controller(updateAsset = vi.fn(async () => undefined)) {
  const selected = ref<FinderAssetRecord | null>(asset())
  const localError = ref('')
  const studioSettings = {
    locales: ref([
      { code: 'en', label: 'English', isDefault: true },
      { code: 'de', label: 'Deutsch', isDefault: false },
    ]),
    defaultLocale: computed(() => 'en'),
  } as Parameters<typeof useStudioAssetMetadata>[0]['studioSettings']
  const metadata = useStudioAssetMetadata({
    selectedAsset: computed(() => selected.value),
    assetContext: () => ({ locale: 'en' }),
    studioSettings,
    updateAsset,
    localError,
    t: (key) => key,
  })
  return { metadata, selected, localError, updateAsset }
}

describe('Studio asset metadata controller', () => {
  it('saves localized drafts without losing existing locale values', async () => {
    const harness = controller()
    harness.metadata.activeLocale.value = 'de'
    harness.metadata.altText.value = 'Alternativtext'
    harness.metadata.captionText.value = 'Bildunterschrift'
    await harness.metadata.saveMetadata()

    expect(harness.updateAsset).toHaveBeenCalledWith({
      assetId: 'asset-1',
      alt: { en: 'Hero alt', de: 'Alternativtext' },
      caption: { en: 'Hero caption', de: 'Bildunterschrift' },
    })
    expect(harness.metadata.savingMeta.value).toBe(false)
    expect(harness.localError.value).toBe('')
  })

  it('surfaces save errors and always clears the saving state', async () => {
    const harness = controller(vi.fn(async () => Promise.reject(new Error('save failed'))))
    await harness.metadata.saveMetadata()
    expect(harness.localError.value).toContain('save failed')
    expect(harness.metadata.savingMeta.value).toBe(false)
  })

  it('copies default metadata only into missing locales before saving', async () => {
    const harness = controller()
    harness.selected.value = asset({
      alt: { en: 'Hero alt', de: 'Vorhanden' },
      caption: { en: 'Hero caption' },
    })
    await nextTick()
    await harness.metadata.copyDefaultMetadataToMissingLocales()

    expect(harness.updateAsset).toHaveBeenCalledWith({
      assetId: 'asset-1',
      alt: { en: 'Hero alt', de: 'Vorhanden' },
      caption: { en: 'Hero caption', de: 'Hero caption' },
    })
  })
})
