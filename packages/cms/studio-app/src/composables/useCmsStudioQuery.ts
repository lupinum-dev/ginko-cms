import { classifyGinkoError, type GinkoErrorCategory } from '@public/error-classification'
import { normalizeConvexError } from 'better-convex-nuxt/errors'
import { getFunctionName } from 'convex/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import {
  computed,
  onScopeDispose,
  ref,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  toValue,
  watch,
} from 'vue'

import { useStudioHostContext } from '../boundary/studio-host-context'
import { cmsPermissionKeys, type CmsPermissionKey } from './permissions'
import { useCmsStudioAccess } from './useCmsStudioAccess'

type CmsStudioQueryErrorCategory = GinkoErrorCategory
export type CmsStudioOperation = 'query' | 'mutation' | 'action' | 'upload'

type CmsStudioQueryStatus = 'skipped' | 'pending' | 'success' | 'error'

export type UseCmsStudioQueryData<DataT> = {
  data: ComputedRef<DataT | null>
  error: Ref<Error | null>
  refresh: () => Promise<void>
  clear: () => void
  pending: ComputedRef<boolean>
  status: ComputedRef<CmsStudioQueryStatus>
  isStale: ComputedRef<boolean>
}

export type UseCmsStudioQueryReturn<DataT> = UseCmsStudioQueryData<DataT> &
  PromiseLike<UseCmsStudioQueryData<DataT>>

type CmsStudioQueryOptions<RawT, DataT> = {
  transform?: (input: RawT) => DataT
  keepPreviousData?: boolean
  requiredCapability?: CmsPermissionKey
}

function safeFunctionName(query: unknown): string {
  try {
    return getFunctionName(query as never)
  } catch {
    return 'unknown'
  }
}

/**
 * Ginko's product-level classification (vNext §10.8). This operates only on
 * `normalized.data` — the structured payload the library preserved verbatim
 * from a Convex application error — never on raw message text.
 */
export class CmsStudioQueryError extends Error {
  readonly isCmsStudioQueryError = true as const
  readonly operation: CmsStudioOperation
  readonly functionPath: string
  readonly code?: string
  readonly status?: number
  readonly category: CmsStudioQueryErrorCategory
  readonly data?: unknown

  constructor(
    message: string,
    init: {
      cause: unknown
      operation: CmsStudioOperation
      functionPath: string
      code?: string
      status?: number
      category: CmsStudioQueryErrorCategory
      data?: unknown
    },
  ) {
    super(message, { cause: init.cause })
    this.name = 'CmsStudioQueryError'
    this.operation = init.operation
    this.functionPath = init.functionPath
    this.code = init.code
    this.status = init.status
    this.category = init.category
    this.data = init.data
  }
}

export function normalizeCmsStudioQueryError(
  error: unknown,
  query: unknown,
  operation: CmsStudioOperation = 'query',
): CmsStudioQueryError {
  if (error instanceof CmsStudioQueryError) return error

  // The library owns transport/server/unknown shape (kind, code, status, data
  // preserved verbatim); Ginko owns conflict/not-found/rate-limit/authorization/
  // workflow meaning on top of it (vNext §10.8).
  const normalized = normalizeConvexError(error)
  const category: CmsStudioQueryErrorCategory =
    normalized.kind === 'authentication'
      ? 'auth'
      : normalized.kind === 'transport'
        ? 'network'
        : normalized.kind === 'server'
          ? (classifyGinkoError(normalized.data, {
              code: normalized.code,
              status: normalized.status,
            }) ?? 'server')
          : 'unknown'

  return new CmsStudioQueryError(normalized.message, {
    cause: normalized.cause,
    operation,
    functionPath: safeFunctionName(query),
    code: normalized.code,
    status: normalized.status,
    category,
    data: normalized.data,
  })
}

// Studio-side Convex query helper. It reads the host bridge explicitly so the
// Vite SPA stays independent from Nuxt auto-imports.
export function useCmsStudioQuery<
  Query extends FunctionReference<'query'>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<FunctionArgs<Query> | null | undefined>,
  options?: CmsStudioQueryOptions<FunctionReturnType<Query>, DataT>,
): UseCmsStudioQueryReturn<DataT> {
  const studioHost = useStudioHostContext()
  const { ready, can } = useCmsStudioAccess()
  const canRead = can(cmsPermissionKeys.read)
  const requiredCapability = options?.requiredCapability
  const canRequired = requiredCapability ? can(requiredCapability) : computed(() => true)
  const data = ref<DataT | null>(null)
  const error = ref<Error | null>(null)
  const pending = ref(false)
  const isStale = ref(false)
  let unsubscribe: (() => void) | null = null

  const gatedArgs = computed(() => {
    const value = toValue(args)
    if (!ready.value || !canRead.value || !canRequired.value) {
      return null
    }
    return value ?? null
  })

  const { requiredCapability: _requiredCapability, ...queryOptions } = options ?? {}
  const applyTransform = (raw: FunctionReturnType<Query>): DataT =>
    queryOptions.transform ? queryOptions.transform(raw) : (raw as unknown as DataT)

  const start = () => {
    unsubscribe?.()
    unsubscribe = null

    const nextArgs = gatedArgs.value as FunctionArgs<Query> | null | undefined
    if (nextArgs == null) {
      error.value = null
      pending.value = false
      isStale.value = false
      if (!queryOptions.keepPreviousData) data.value = null
      return
    }

    const convex = studioHost.getConvexClient()
    if (!convex) {
      if (!queryOptions.keepPreviousData) data.value = null
      error.value = new Error(
        'Studio query host is unavailable. Refresh after the Studio host finishes loading.',
      )
      pending.value = false
      isStale.value = false
      return
    }

    pending.value = true
    isStale.value = Boolean(queryOptions.keepPreviousData && data.value !== null)
    unsubscribe = convex.onUpdate(
      query,
      nextArgs,
      (raw: FunctionReturnType<Query>) => {
        data.value = applyTransform(raw)
        error.value = null
        pending.value = false
        isStale.value = false
      },
      (err: unknown) => {
        error.value = normalizeCmsStudioQueryError(err, query)
        pending.value = false
        isStale.value = false
      },
    )
  }

  const stop = watch(gatedArgs, start, { immediate: true, deep: true })
  onScopeDispose(() => {
    stop()
    unsubscribe?.()
    unsubscribe = null
  })

  const refresh = async () => {
    error.value = null
    start()
  }

  const resultData: UseCmsStudioQueryData<DataT> = {
    data: computed(() => data.value),
    error,
    refresh,
    clear: () => {
      data.value = null
      error.value = null
    },
    pending: computed(() => pending.value),
    status: computed(() => {
      if (gatedArgs.value == null) return 'skipped'
      if (error.value) return 'error'
      if (pending.value) return 'pending'
      return 'success'
    }),
    isStale: computed(() => isStale.value),
  }

  const result = resultData as UseCmsStudioQueryReturn<DataT>

  result.then = <TResult1 = UseCmsStudioQueryData<DataT>, TResult2 = never>(
    onFulfilled?:
      | ((value: UseCmsStudioQueryData<DataT>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise.resolve(resultData).then(onFulfilled, onRejected)

  return result
}
