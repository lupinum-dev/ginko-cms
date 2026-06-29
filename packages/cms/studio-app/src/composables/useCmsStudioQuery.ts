import type {
  UseConvexQueryData,
  UseConvexQueryOptions,
  UseConvexQueryReturn,
} from '@lupinumbetter-convex-nuxt/composables'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, onScopeDispose, ref, type MaybeRefOrGetter, toValue, watch } from 'vue'

import { useStudioHostContext } from '../boundary/studio-host-context'
import { cmsPermissionKeys, type CmsPermissionKey } from './permissions'
import { useCmsStudioAccess } from './useCmsStudioAccess'

type CmsStudioQueryErrorCategory =
  | 'auth'
  | 'validation'
  | 'not_found'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'conflict'
  | 'unknown'

type ErrorRecord = {
  code?: unknown
  status?: unknown
  data?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseErrorData(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return parseErrorData(JSON.parse(value))
    } catch {
      return null
    }
  }
  return isRecord(value) ? value : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getFunctionName(fn: unknown): string {
  if (typeof fn === 'string') return fn
  if (!fn || typeof fn !== 'object') return 'unknown'
  const record = fn as Record<string | symbol, unknown>
  const symbolName = record[Symbol.for('functionName')]
  if (typeof symbolName === 'string') return symbolName
  if (typeof record._path === 'string') return record._path
  if (typeof record.functionPath === 'string') return record.functionPath
  return 'unknown'
}

function categorizeQueryError(code?: string, status?: number): CmsStudioQueryErrorCategory {
  const upper = code?.toUpperCase()
  if (upper) {
    if (upper.includes('UNAUTH') || upper === 'FORBIDDEN') return 'auth'
    if (upper === 'VALIDATION' || upper === 'INVALID_ARGS') return 'validation'
    if (upper === 'NOT_FOUND') return 'not_found'
    if (upper.startsWith('LIMIT_')) return 'rate_limit'
    if (
      upper === 'CONFLICT' ||
      upper.includes('CONFLICT') ||
      upper.includes('VERSION_MISMATCH') ||
      upper.startsWith('STALE_')
    ) {
      return 'conflict'
    }
    if (upper === 'INTERNAL_ERROR' || upper === 'INTERNAL') return 'server'
  }
  if (status !== undefined) {
    if (status === 401 || status === 403) return 'auth'
    if (status === 400 || status === 422) return 'validation'
    if (status === 404) return 'not_found'
    if (status === 409) return 'conflict'
    if (status === 429) return 'rate_limit'
    if (status >= 500) return 'server'
  }
  return 'unknown'
}

export class CmsStudioQueryError extends Error {
  readonly isCmsStudioQueryError = true as const
  readonly operation = 'query' as const
  readonly functionPath: string
  readonly code?: string
  readonly status?: number
  readonly category: CmsStudioQueryErrorCategory
  readonly data?: unknown

  constructor(
    message: string,
    init: {
      cause: unknown
      functionPath: string
      code?: string
      status?: number
      data?: unknown
    },
  ) {
    super(message, { cause: init.cause })
    this.name = 'CmsStudioQueryError'
    this.functionPath = init.functionPath
    this.code = init.code
    this.status = init.status
    this.category = categorizeQueryError(init.code, init.status)
    this.data = init.data
  }
}

export function normalizeCmsStudioQueryError(error: unknown, query: unknown): CmsStudioQueryError {
  if (error instanceof CmsStudioQueryError) return error

  const record = isRecord(error) ? (error as ErrorRecord) : null
  const recordData = parseErrorData(record?.data)
  const data =
    recordData ??
    (typeof record?.code === 'string' &&
    typeof (record as { message?: unknown }).message === 'string'
      ? (record as Record<string, unknown>)
      : null)
  const code = asString(data?.code) ?? asString(record?.code)
  const status = asNumber(data?.status) ?? asNumber(record?.status)
  const message =
    asString(data?.message) ??
    (error instanceof Error ? error.message : undefined) ??
    String(error || 'Studio query failed.')

  return new CmsStudioQueryError(message, {
    cause: error,
    functionPath: getFunctionName(query),
    code,
    status,
    data: record?.data ?? data,
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
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT> & {
    requiredCapability?: CmsPermissionKey
  },
): UseConvexQueryReturn<DataT> {
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

  const resultData: UseConvexQueryData<DataT> = {
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

  const result = resultData as UseConvexQueryReturn<DataT>

  result.then = <TResult1 = UseConvexQueryData<DataT>, TResult2 = never>(
    onFulfilled?: ((value: UseConvexQueryData<DataT>) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise.resolve(resultData).then(onFulfilled, onRejected)

  return result
}
