import {
  useConvexPaginatedQuery as useBetterConvexPaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
} from '@lupinum/better-convex-vue'
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

type CmsStudioPaginatedQueryOptions = {
  initialNumItems: number
  keepPreviousData?: boolean
  requiredCapability?: CmsPermissionKey
}

export interface UseCmsStudioPaginatedQueryReturn<Data> {
  data: ComputedRef<readonly Data[] | undefined>
  status: ComputedRef<CmsStudioPaginatedStatus>
  pending: ComputedRef<boolean>
  isStale: ComputedRef<boolean>
  canLoadMore: ComputedRef<boolean>
  loadMore: (numItems: number) => void
  error: ComputedRef<Error | null>
  refresh: () => Promise<void>
}

/** Ginko policy adapter over the single Better Convex pagination controller. */
export function useCmsStudioPaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: MaybeRefOrGetter<PaginatedQueryArgs<Query> | 'skip'>,
  options: CmsStudioPaginatedQueryOptions,
): UseCmsStudioPaginatedQueryReturn<PaginatedQueryItem<Query>> {
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
    return value
  })
  const result = useBetterConvexPaginatedQuery(query, gatedArgs, {
    auth: 'required',
    initialNumItems: options.initialNumItems,
    keepPreviousData: options.keepPreviousData,
  })

  return {
    data: result.data,
    status: computed(() => {
      if (gatedArgs.value === 'skip') return 'skipped'
      if (result.error.value) return 'error'
      if (result.pending.value && (result.data.value?.length ?? 0) === 0) {
        return 'loading-first-page'
      }
      if (result.pending.value) return 'loading-more'
      if (!result.canLoadMore.value) return 'exhausted'
      return 'ready'
    }),
    pending: result.pending,
    isStale: result.isStale,
    canLoadMore: result.canLoadMore,
    loadMore: result.loadMore,
    error: computed(() =>
      result.error.value ? normalizeCmsStudioQueryError(result.error.value, query) : null,
    ),
    refresh: result.refresh,
  }
}
