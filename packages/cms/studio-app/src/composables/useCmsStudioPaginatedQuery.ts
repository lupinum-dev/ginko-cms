import type {
  PaginatedQueryArgs,
  PaginatedQueryItem,
  PaginatedQueryReference,
  UseConvexPaginatedQueryOptions,
  UseConvexPaginatedQueryData,
  UseConvexPaginatedQueryReturn,
} from '@lupinum/trellis/composables'
import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  type MaybeRefOrGetter,
  toValue,
  watch,
} from 'vue'

import { useStudioHostContext } from '../boundary/studio-host-context'
import { cmsPermissionKeys, type CmsPermissionKey } from './permissions'
import { useCmsStudioAccess } from './useCmsStudioAccess'
import { normalizeCmsStudioQueryError } from './useCmsStudioQuery'

// Studio-side paginated Convex query helper. It reads the host bridge
// explicitly so the Vite SPA stays independent from Nuxt auto-imports.
export function useCmsStudioPaginatedQuery<
  Query extends PaginatedQueryReference,
  DataT = PaginatedQueryItem<Query>,
>(
  query: Query,
  args: MaybeRefOrGetter<PaginatedQueryArgs<Query> | null | undefined>,
  options: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, DataT> & {
    requiredCapability?: CmsPermissionKey
  },
): UseConvexPaginatedQueryReturn<DataT> {
  const studioHost = useStudioHostContext()
  const { ready, can } = useCmsStudioAccess()
  const canRead = can(cmsPermissionKeys.read)
  const requiredCapability = options.requiredCapability
  const canRequired = requiredCapability ? can(requiredCapability) : computed(() => true)
  const rawResults = shallowRef<PaginatedQueryItem<Query>[]>([])
  const error = ref<Error | null>(null)
  const isLoading = ref(false)
  const isExhausted = ref(true)
  const continueCursor = ref<string | null>(null)
  let unsubscribe: (() => void) | null = null

  const gatedArgs = computed(() => {
    const value = toValue(args)
    if (!ready.value || !canRead.value || !canRequired.value) {
      return null
    }
    return value ?? null
  })

  const { requiredCapability: _requiredCapability, ...queryOptions } = options
  const initialNumItems = queryOptions.initialNumItems
  const transform = (items: PaginatedQueryItem<Query>[]): DataT[] =>
    queryOptions.transform ? queryOptions.transform(items) : (items as unknown as DataT[])

  const pageArgs = (cursor: string | null, numItems: number) =>
    ({
      ...(gatedArgs.value as Record<string, unknown>),
      paginationOpts: { cursor, numItems },
    }) as PaginatedQueryArgs<Query>

  const start = () => {
    unsubscribe?.()
    unsubscribe = null
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
      pageArgs(null, initialNumItems),
      (page: {
        page: PaginatedQueryItem<Query>[]
        isDone: boolean
        continueCursor: string | null
      }) => {
        rawResults.value = page.page
        continueCursor.value = page.continueCursor
        isExhausted.value = page.isDone
        error.value = null
        isLoading.value = false
      },
      (err: unknown) => {
        error.value = normalizeCmsStudioQueryError(err, query)
        isLoading.value = false
      },
    )
  }

  const stop = watch(gatedArgs, start, { immediate: true, deep: true })
  onScopeDispose(() => {
    stop()
    unsubscribe?.()
    unsubscribe = null
  })

  const loadMore = (numItems: number) => {
    const cursor = continueCursor.value
    const convex = studioHost.getConvexClient()
    if (!convex || gatedArgs.value == null || !cursor) return
    isLoading.value = true
    void convex
      .query(query, pageArgs(cursor, numItems))
      .then(
        (page: {
          page: PaginatedQueryItem<Query>[]
          isDone: boolean
          continueCursor: string | null
        }) => {
          rawResults.value = [...rawResults.value, ...page.page]
          continueCursor.value = page.continueCursor
          isExhausted.value = page.isDone
          error.value = null
        },
      )
      .catch((err: unknown) => {
        error.value = normalizeCmsStudioQueryError(err, query)
      })
      .finally(() => {
        isLoading.value = false
      })
  }

  const refresh = async () => start()

  const resultData: UseConvexPaginatedQueryData<DataT> = {
    results: computed(() => transform(rawResults.value)),
    status: computed(() => {
      if (gatedArgs.value == null) return 'skipped'
      if (error.value) return 'error'
      if (isLoading.value && rawResults.value.length === 0) return 'loading-first-page'
      if (isLoading.value) return 'loading-more'
      if (isExhausted.value) return 'exhausted'
      return 'ready'
    }),
    isLoading: computed(() => isLoading.value),
    isStale: computed(() => false),
    isExhausted: computed(() => isExhausted.value),
    hasNextPage: computed(() => rawResults.value.length > 0 && !isExhausted.value),
    loadMore,
    error,
    refresh,
    reset: refresh,
  }

  const result = resultData as UseConvexPaginatedQueryReturn<DataT>

  result.then = <TResult1 = UseConvexPaginatedQueryData<DataT>, TResult2 = never>(
    onFulfilled?:
      | ((value: UseConvexPaginatedQueryData<DataT>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise.resolve(resultData).then(onFulfilled, onRejected)

  return result
}
