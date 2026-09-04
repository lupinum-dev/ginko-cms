import type { CollectionMode, JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import { computed, reactive, ref, watch } from 'vue'

import { api } from '../../boundary/api'
import { readLocaleText, type StudioCollectionListItem } from '../../lib/installedCollections'
import { useCmsI18n } from '../useCmsI18n'
import { useCmsStudioAccess } from '../useCmsStudioAccess'
import { useCmsStudioQuery } from '../useCmsStudioQuery'
import { useCmsStudioSettings } from '../useCmsStudioSettings'
import type { StudioCollectionConfig, StudioField } from './types'

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function useStudioCollectionsAdmin() {
  useCmsStudioAccess()

  const collectionsQuery = useCmsStudioQuery(api.ginkoCms.collections.listCollections, {})
  const studioSettings = useCmsStudioSettings()
  const defaultLocale = computed(() => studioSettings.defaultLocale.value)
  const collections = computed<StudioCollectionListItem[]>(() => {
    const fromConvex =
      (collectionsQuery.data?.value as StudioCollectionListItem[] | undefined) ?? []
    return fromConvex
  })

  const selectedCollection = ref<string | null>(null)
  const selectedFieldKey = ref<string | null>(null)
  const error = computed(() => collectionsQuery.error.value?.message ?? '')
  const collectionDraft = reactive<{
    id: string
    label: string
    pathPrefix: string
    icon: string
    singleton: boolean
    localized: string
    maxDepth: string
    mode: CollectionMode
  }>({
    id: '',
    label: '',
    pathPrefix: '/',
    icon: '',
    singleton: false,
    localized: '',
    maxDepth: '',
    mode: 'route',
  })
  const { t } = useCmsI18n()

  const selectedCollectionArgs = computed(() =>
    selectedCollection.value ? { slug: selectedCollection.value } : ('skip' as const),
  )
  const {
    data: collectionDetail,
    error: collectionDetailError,
    pending: collectionDetailPending,
  } = useCmsStudioQuery(api.ginkoCms.collections.getCollection, selectedCollectionArgs)
  const selectedCollectionDetail = computed<StudioCollectionConfig | null>(
    () => (collectionDetail.value as StudioCollectionConfig | null | undefined) ?? null,
  )
  const collectionFields = computed<StudioField[]>(
    () => selectedCollectionDetail.value?.fields ?? [],
  )
  const collectionFieldItems = computed(() =>
    collectionFields.value.map((field) => ({
      ...field,
      label: readLocaleText(field.label, defaultLocale.value) || field.key,
    })),
  )

  watch(
    collections,
    (items) => {
      const slugs = items.map((item) => item.slug)
      if (!slugs.length) {
        selectedCollection.value = null
        return
      }
      if (!selectedCollection.value || !slugs.includes(selectedCollection.value)) {
        selectedCollection.value = slugs[0] ?? null
      }
    },
    { immediate: true },
  )

  watch(
    selectedCollectionDetail,
    (collection) => {
      if (typeof window !== 'undefined' && import.meta.dev) {
        console.debug('[ginko-cms] collection detail changed', {
          selectedCollection: selectedCollection.value,
          hasDetail: !!collection,
          slug: collection?.slug ?? null,
        })
      }
      if (!collection) {
        selectedFieldKey.value = null
        return
      }
      const settings = isJsonObject(collection.settings) ? collection.settings : null
      collectionDraft.id = collection._id
      collectionDraft.label =
        readLocaleText(collection.labelMap, defaultLocale.value) ||
        readLocaleText(collection.label, defaultLocale.value)
      collectionDraft.pathPrefix = collection.pathPrefix ?? '/'
      collectionDraft.mode = collection.mode ?? collection.routing?.mode ?? 'route'
      collectionDraft.icon = collection.icon ?? ''
      collectionDraft.singleton = !!collection.singleton
      collectionDraft.localized = Array.isArray(collection.locales)
        ? collection.locales.join(', ')
        : ''
      collectionDraft.maxDepth =
        typeof settings?.maxDepth === 'number' ? String(settings.maxDepth) : ''
      const fields = collection.fields ?? []
      if (!fields.some((field) => field.key === selectedFieldKey.value)) {
        selectedFieldKey.value = fields[0]?.key ?? null
      }
    },
    { immediate: true },
  )

  watch(
    [collections, selectedCollection],
    ([items, current]) => {
      if (typeof window !== 'undefined' && import.meta.dev) {
        console.debug('[ginko-cms] collections inspector state', {
          collectionCount: items.length,
          collectionSlugs: items.map((item) => item.slug),
          selectedCollection: current,
          source: 'installed-contract',
        })
      }
    },
    { immediate: true },
  )

  const isLoading = computed(() => !collectionsQuery.data?.value && collectionsQuery.pending.value)

  return {
    collectionDetail: selectedCollectionDetail,
    collectionDetailError,
    collectionDetailPending,
    collectionDraft,
    collectionFields,
    collectionFieldItems,
    collections,
    defaultLocale,
    error,
    isLoading,
    selectedCollection,
    selectedFieldKey,
    studioSettings,
    t,
  }
}
