import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { api } from '../boundary/api'
import { useCmsConfig } from './useCmsConfig'
import { useConvexQuery } from './useStudioConvex'

// Studio-local search helper for the command palette.

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

  const args = computed(() => {
    const q = toValue(query)?.trim() ?? ''
    if (!q || !collection.value) return null
    return {
      query: q,
      locale,
      collection: collection.value,
      limit,
    }
  })

  const searchQuery = useConvexQuery(api.ginkoCms.public.search, args)

  return {
    ...searchQuery,
    // Expose a compact result ref so command palette callers do not repeat
    // `data.value ?? []`.
    results: computed(() => searchQuery.data?.value ?? []),
  }
}
