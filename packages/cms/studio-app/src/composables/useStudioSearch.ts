import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { api } from '../boundary/api'
import { useCmsConfig } from './useCmsConfig'
import { useConvexQuery } from './useStudioConvex'

// Studio-local search helper for the command palette.

export interface UseStudioSearchOptions {
  collections?: string[]
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
  const collections = options.collections?.length
    ? Array.from(new Set(options.collections))
    : undefined

  const args = computed(() => {
    const q = toValue(query)?.trim() ?? ''
    if (!q) return null
    return {
      query: q,
      locale,
      ...(collections ? { collections } : {}),
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
