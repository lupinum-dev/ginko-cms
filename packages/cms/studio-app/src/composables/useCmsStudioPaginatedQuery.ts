import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  toValue,
  watch,
} from 'vue'

import { useStudioHostContext } from '../boundary/studio-host-context'
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

type UseCmsStudioPaginatedQueryData<DataT, PageDataT> = {
  results: ComputedRef<DataT[]>
  pageData: ComputedRef<PageDataT | null>
  status: ComputedRef<CmsStudioPaginatedStatus>
  isLoading: ComputedRef<boolean>
  isStale: ComputedRef<boolean>
  isExhausted: ComputedRef<boolean>
  hasNextPage: ComputedRef<boolean>
  loadMore: (numItems: number) => void
  error: Ref<Error | null>
  refresh: () => Promise<void>
  reset: () => Promise<void>
}

type UseCmsStudioPaginatedQueryReturn<DataT, PageDataT> = UseCmsStudioPaginatedQueryData<
  DataT,
  PageDataT
>

type PaginatedQueryArgs<Query extends FunctionReference<'query'>> = Omit<
  FunctionArgs<Query>,
  'paginationOpts'
>

type PaginatedQueryItem<Query extends FunctionReference<'query'>> =
  FunctionReturnType<Query> extends { page: Array<infer Item> } ? Item : never

type PaginatedQueryPageData<Query extends FunctionReference<'query'>> = Omit<
  FunctionReturnType<Query>,
  'page' | 'isDone' | 'continueCursor'
>

type CmsStudioPaginatedQueryOptions<Item, DataT> = {
  initialNumItems?: number
  transform?: (results: Item[]) => DataT[]
  keepPreviousData?: boolean
  requiredCapability?: CmsPermissionKey
}

// Studio-side paginated Convex query helper. It reads the host bridge
// explicitly so the Vite SPA stays independent from Nuxt auto-imports.
export function useCmsStudioPaginatedQuery<
  Query extends FunctionReference<'query'>,
  DataT = PaginatedQueryItem<Query>,
>(
  query: Query,
  args: MaybeRefOrGetter<PaginatedQueryArgs<Query> | null | undefined>,
  options: CmsStudioPaginatedQueryOptions<PaginatedQueryItem<Query>, DataT>,
): UseCmsStudioPaginatedQueryReturn<DataT, PaginatedQueryPageData<Query>> {
  const studioHost = useStudioHostContext()
  const auth = useCmsAuthState()
  const { ready, can } = useCmsStudioAccess()
  const canRead = can(cmsPermissionKeys.read)
  const requiredCapability = options.requiredCapability
  const canRequired = requiredCapability ? can(requiredCapability) : computed(() => true)
  const rawResults = shallowRef<PaginatedQueryItem<Query>[]>([])
  const rawPageData = shallowRef<PaginatedQueryPageData<Query> | null>(null)
  const error = ref<Error | null>(null)
  const isLoading = ref(false)
  const isRefreshingTail = ref(false)
  const isExhausted = ref(true)
  const continueCursor = ref<string | null>(null)
  const loadedTailPageSizes: number[] = []
  let unsubscribe: (() => void) | null = null
  let requestGeneration = 0
  let subscriptionGeneration = 0
  let disposed = false
  let inFlightCursor: string | null = null
  let lastPrincipalKey: string | null = null

  const gatedArgs = computed(() => {
    const value = toValue(args)
    if (auth.pending.value || !ready.value || !canRead.value || !canRequired.value) {
      return null
    }
    return value ?? null
  })

  const { requiredCapability: _requiredCapability, ...queryOptions } = options
  const initialNumItems = queryOptions.initialNumItems ?? 50
  const transform = (items: PaginatedQueryItem<Query>[]): DataT[] =>
    queryOptions.transform ? queryOptions.transform(items) : (items as unknown as DataT[])
  const extractPageData = (page: FunctionReturnType<Query>): PaginatedQueryPageData<Query> => {
    const { page: _page, isDone: _isDone, continueCursor: _continueCursor, ...pageData } = page
    return pageData
  }

  const operationInput = computed(() => ({
    args: gatedArgs.value,
    principalKey: auth.principalKey.value,
  }))

  const pageArgs = (
    baseArgs: PaginatedQueryArgs<Query>,
    cursor: string | null,
    numItems: number,
  ) => ({
    ...baseArgs,
    paginationOpts: { cursor, numItems },
  })

  /**
   * Rebuilds the already-visible tail after the live first page changes.
   *
   * Keeping the old tail would lose or duplicate rows whenever an insertion
   * moves an item across the first cursor boundary. Replaying the same page
   * sizes from the new cursor keeps the visible window internally consistent
   * while retaining a single live subscription.
   */
  const refreshLoadedTail = async (
    firstPage: PaginatedQueryItem<Query>[],
    firstCursor: string | null,
    pageSizes: number[],
    generation: number,
    principalKey: string,
    baseArgs: PaginatedQueryArgs<Query>,
  ) => {
    const convex = studioHost.getConvexClient()
    if (!convex || pageSizes.length === 0) return

    isRefreshingTail.value = true
    let cursor = firstCursor
    let isDone = cursor == null
    const refreshedResults = [...firstPage]

    try {
      for (const numItems of pageSizes) {
        if (
          disposed ||
          generation !== requestGeneration ||
          principalKey !== auth.principalKey.value
        )
          return
        if (!cursor) break
        const page = await convex.query(query, pageArgs(baseArgs, cursor, numItems))
        if (
          disposed ||
          generation !== requestGeneration ||
          principalKey !== auth.principalKey.value
        )
          return
        refreshedResults.push(...page.page)
        cursor = page.continueCursor
        isDone = page.isDone
      }

      if (disposed || principalKey !== auth.principalKey.value) return
      rawResults.value = refreshedResults
      continueCursor.value = cursor
      isExhausted.value = isDone
      error.value = null
    } catch (err: unknown) {
      if (
        !disposed &&
        generation === requestGeneration &&
        principalKey === auth.principalKey.value
      ) {
        error.value = normalizeCmsStudioQueryError(err, query)
      }
    } finally {
      if (
        !disposed &&
        generation === requestGeneration &&
        principalKey === auth.principalKey.value
      ) {
        isRefreshingTail.value = false
      }
    }
  }

  const start = () => {
    if (disposed) return
    requestGeneration += 1
    const currentSubscription = ++subscriptionGeneration
    const { args: baseArgs, principalKey } = operationInput.value
    unsubscribe?.()
    unsubscribe = null
    inFlightCursor = null
    loadedTailPageSizes.length = 0
    const principalChanged = lastPrincipalKey !== null && lastPrincipalKey !== principalKey
    lastPrincipalKey = principalKey
    rawResults.value = queryOptions.keepPreviousData && !principalChanged ? rawResults.value : []
    rawPageData.value =
      queryOptions.keepPreviousData && !principalChanged ? rawPageData.value : null
    continueCursor.value = null

    if (baseArgs == null) {
      error.value = null
      isLoading.value = false
      isExhausted.value = true
      return
    }

    const convex = studioHost.getConvexClient()
    if (!convex) {
      error.value = null
      isLoading.value = true
      return
    }

    error.value = null
    isLoading.value = true
    unsubscribe = convex.onUpdate(
      query,
      pageArgs(baseArgs, null, initialNumItems),
      (page) => {
        if (
          disposed ||
          currentSubscription !== subscriptionGeneration ||
          principalKey !== auth.principalKey.value
        )
          return
        requestGeneration += 1
        const nextGeneration = requestGeneration
        inFlightCursor = null
        isRefreshingTail.value = false
        const tailPageSizes = [...loadedTailPageSizes]
        rawResults.value = page.page
        rawPageData.value = extractPageData(page)
        continueCursor.value = page.continueCursor
        isExhausted.value = page.isDone
        error.value = null
        isLoading.value = false
        void refreshLoadedTail(
          page.page,
          page.continueCursor,
          tailPageSizes,
          nextGeneration,
          principalKey,
          baseArgs,
        )
      },
      (err: unknown) => {
        if (
          disposed ||
          currentSubscription !== subscriptionGeneration ||
          principalKey !== auth.principalKey.value
        )
          return
        error.value = normalizeCmsStudioQueryError(err, query)
        isLoading.value = false
      },
    )
  }

  const stop = watch(operationInput, start, { immediate: true, deep: true })
  onScopeDispose(() => {
    disposed = true
    requestGeneration += 1
    subscriptionGeneration += 1
    stop()
    unsubscribe?.()
    unsubscribe = null
    inFlightCursor = null
    rawResults.value = []
    rawPageData.value = null
    continueCursor.value = null
    error.value = null
    isLoading.value = false
    isExhausted.value = true
    isRefreshingTail.value = false
  })

  const loadMore = (numItems: number) => {
    if (disposed) return
    const cursor = continueCursor.value
    const convex = studioHost.getConvexClient()
    const { args: baseArgs, principalKey } = operationInput.value
    if (!convex || baseArgs == null || !cursor || inFlightCursor === cursor) return
    const generation = requestGeneration
    inFlightCursor = cursor
    isLoading.value = true
    void convex
      .query(query, pageArgs(baseArgs, cursor, numItems))
      .then((page) => {
        if (
          disposed ||
          generation !== requestGeneration ||
          principalKey !== auth.principalKey.value
        )
          return
        rawResults.value = [...rawResults.value, ...page.page]
        loadedTailPageSizes.push(numItems)
        continueCursor.value = page.continueCursor
        isExhausted.value = page.isDone
        error.value = null
      })
      .catch((err: unknown) => {
        if (
          !disposed &&
          generation === requestGeneration &&
          principalKey === auth.principalKey.value
        ) {
          error.value = normalizeCmsStudioQueryError(err, query)
        }
      })
      .finally(() => {
        if (
          !disposed &&
          generation === requestGeneration &&
          principalKey === auth.principalKey.value
        ) {
          inFlightCursor = null
          isLoading.value = false
        }
      })
  }

  const refresh = async () => {
    if (disposed) return
    start()
  }

  const resultData: UseCmsStudioPaginatedQueryData<DataT, PaginatedQueryPageData<Query>> = {
    results: computed(() => (disposed ? [] : transform(rawResults.value))),
    pageData: computed(() => (disposed ? null : rawPageData.value)),
    status: computed(() => {
      if (gatedArgs.value == null) return 'skipped'
      if (error.value) return 'error'
      if (isLoading.value && rawResults.value.length === 0) return 'loading-first-page'
      if (isLoading.value || isRefreshingTail.value) return 'loading-more'
      if (isExhausted.value) return 'exhausted'
      return 'ready'
    }),
    isLoading: computed(() => isLoading.value || isRefreshingTail.value),
    isStale: computed(() => isRefreshingTail.value),
    isExhausted: computed(() => isExhausted.value),
    // Server-side work/readiness filters can legitimately yield an empty
    // candidate page while still advancing an indexed cursor. The cursor, not
    // the visible row count, is the authority for whether more work exists.
    hasNextPage: computed(() => continueCursor.value !== null && !isExhausted.value),
    loadMore,
    error,
    refresh,
    reset: refresh,
  }

  return resultData
}
