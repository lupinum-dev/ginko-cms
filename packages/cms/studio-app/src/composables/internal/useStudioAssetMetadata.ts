import type { LocaleText } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

import type { useCmsStudioSettings } from '../useCmsStudioSettings'
import type { FinderAssetRecord } from './assetFinderTypes'
import type { StudioAssetContext } from './types'

type StudioSettings = ReturnType<typeof useCmsStudioSettings>
type Translate = (key: string, params?: Record<string, unknown>) => string
type UpdateAssetMutation = (args: {
  assetId: string
  alt: LocaleText
  caption: LocaleText
}) => Promise<unknown>

export interface LocaleOption {
  code: string
  label: string
  isDefault: boolean
}

export interface MetadataCoverage {
  complete: boolean
  missingAlt: string[]
  missingCaption: string[]
}

export function useStudioAssetMetadata(options: {
  selectedAsset: ComputedRef<FinderAssetRecord | null>
  assetContext: () => StudioAssetContext | undefined
  studioSettings: StudioSettings
  updateAsset: UpdateAssetMutation
  localError: Ref<string>
  t: Translate
}) {
  const activeLocale = ref('')
  const altDrafts = ref<Record<string, string>>({})
  const captionDrafts = ref<Record<string, string>>({})
  const savingMeta = ref(false)
  const localeOptions = computed<LocaleOption[]>(() => {
    const configured = options.studioSettings.locales.value.map((locale) => ({
      code: locale.code,
      label: locale.label || locale.code,
      isDefault: locale.code === options.studioSettings.defaultLocale.value,
    }))
    const preferredCodes = [
      options.assetContext()?.locale,
      options.studioSettings.defaultLocale.value,
      configured[0]?.code,
      'en',
    ].filter((code): code is string => !!code)
    const byCode = new Map(configured.map((locale) => [locale.code, locale]))
    for (const code of preferredCodes) {
      if (!byCode.has(code)) byCode.set(code, { code, label: code, isDefault: false })
    }
    return Array.from(byCode.values())
  })
  const preferredLocale = computed(
    () => options.assetContext()?.locale ?? options.studioSettings.defaultLocale.value ?? 'en',
  )
  const altText = computed<string>({
    get: () => altDrafts.value[activeLocale.value] ?? '',
    set: (value) => {
      altDrafts.value = { ...altDrafts.value, [activeLocale.value]: value }
    },
  })
  const captionText = computed<string>({
    get: () => captionDrafts.value[activeLocale.value] ?? '',
    set: (value) => {
      captionDrafts.value = { ...captionDrafts.value, [activeLocale.value]: value }
    },
  })

  function localeTextToDrafts(value: LocaleText | string | null | undefined) {
    if (typeof value === 'string') {
      return { [options.studioSettings.defaultLocale.value ?? 'en']: value }
    }
    return value && typeof value === 'object' ? { ...value } : {}
  }

  function localeTextHasValue(value: LocaleText | string | null | undefined, locale: string) {
    if (typeof value === 'string') {
      return (
        locale === (options.studioSettings.defaultLocale.value ?? 'en') && value.trim().length > 0
      )
    }
    const text = value && typeof value === 'object' ? value[locale] : null
    return typeof text === 'string' && text.trim().length > 0
  }

  function coverage(asset: Pick<FinderAssetRecord, 'alt' | 'caption'>): MetadataCoverage {
    const locales = localeOptions.value.map((locale) => locale.code)
    const missingAlt = locales.filter((locale) => !localeTextHasValue(asset.alt, locale))
    const missingCaption = locales.filter((locale) => !localeTextHasValue(asset.caption, locale))
    return {
      complete: missingAlt.length === 0 && missingCaption.length === 0,
      missingAlt,
      missingCaption,
    }
  }

  function coverageLabel(asset: Pick<FinderAssetRecord, 'alt' | 'caption'>) {
    const result = coverage(asset)
    if (result.complete) return options.t('ginkoCms.studio.assetBrowser.detailsComplete')
    return options.t('ginkoCms.studio.assetBrowser.missingDetails', {
      locales: Array.from(new Set([...result.missingAlt, ...result.missingCaption]))
        .join(', ')
        .toUpperCase(),
    })
  }

  function mergedLocaleText(
    existing: LocaleText | string | null | undefined,
    drafts: Record<string, string>,
  ): LocaleText {
    return {
      ...(typeof existing === 'object' && existing !== null ? existing : {}),
      ...drafts,
    }
  }

  const canCopyDefaultMetadata = computed(() => {
    const asset = options.selectedAsset.value
    if (!asset) return false
    const defaultLocale = options.studioSettings.defaultLocale.value ?? 'en'
    if (!altDrafts.value[defaultLocale]?.trim() && !captionDrafts.value[defaultLocale]?.trim()) {
      return false
    }
    const result = coverage(asset)
    return result.missingAlt.length > 0 || result.missingCaption.length > 0
  })

  async function saveMetadata() {
    const asset = options.selectedAsset.value
    if (!asset) return
    savingMeta.value = true
    options.localError.value = ''
    try {
      await options.updateAsset({
        assetId: asset.id,
        alt: mergedLocaleText(asset.alt, altDrafts.value),
        caption: mergedLocaleText(asset.caption, captionDrafts.value),
      })
    } catch (cause) {
      options.localError.value = getCmsErrorMessage(
        cause,
        options.t('ginkoCms.studio.assetPicker.saveMetadataError'),
      )
    } finally {
      savingMeta.value = false
    }
  }

  async function copyDefaultMetadataToMissingLocales() {
    const asset = options.selectedAsset.value
    if (!asset) return
    const defaultLocale = options.studioSettings.defaultLocale.value ?? 'en'
    const defaultAlt = altDrafts.value[defaultLocale]?.trim()
    const defaultCaption = captionDrafts.value[defaultLocale]?.trim()
    const nextAlt = { ...altDrafts.value }
    const nextCaption = { ...captionDrafts.value }
    const result = coverage(asset)
    for (const locale of result.missingAlt) if (defaultAlt) nextAlt[locale] = defaultAlt
    for (const locale of result.missingCaption) {
      if (defaultCaption) nextCaption[locale] = defaultCaption
    }
    altDrafts.value = nextAlt
    captionDrafts.value = nextCaption
    await saveMetadata()
  }

  watch(
    [options.selectedAsset, preferredLocale],
    ([asset, locale]) => {
      if (!asset) {
        altDrafts.value = {}
        captionDrafts.value = {}
        activeLocale.value = locale
        return
      }
      altDrafts.value = localeTextToDrafts(asset.alt)
      captionDrafts.value = localeTextToDrafts(asset.caption)
      activeLocale.value = localeOptions.value.some((option) => option.code === locale)
        ? locale
        : (localeOptions.value[0]?.code ?? 'en')
    },
    { immediate: true },
  )

  return {
    activeLocale,
    localeOptions,
    altText,
    captionText,
    savingMeta,
    saveMetadata,
    canCopyDefaultMetadata,
    copyDefaultMetadataToMissingLocales,
    coverage,
    coverageLabel,
  }
}
