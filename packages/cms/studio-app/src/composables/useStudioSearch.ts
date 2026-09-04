import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { api } from '../boundary/api'
import { useCmsStudioQuery } from './useCmsStudioQuery'
import { useCmsStudioSettings } from './useCmsStudioSettings'

// Studio-local search helper for the command palette.

/** Shape shared by both search backends; all the palette needs to render. */
export interface StudioSearchResultItem {
  id: string
  title?: string | null
  collection: string
  route: { slug: string; href: string }
}

export interface UseStudioSearchOptions {
  collection?: MaybeRefOrGetter<string | undefined>
  locale?: string
  limit?: number
}

export function useStudioSearch(
  query: MaybeRefOrGetter<string>,
  options: UseStudioSearchOptions = {},
) {
  const studioSettings = useCmsStudioSettings()
  const locale = computed(() => options.locale ?? studioSettings.defaultLocale.value)
  const limit = options.limit ?? 10
  const collection = computed(() => toValue(options.collection)?.trim() || undefined)
  const trimmedQuery = computed(() => toValue(query)?.trim() ?? '')

  const searchArgs = computed(() =>
    trimmedQuery.value
      ? {
          query: trimmedQuery.value,
          locale: locale.value,
          collection: collection.value,
          limit,
        }
      : ('skip' as const),
  )
  const search = useCmsStudioQuery(api.ginkoCms.collections.searchStudioEntries, searchArgs)

  return {
    pending: computed(() => search.pending.value),
    error: computed(() => search.error.value),
    results: computed<StudioSearchResultItem[]>(
      () => (search.data.value ?? []) as StudioSearchResultItem[],
    ),
  }
}
