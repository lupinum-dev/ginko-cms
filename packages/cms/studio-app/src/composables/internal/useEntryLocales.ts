import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { Ref } from 'vue'
import { computed, reactive, ref, watch } from 'vue'
import type { useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useConvexMutation } from '../useStudioConvex'
import type { StudioCollectionConfig, StudioEntry, StudioField, StudioLocaleVariant } from './types'

interface EntryLocalesDeps {
  entry: Ref<StudioEntry | null>
  entryId: Ref<string>
  collection: Ref<string>
  contentRoute: string
  router: ReturnType<typeof useRouter>
  collectionConfig: Ref<StudioCollectionConfig | null>
  locales: Ref<Array<{ code: string; label?: string }>>
  localeVariants: Ref<StudioLocaleVariant[]>
  currentLocale: Ref<string>
  defaultLocale: Ref<string>
  localizedFields: Ref<StudioField[]>
  canEditEntries: Ref<boolean>
  saving: Ref<boolean>
  error: Ref<string>
  isDirty: Ref<boolean>
  form: { slug: string }
  handleSaveDraft: (silent?: boolean) => Promise<boolean>
  cancelAutoSave: () => void
  refreshEntry: () => Promise<void>
  t: (key: string) => string
}

export type LocaleVariantSource = { kind: 'blank' } | { kind: 'locale'; locale: string }

export function useEntryLocales(deps: EntryLocalesDeps) {
  const {
    entry,
    entryId,
    collection,
    contentRoute,
    router,
    locales,
    localeVariants,
    currentLocale,
    defaultLocale,
    localizedFields,
    canEditEntries,
    saving,
    error,
    isDirty,
    form,
    handleSaveDraft,
    cancelAutoSave,
    refreshEntry,
    t,
  } = deps

  const translationModeStorageKey = 'ginko-cms:translation-mode:v2'
  const canUseLocalStorage = typeof localStorage !== 'undefined'
  const storedTranslationMode = canUseLocalStorage
    ? localStorage.getItem(translationModeStorageKey)
    : null
  const translationMode = ref(
    storedTranslationMode !== null ? storedTranslationMode === 'true' : false,
  )
  const secondaryLocale = ref('')
  const hydratingSecondary = ref(false)
  const localeCreationOpen = ref(false)
  const localeCreationTarget = ref('')

  const secondaryDataFields = reactive<Record<string, unknown>>({})

  const secondaryEditorContext = computed(() => ({
    slug: form.slug,
    ...secondaryDataFields,
  }))

  const secondaryAssetContext = computed(() => ({
    collection: collection.value,
    locale: secondaryLocale.value,
    entryId: entryId.value,
  }))

  const secondaryEntryQuery = useCmsStudioQuery(
    api.ginkoCms.editor.getEntry,
    computed(() =>
      translationMode.value && secondaryLocale.value
        ? { id: entryId.value, locale: secondaryLocale.value }
        : ('skip' as const),
    ),
  )
  const secondaryEntry = computed(() => secondaryEntryQuery.data?.value ?? null)
  const existingLocaleOptions = computed(() =>
    locales.value.filter(
      (locale) =>
        locale.code !== localeCreationTarget.value &&
        localeVariants.value.some(
          (variant) => variant.locale === locale.code && variant.draftExists === true,
        ),
    ),
  )
  const currentLocaleDraftExists = computed(() =>
    localeVariants.value.some(
      (variant) => variant.locale === currentLocale.value && variant.draftExists === true,
    ),
  )
  const secondaryLocaleDraftExists = computed(() =>
    localeVariants.value.some(
      (variant) => variant.locale === secondaryLocale.value && variant.draftExists === true,
    ),
  )

  // Initialize secondary locale from configured locales
  watch(
    [entry, locales, currentLocale],
    ([value, allLocales, activeLocale]) => {
      if (!value) return
      const otherLocale = allLocales.find((locale) => locale.code !== activeLocale)?.code ?? ''
      if (!secondaryLocale.value && otherLocale) {
        secondaryLocale.value = otherLocale
      }
    },
    { immediate: true },
  )

  watch(
    secondaryEntry,
    (value) => {
      if (!value) return
      hydratingSecondary.value = true
      const data = (value.data ?? {}) as Record<string, unknown>
      for (const field of localizedFields.value) {
        secondaryDataFields[field.key] =
          field.type === 'richtext'
            ? (value.localeData?.draft.bodyMdc ?? '')
            : (data[field.key] ?? '')
      }
      queueMicrotask(() => {
        hydratingSecondary.value = false
      })
    },
    { immediate: true },
  )

  watch([secondaryLocale, currentLocale], ([nextSecondaryLocale, nextCurrentLocale]) => {
    if (nextSecondaryLocale && nextSecondaryLocale === nextCurrentLocale) {
      secondaryLocale.value =
        locales.value.find((locale) => locale.code !== nextCurrentLocale)?.code ?? ''
    }
  })

  // Persist translation mode preference & auto-select secondary locale
  watch(translationMode, (value) => {
    if (canUseLocalStorage) {
      localStorage.setItem(translationModeStorageKey, String(value))
    }
    if (value && !secondaryLocale.value) {
      const other = locales.value.find((locale) => locale.code !== currentLocale.value)
      if (other) {
        secondaryLocale.value = other.code
      }
    }
  })

  const createLocaleVariantMutation = useConvexMutation(api.ginkoCms.editor.createLocaleVariant)

  function beginLocaleCreation(localeCode: string) {
    if (
      !canEditEntries.value ||
      !locales.value.some((locale) => locale.code === localeCode) ||
      localeVariants.value.some(
        (variant) => variant.locale === localeCode && variant.draftExists === true,
      )
    ) {
      return
    }
    localeCreationTarget.value = localeCode
    localeCreationOpen.value = true
  }

  function setLocaleCreationOpen(value: boolean) {
    if (!value && saving.value) return
    localeCreationOpen.value = value
    if (!value) localeCreationTarget.value = ''
  }

  async function confirmLocaleCreation(source: LocaleVariantSource) {
    const localeCode = localeCreationTarget.value
    if (!localeCode || !canEditEntries.value) return false

    saving.value = true
    error.value = ''
    try {
      if (isDirty.value) {
        cancelAutoSave()
        const saved = await handleSaveDraft(true)
        if (!saved) return false
      }
      await createLocaleVariantMutation({
        entryId: entryId.value,
        locale: localeCode,
        source,
      })
      await Promise.all([
        refreshEntry(),
        localeCode === secondaryLocale.value ? secondaryEntryQuery.refresh() : Promise.resolve(),
      ])
      localeCreationOpen.value = false
      localeCreationTarget.value = ''
      return true
    } catch (cause) {
      error.value = getCmsErrorMessage(
        cause,
        t('ginkoCms.studio.collectionEditor.createTranslationError'),
      )
      return false
    } finally {
      saving.value = false
    }
  }

  async function handleSwitchLocale(localeCode: string) {
    const currentEntry = entry.value
    if (!currentEntry || localeCode === currentEntry.locale) return
    saving.value = true
    error.value = ''
    try {
      if (isDirty.value) {
        cancelAutoSave()
        const saved = await handleSaveDraft(true)
        if (!saved) return
      }
      await router.push({
        path: `${contentRoute}/${collection.value}/${entryId.value}`,
        query: localeCode === defaultLocale.value ? {} : { locale: localeCode },
      })
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.switchLocaleError'))
    } finally {
      saving.value = false
    }
  }

  async function handleSelectSecondaryLocale(localeCode: string) {
    if (!localeCode || localeCode === currentLocale.value) {
      secondaryLocale.value = ''
      return
    }
    secondaryLocale.value = localeCode
  }

  function setTranslationMode(value: boolean) {
    translationMode.value = value
  }

  return {
    translationMode,
    secondaryLocale,
    secondaryDataFields,
    secondaryEditorContext,
    secondaryAssetContext,
    currentLocaleDraftExists,
    secondaryLocaleDraftExists,
    existingLocaleOptions,
    localeCreationOpen,
    localeCreationTarget,
    setTranslationMode,
    handleSwitchLocale,
    handleSelectSecondaryLocale,
    beginLocaleCreation,
    setLocaleCreationOpen,
    confirmLocaleCreation,
  }
}
