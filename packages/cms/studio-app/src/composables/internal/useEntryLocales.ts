import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { Ref } from 'vue'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import { getStudioAuthoringSource } from '../../boundary/host-bridge'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useConvexMutation } from '../useStudioConvex'
import type { StudioRichtextFlush } from './studioRichtextFlush'
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
  richtextFlush: StudioRichtextFlush
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
    collectionConfig,
    locales,
    localeVariants,
    currentLocale,
    defaultLocale,
    localizedFields,
    canEditEntries,
    saving,
    error,
    isDirty,
    richtextFlush,
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
    authoringSource: getStudioAuthoringSource(collection.value, collectionConfig.value),
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

  async function flushRichtext() {
    const result = await richtextFlush.flush()
    if (!result.ok) {
      error.value = result.error.message
      return false
    }
    await nextTick()
    return true
  }

  async function confirmLocaleCreation(source: LocaleVariantSource) {
    const localeCode = localeCreationTarget.value
    if (!localeCode || !canEditEntries.value) return false

    saving.value = true
    error.value = ''
    try {
      if (!(await flushRichtext())) return false
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
    if (!currentEntry || localeCode === currentEntry.locale) return false
    saving.value = true
    error.value = ''
    try {
      if (!(await flushRichtext())) return false
      if (isDirty.value) {
        cancelAutoSave()
        const saved = await handleSaveDraft(true)
        if (!saved) return false
      }
      await router.push({
        path: `${contentRoute}/${collection.value}/${entryId.value}`,
        query: localeCode === defaultLocale.value ? {} : { locale: localeCode },
      })
      return true
    } catch (e) {
      error.value = getCmsErrorMessage(e, t('ginkoCms.studio.collectionEditor.switchLocaleError'))
      return false
    } finally {
      saving.value = false
    }
  }

  async function handleSelectSecondaryLocale(localeCode: string) {
    if (localeCode === secondaryLocale.value) return true
    if (!(await flushRichtext())) return false
    if (!localeCode || localeCode === currentLocale.value) {
      secondaryLocale.value = ''
      return true
    }
    secondaryLocale.value = localeCode
    return true
  }

  async function setTranslationMode(value: boolean) {
    if (value === translationMode.value) return true
    if (!value && !(await flushRichtext())) return false
    translationMode.value = value
    return true
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
