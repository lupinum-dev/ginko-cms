import {
  useConvexPaginatedQuery as useBetterConvexPaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
} from 'better-convex-vue'
import type { FunctionArgs } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'

import { cmsPermissionKeys, type CmsPermissionKey } from './permissions'
import { useCmsAuthState } from './useCmsAuthState'
import { useCmsStudioAccess } from './useCmsStudioAccess'
import { normalizeCmsStudioQueryError } from './useCmsStudioQuery'

type CmsStudioPaginatedStatus =
  | 'skipped'
  | 'loading-first-page'
  | 'loading-more'
  | 'ready'
  | 'exhausted'
  | 'error'

type CmsStudioPaginatedQueryOptions<Item, Data> = {
  initialNumItems?: number
  transform?: (results: Item[]) => Data[]
  keepPreviousData?: boolean
  requiredCapability?: CmsPermissionKey
}

type CheckedPaginatedQuery<Query extends PaginatedQueryReference> =
  FunctionArgs<Query> extends { paginationOpts: unknown } ? Query : never

export interface UseCmsStudioPaginatedQueryReturn<Data> {
  results: ComputedRef<Data[]>
  status: ComputedRef<CmsStudioPaginatedStatus>
  isLoading: ComputedRef<boolean>
  isStale: ComputedRef<boolean>
  isExhausted: ComputedRef<boolean>
  hasNextPage: ComputedRef<boolean>
  loadMore: (numItems: number) => void
  error: ComputedRef<Error | null>
  refresh: () => Promise<void>
  reset: () => Promise<void>
}

/** Ginko policy adapter over the single Better Convex pagination controller. */
export function useCmsStudioPaginatedQuery<
  Query extends PaginatedQueryReference,
  Data = PaginatedQueryItem<Query>,
>(
  query: CheckedPaginatedQuery<Query>,
  args: MaybeRefOrGetter<PaginatedQueryArgs<Query> | null | undefined>,
  options: CmsStudioPaginatedQueryOptions<PaginatedQueryItem<Query>, Data>,
): UseCmsStudioPaginatedQueryReturn<Data> {
  const auth = useCmsAuthState()
  const { ready, can } = useCmsStudioAccess()
  const canRead = can(cmsPermissionKeys.read)
  const canRequired = options.requiredCapability
    ? can(options.requiredCapability)
    : computed(() => true)
  const gatedArgs = computed(() => {
    const value = toValue(args)
    if (
      (auth.authEnabled.value && !auth.isAuthenticated.value) ||
      !ready.value ||
      !canRead.value ||
      !canRequired.value
    ) {
      return 'skip' as const
    }
    return value ?? ('skip' as const)
  })
  const result = useBetterConvexPaginatedQuery(query, gatedArgs, {
    auth: 'required',
    initialNumItems: options.initialNumItems,
    transform: options.transform,
    keepPreviousData: options.keepPreviousData,
  })

  return {
    results: result.results,
    status: computed(() => {
      if (gatedArgs.value === 'skip') return 'skipped'
      if (result.error.value) return 'error'
      if (result.isLoading.value && result.results.value.length === 0) return 'loading-first-page'
      if (result.isLoading.value) return 'loading-more'
      if (!result.hasNextPage.value) return 'exhausted'
      return 'ready'
    }),
    isLoading: result.isLoading,
    isStale: result.isStale,
    isExhausted: computed(() => !result.hasNextPage.value && !result.isLoading.value),
    hasNextPage: result.hasNextPage,
    loadMore: result.loadMore,
    error: computed(() =>
      result.error.value ? normalizeCmsStudioQueryError(result.error.value, query) : null,
    ),
    refresh: result.refresh,
    reset: result.reset,
  }
}
