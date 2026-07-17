import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { api } from '../boundary/api'
import { useCmsConfig } from './useCmsConfig'
import { useConvexQuery } from './useStudioConvex'

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
  const config = useCmsConfig()
  const locale = options.locale ?? config.defaultLocale ?? 'en'
  const limit = options.limit ?? 10
  const collection = computed(() => toValue(options.collection)?.trim() || undefined)
  const trimmedQuery = computed(() => toValue(query)?.trim() ?? '')

  // Inside a collection route, search that collection through the public
  // search surface; elsewhere, span every route-backed collection through the
  // studio-scoped cross-collection query. Only one of the two runs at a time
  // (the other gets null args and is skipped).
  const collectionArgs = computed(() => {
    if (!trimmedQuery.value || !collection.value) return null
    return {
      query: trimmedQuery.value,
      locale,
      collection: collection.value,
      limit,
    }
  })
  const globalArgs = computed(() => {
    if (!trimmedQuery.value || collection.value) return null
    return { query: trimmedQuery.value, locale, limit }
  })

  const collectionSearch = useConvexQuery(api.ginkoCms.public.search, collectionArgs)
  const globalSearch = useConvexQuery(api.ginkoCms.collections.searchStudioEntries, globalArgs)
  const active = computed(() => (collection.value ? collectionSearch : globalSearch))

  return {
    pending: computed(() => active.value.pending.value),
    error: computed(() => active.value.error.value),
    // The public search returns a `GinkoSearchResult` envelope; the studio
    // query returns the result array directly. Expose a plain array either way.
    results: computed<StudioSearchResultItem[]>(() =>
      collection.value
        ? ((collectionSearch.data.value?.results ?? []) as StudioSearchResultItem[])
        : ((globalSearch.data.value ?? []) as StudioSearchResultItem[]),
    ),
  }
}
