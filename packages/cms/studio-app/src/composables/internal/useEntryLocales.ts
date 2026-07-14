import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import { getCmsErrorMessage } from '@public/utils/cmsErrors'
import type { FunctionArgs } from 'convex/server'
import type { Ref } from 'vue'
import { computed, reactive, ref, watch } from 'vue'
import type { useRouter } from 'vue-router'

import { api } from '../../boundary/api'
import { useStudioHostContext } from '../../boundary/studio-host-context'
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
  buildLocalizedData: (source: Record<string, unknown>) => Record<string, unknown> | undefined
  t: (key: string) => string
}

export function useEntryLocales(deps: EntryLocalesDeps) {
  const studioHost = useStudioHostContext()
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
    buildLocalizedData,
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
  const secondaryLastSaved = ref<Date | null>(null)
  const hydratingSecondary = ref(false)

  const secondaryDataFields = reactive<Record<string, unknown>>({})

  const secondaryEditorContext = computed(() => ({
    slug: form.slug,
    ...secondaryDataFields,
  }))

  const secondaryAssetContext = computed(() => ({
    collectionSlug: collection.value,
    locale: secondaryLocale.value,
    entryId: entryId.value,
  }))

  const secondaryEntryQuery = useCmsStudioQuery(
    api.ginkoCms.editor.getEntry,
    computed(() =>
      translationMode.value && secondaryLocale.value
        ? { id: entryId.value, locale: secondaryLocale.value }
        : null,
    ),
  )
  const secondaryEntry = computed(() => secondaryEntryQuery.data?.value ?? null)

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
  const saveEntryDraftMutation = useConvexMutation(api.ginkoCms.editor.saveEntryDraft)

  async function ensureSecondaryVariant(localeCode: string) {
    if (!localeCode || localeCode === currentLocale.value) return null
    const targetVariant = localeVariants.value.find((locale) => locale.locale === localeCode)
    if (targetVariant?.draftPath || targetVariant?.publishedPath) {
      return entryId.value
    }
    await createLocaleVariantMutation({ entryId: entryId.value, locale: localeCode })
    return entryId.value
  }

  async function readLatestEntryDraftVersion(localeCode: string) {
    const convex = studioHost.requireConvexClient()
    const latest = (await convex.query(api.ginkoCms.editor.getEntry, {
      id: entryId.value,
      locale: localeCode,
    })) as StudioEntry | null
    const draftVersion = latest?.draftVersion ?? entry.value?.draftVersion
    if (typeof draftVersion !== 'number') {
      throw new TypeError('The saved draft is not loaded. Reload before saving this language.')
    }
    return draftVersion
  }

  // --- Secondary auto-save ---
  // Per Gate -1: side-by-side secondary-locale autosave is DISABLED until the
  // new draft-version concurrency model lands. The previous implementation
  // saved with the *primary* locale's draftVersion as the expected version,
  // which silently overwrote concurrent translation work with no warning.
  // Manual save still works because the user explicitly requests it and the
  // call fetches the current entry version immediately before saving.

  async function handleSaveSecondaryDraft(silent = false) {
    if (!canEditEntries.value || !secondaryLocale.value) return
    const targetId = await ensureSecondaryVariant(secondaryLocale.value)
    if (!targetId) return
    if (!silent) saving.value = true
    error.value = ''
    try {
      const expectedDraftVersion = await readLatestEntryDraftVersion(secondaryLocale.value)
      await saveEntryDraftMutation({
        entryId: entryId.value,
        expectedDraftVersion,
        patch: {
          locales: {
            [secondaryLocale.value]: {
              values: (buildLocalizedData(secondaryDataFields) ?? {}) as JsonObject,
              ...buildSecondaryBodyPatch(),
            },
          },
        } as FunctionArgs<typeof api.ginkoCms.editor.saveEntryDraft>['patch'],
      })
      secondaryLastSaved.value = new Date()
      await secondaryEntryQuery.refresh()
    } catch (e) {
      error.value = getCmsErrorMessage(
        e,
        t('ginkoCms.studio.collectionEditor.saveTranslationError'),
      )
    } finally {
      if (!silent) saving.value = false
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
      await ensureSecondaryVariant(localeCode)
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
    saving.value = true
    error.value = ''
    try {
      secondaryLocale.value = localeCode
      await ensureSecondaryVariant(localeCode)
    } catch (e) {
      error.value = getCmsErrorMessage(
        e,
        t('ginkoCms.studio.collectionEditor.openTranslationError'),
      )
    } finally {
      saving.value = false
    }
  }

  function setTranslationMode(value: boolean) {
    translationMode.value = value
  }

  function buildSecondaryBodyPatch(): { bodyMdc?: string | null } {
    const richtextField = localizedFields.value.find((field) => field.type === 'richtext')
    if (!richtextField) return {}
    const value = secondaryDataFields[richtextField.key]
    return { bodyMdc: typeof value === 'string' ? value : '' }
  }

  return {
    translationMode,
    secondaryLocale,
    secondaryLastSaved,
    secondaryDataFields,
    secondaryEditorContext,
    secondaryAssetContext,
    setTranslationMode,
    handleSaveSecondaryDraft,
    handleSwitchLocale,
    handleSelectSecondaryLocale,
  }
}
