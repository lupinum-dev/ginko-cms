import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from 'convex/server'
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

type UseCmsStudioPaginatedQueryReturn<DataT> = UseCmsStudioPaginatedQueryData<DataT> &
  PromiseLike<UseCmsStudioPaginatedQueryData<DataT>>

type PaginatedQueryReference = FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  PaginationResult<unknown>
>

type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<
  FunctionArgs<Query>,
  'paginationOpts'
>

type PaginatedQueryItem<Query extends PaginatedQueryReference> =
  FunctionReturnType<Query>['page'][number]

type CmsStudioPaginatedQueryOptions<Item, DataT> = {
  initialNumItems?: number
  transform?: (results: Item[]) => DataT[]
  keepPreviousData?: boolean
  requiredCapability?: CmsPermissionKey
}

// Studio-side paginated Convex query helper. It reads the host bridge
// explicitly so the Vite SPA stays independent from Nuxt auto-imports.
export function useCmsStudioPaginatedQuery<
  Query extends PaginatedQueryReference,
  DataT = PaginatedQueryItem<Query>,
>(
  query: Query,
  args: MaybeRefOrGetter<PaginatedQueryArgs<Query> | null | undefined>,
  options: CmsStudioPaginatedQueryOptions<PaginatedQueryItem<Query>, DataT>,
): UseCmsStudioPaginatedQueryReturn<DataT> {
  const studioHost = useStudioHostContext()
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

  const gatedArgs = computed(() => {
    const value = toValue(args)
    if (!ready.value || !canRead.value || !canRequired.value) {
      return null
    }
    return value ?? null
  })

  const { requiredCapability: _requiredCapability, ...queryOptions } = options
  const initialNumItems = queryOptions.initialNumItems ?? 50
  const transform = (items: PaginatedQueryItem<Query>[]): DataT[] =>
    queryOptions.transform ? queryOptions.transform(items) : (items as unknown as DataT[])

  const pageArgs = (cursor: string | null, numItems: number) =>
    ({
      ...(gatedArgs.value as Record<string, unknown>),
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
  ) => {
    const convex = studioHost.getConvexClient()
    if (!convex || pageSizes.length === 0) return

    isRefreshingTail.value = true
    let cursor = firstCursor
    let isDone = cursor == null
    const refreshedResults = [...firstPage]

    try {
      for (const numItems of pageSizes) {
        if (generation !== requestGeneration) return
        if (!cursor) break
        const page = (await convex.query(query, pageArgs(cursor, numItems) as never)) as {
          page: PaginatedQueryItem<Query>[]
          isDone: boolean
          continueCursor: string | null
        }
        if (generation !== requestGeneration) return
        refreshedResults.push(...page.page)
        cursor = page.continueCursor
        isDone = page.isDone
      }

      rawResults.value = refreshedResults
      continueCursor.value = cursor
      isExhausted.value = isDone
      error.value = null
    } catch (err: unknown) {
      if (generation === requestGeneration) {
        error.value = normalizeCmsStudioQueryError(err, query)
      }
    } finally {
      if (generation === requestGeneration) {
        isRefreshingTail.value = false
      }
    }
  }

  const start = () => {
    requestGeneration += 1
    unsubscribe?.()
    unsubscribe = null
    loadedTailPageSizes.length = 0
    rawResults.value = queryOptions.keepPreviousData ? rawResults.value : []
    continueCursor.value = null

    const baseArgs = gatedArgs.value
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
      pageArgs(null, initialNumItems) as never,
      (page: {
        page: PaginatedQueryItem<Query>[]
        isDone: boolean
        continueCursor: string | null
      }) => {
        requestGeneration += 1
        const generation = requestGeneration
        const tailPageSizes = [...loadedTailPageSizes]
        rawResults.value = page.page
        continueCursor.value = page.continueCursor
        isExhausted.value = page.isDone
        error.value = null
        isLoading.value = false
        void refreshLoadedTail(page.page, page.continueCursor, tailPageSizes, generation)
      },
      (err: unknown) => {
        error.value = normalizeCmsStudioQueryError(err, query)
        isLoading.value = false
      },
    )
  }

  const stop = watch(gatedArgs, start, { immediate: true, deep: true })
  onScopeDispose(() => {
    requestGeneration += 1
    stop()
    unsubscribe?.()
    unsubscribe = null
    isRefreshingTail.value = false
  })

  const loadMore = (numItems: number) => {
    const cursor = continueCursor.value
    const convex = studioHost.getConvexClient()
    if (!convex || gatedArgs.value == null || !cursor) return
    const generation = requestGeneration
    isLoading.value = true
    void convex
      .query(query, pageArgs(cursor, numItems) as never)
      .then(
        (page: {
          page: PaginatedQueryItem<Query>[]
          isDone: boolean
          continueCursor: string | null
        }) => {
          if (generation !== requestGeneration) return
          rawResults.value = [...rawResults.value, ...page.page]
          loadedTailPageSizes.push(numItems)
          continueCursor.value = page.continueCursor
          isExhausted.value = page.isDone
          error.value = null
        },
      )
      .catch((err: unknown) => {
        if (generation === requestGeneration) {
          error.value = normalizeCmsStudioQueryError(err, query)
        }
      })
      .finally(() => {
        if (generation === requestGeneration) {
          isLoading.value = false
        }
      })
  }

  const refresh = async () => start()

  const resultData: UseCmsStudioPaginatedQueryData<DataT> = {
    results: computed(() => transform(rawResults.value)),
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

  const result = resultData as UseCmsStudioPaginatedQueryReturn<DataT>

  result.then = <TResult1 = UseCmsStudioPaginatedQueryData<DataT>, TResult2 = never>(
    onFulfilled?:
      | ((value: UseCmsStudioPaginatedQueryData<DataT>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise.resolve(resultData).then(onFulfilled, onRejected)

  return result
}
