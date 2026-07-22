import { classifyGinkoError, type GinkoErrorCategory } from '@public/error-classification'
import { useConvexQuery as useBetterConvexQuery } from 'better-convex-vue'
import { normalizeConvexError } from 'better-convex-vue/errors'
import { getFunctionName } from 'convex/server'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  FunctionType,
  FunctionVisibility,
} from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'

import { cmsPermissionKeys, type CmsPermissionKey } from './permissions'
import { useCmsAuthState } from './useCmsAuthState'
import { useCmsStudioAccess } from './useCmsStudioAccess'

type CmsStudioQueryErrorCategory = GinkoErrorCategory
export type CmsStudioOperation = 'query' | 'mutation' | 'action' | 'upload'
type AnyFunctionReference = FunctionReference<FunctionType, FunctionVisibility>

type CmsStudioQueryStatus = 'skipped' | 'pending' | 'success' | 'error'

export type UseCmsStudioQueryData<DataT> = {
  data: ComputedRef<DataT | null>
  error: ComputedRef<Error | null>
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
  const auth = useCmsAuthState()
  const { ready, can } = useCmsStudioAccess()
  const canRead = can(cmsPermissionKeys.read)
  const requiredCapability = options?.requiredCapability
  const canRequired = requiredCapability ? can(requiredCapability) : computed(() => true)
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
  const queryOptions = options ?? {}
  const result = useBetterConvexQuery(query, gatedArgs, {
    auth: 'required',
    transform: queryOptions.transform,
    keepPreviousData: queryOptions.keepPreviousData,
  })

  return {
    data: result.data,
    error: computed(() =>
      result.error.value ? normalizeCmsStudioQueryError(result.error.value, query) : null,
    ),
    refresh: result.refresh,
    clear: result.clear,
    pending: result.pending,
    status: computed(() => {
      if (gatedArgs.value === 'skip') return 'skipped'
      if (result.status.value === 'error') return 'error'
      if (result.status.value === 'pending' || result.status.value === 'idle') return 'pending'
      return 'success'
    }),
    isStale: result.isStale,
  }
}
