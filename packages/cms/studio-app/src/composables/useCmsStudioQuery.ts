import { classifyGinkoError, type GinkoErrorCategory } from '@public/error-classification'
import { normalizeConvexError } from 'better-convex-nuxt/errors'
import { getFunctionName } from 'convex/server'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  FunctionType,
  FunctionVisibility,
} from 'convex/server'
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
import { useCmsAuthState } from './useCmsAuthState'
import { useCmsStudioAccess } from './useCmsStudioAccess'

type CmsStudioQueryErrorCategory = GinkoErrorCategory
export type CmsStudioOperation = 'query' | 'mutation' | 'action' | 'upload'
type AnyFunctionReference = FunctionReference<FunctionType, FunctionVisibility>

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

export type UseCmsStudioQueryReturn<DataT> = UseCmsStudioQueryData<DataT>

type CmsStudioQueryOptions<RawT, DataT> = {
  transform?: (input: RawT) => DataT
  keepPreviousData?: boolean
  requiredCapability?: CmsPermissionKey
}

function safeFunctionName(query: AnyFunctionReference): string {
  try {
    return getFunctionName(query)
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
      operation: CmsStudioOperation
      functionPath: string
      code?: string
      status?: number
      category: CmsStudioQueryErrorCategory
      data?: unknown
    },
  ) {
    super(message)
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
  query: AnyFunctionReference,
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
  const auth = useCmsAuthState()
  const { ready, can } = useCmsStudioAccess()
  const canRead = can(cmsPermissionKeys.read)
  const requiredCapability = options?.requiredCapability
  const canRequired = requiredCapability ? can(requiredCapability) : computed(() => true)
  const data = ref<DataT | null>(null)
  const error = ref<Error | null>(null)
  const pending = ref(false)
  const isStale = ref(false)
  let unsubscribe: (() => void) | null = null
  let disposed = false
  let operationId = 0
  let lastPrincipalKey: string | null = null

  const gatedArgs = computed(() => {
    const value = toValue(args)
    if (
      (auth.authEnabled.value && !auth.isAuthenticated.value) ||
      !ready.value ||
      !canRead.value ||
      !canRequired.value
    ) {
      return null
    }
    return value ?? null
  })

  const { requiredCapability: _requiredCapability, ...queryOptions } = options ?? {}
  const applyTransform = (raw: FunctionReturnType<Query>): DataT =>
    queryOptions.transform ? queryOptions.transform(raw) : (raw as unknown as DataT)

  const operationInput = computed(() => ({
    args: gatedArgs.value,
    principalKey: auth.principalKey.value,
  }))

  const start = () => {
    if (disposed) return
    const currentOperationId = ++operationId
    const { args: inputArgs, principalKey } = operationInput.value
    unsubscribe?.()
    unsubscribe = null

    if (lastPrincipalKey !== null && lastPrincipalKey !== principalKey) {
      data.value = null
      error.value = null
      isStale.value = false
    }
    lastPrincipalKey = principalKey

    const isCurrent = () =>
      !disposed && currentOperationId === operationId && principalKey === auth.principalKey.value

    const nextArgs = inputArgs as FunctionArgs<Query> | null | undefined
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
        if (!isCurrent()) return
        data.value = applyTransform(raw)
        error.value = null
        pending.value = false
        isStale.value = false
      },
      (err: unknown) => {
        if (!isCurrent()) return
        error.value = normalizeCmsStudioQueryError(err, query)
        pending.value = false
        isStale.value = false
      },
    )
  }

  const stop = watch(operationInput, start, { immediate: true, deep: true })
  onScopeDispose(() => {
    disposed = true
    operationId += 1
    stop()
    unsubscribe?.()
    unsubscribe = null
    data.value = null
    error.value = null
    pending.value = false
    isStale.value = false
  })

  const refresh = async () => {
    if (disposed) return
    error.value = null
    start()
  }

  const resultData: UseCmsStudioQueryData<DataT> = {
    data: computed(() => data.value),
    error,
    refresh,
    clear: () => {
      if (disposed) return
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

  return resultData
}
