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

type UseCmsStudioPaginatedQueryData<DataT> = {
  results: ComputedRef<DataT[]>
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

type UseCmsStudioPaginatedQueryReturn<DataT> = UseCmsStudioPaginatedQueryData<DataT>

type PaginatedQueryArgs<Query extends FunctionReference<'query'>> = Omit<
  FunctionArgs<Query>,
  'paginationOpts'
>

type PaginatedQueryItem<Query extends FunctionReference<'query'>> =
  FunctionReturnType<Query> extends { page: Array<infer Item> } ? Item : never

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
): UseCmsStudioPaginatedQueryReturn<DataT> {
  const studioHost = useStudioHostContext()
  const auth = useCmsAuthState()
  const { ready, can } = useCmsStudioAccess()
  const canRead = can(cmsPermissionKeys.read)
  const requiredCapability = options.requiredCapability
  const canRequired = requiredCapability ? can(requiredCapability) : computed(() => true)
  const rawResults = shallowRef<PaginatedQueryItem<Query>[]>([])
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

  const operationInput = computed(() => ({
    args: gatedArgs.value,
    principalKey: auth.principalKey.value,
  }))

  const pageArgs = (baseArgs: PaginatedQueryArgs<Query>, cursor: string | null, numItems: number) =>
    ({
      ...(baseArgs as Record<string, unknown>),
      paginationOpts: { cursor, numItems },
    }) as PaginatedQueryArgs<Query>

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
        const page = (await convex.query(query, pageArgs(baseArgs, cursor, numItems) as never)) as {
          page: PaginatedQueryItem<Query>[]
          isDone: boolean
          continueCursor: string | null
        }
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
      pageArgs(baseArgs as PaginatedQueryArgs<Query>, null, initialNumItems) as never,
      (page: {
        page: PaginatedQueryItem<Query>[]
        isDone: boolean
        continueCursor: string | null
      }) => {
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
          baseArgs as PaginatedQueryArgs<Query>,
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
      .query(query, pageArgs(baseArgs as PaginatedQueryArgs<Query>, cursor, numItems) as never)
      .then(
        (page: {
          page: PaginatedQueryItem<Query>[]
          isDone: boolean
          continueCursor: string | null
        }) => {
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
        },
      )
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

  const resultData: UseCmsStudioPaginatedQueryData<DataT> = {
    results: computed(() => (disposed ? [] : transform(rawResults.value))),
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
    hasNextPage: computed(() => rawResults.value.length > 0 && !isExhausted.value),
    loadMore,
    error,
    refresh,
    reset: refresh,
  }

  return resultData
}
