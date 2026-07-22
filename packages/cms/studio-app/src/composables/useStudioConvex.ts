import {
  useConvexAction as useBetterConvexAction,
  useConvexMutation as useBetterConvexMutation,
} from 'better-convex-vue'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { GenericId } from 'convex/values'
import {
  computed,
  onScopeDispose,
  ref,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  watch,
} from 'vue'

import { useCmsAuthState } from './useCmsAuthState'
import {
  normalizeCmsStudioQueryError,
  useCmsStudioQuery,
  type UseCmsStudioQueryReturn,
} from './useCmsStudioQuery'

type StudioMutationReturn<Mutation extends FunctionReference<'mutation'>> = ((
  args: FunctionArgs<Mutation>,
) => Promise<FunctionReturnType<Mutation>>) & {
  data: Ref<FunctionReturnType<Mutation> | undefined>
  status: ComputedRef<'idle' | 'pending' | 'success' | 'error'>
  pending: ComputedRef<boolean>
  error: ComputedRef<Error | null>
  reset: () => void
}

type StudioMutationOptions<Args, Result> = {
  onSuccess?: (result: Result, args: Args) => void
  onError?: (error: Error, args: Args) => void
}

type StudioActionReturn<Action extends FunctionReference<'action'>> = ((
  args: FunctionArgs<Action>,
) => Promise<FunctionReturnType<Action>>) & {
  data: Ref<FunctionReturnType<Action> | undefined>
  status: ComputedRef<'idle' | 'pending' | 'success' | 'error'>
  pending: ComputedRef<boolean>
  error: ComputedRef<Error | null>
  reset: () => void
}

function useStudioUploadScope(onRetire: () => void) {
  const auth = useCmsAuthState()
  const { principalKey } = auth
  let disposed = false
  let generation = 0

  const retire = () => {
    generation += 1
    onRetire()
  }
  watch(principalKey, retire)
  onScopeDispose(() => {
    disposed = true
    retire()
  })

  const readPrincipalKey = () => auth.principalKey.value

  const isCurrent = (operation: { generation: number; principalKey: string }) =>
    !disposed &&
    operation.generation === generation &&
    operation.principalKey === readPrincipalKey()

  return {
    authenticationSettlement(): Promise<void> | null {
      if (!auth.authEnabled.value) return null
      if (!auth.pending.value) {
        if (auth.error.value) throw auth.error.value
        if (!auth.isAuthenticated.value) {
          throw new Error('Authentication is required before the Studio write.')
        }
        return null
      }
      return (async () => {
        const deadline = Date.now() + 30_000
        while (auth.pending.value && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
        if (auth.error.value) throw auth.error.value
        if (auth.pending.value) {
          throw new Error('Authentication did not settle before the Studio write.')
        }
        if (!auth.isAuthenticated.value) {
          throw new Error('Authentication is required before the Studio write.')
        }
      })()
    },
    begin() {
      if (disposed) throw new Error('Studio operation scope was disposed.')
      generation += 1
      return { generation, principalKey: readPrincipalKey() }
    },
    isCurrent,
    assertCurrent(operation: { generation: number; principalKey: string }) {
      if (!isCurrent(operation)) throw new Error('Studio operation scope was disposed.')
    },
    canReset() {
      return !disposed
    },
  }
}

type UseConvexUploadOptions = {
  allowedTypes?: string[]
  maxSizeBytes?: number
  onProgress?: (progress: { loaded: number; total: number; percent: number }, file: File) => void
  onSuccess?: (upload: StudioUploadClaim, file: File) => void
  onError?: (error: Error, file: File) => void
  onQueueIdle?: () => void
}

function fileTypeMatches(pattern: string, fileType: string): boolean {
  if (pattern.endsWith('/*')) {
    return fileType.startsWith(pattern.slice(0, -1))
  }
  return pattern === fileType
}

function validateUpload(file: File, options?: UseConvexUploadOptions): void {
  const allowedTypes = Array.isArray(options?.allowedTypes)
    ? (options.allowedTypes as string[])
    : []
  if (
    allowedTypes.length &&
    !allowedTypes.some((allowedType) => fileTypeMatches(allowedType, file.type))
  ) {
    throw new Error(`File type "${file.type || 'unknown'}" is not allowed.`)
  }
  if (options?.maxSizeBytes !== undefined && file.size > options.maxSizeBytes) {
    throw new Error(`File exceeds maximum upload size of ${options.maxSizeBytes} bytes.`)
  }
}

type StudioUploadSession = {
  sessionId: string
  uploadUrl: string
  token: string
  expiresAt: number
}

export type StudioUploadClaim = StudioUploadSession & {
  storageId: GenericId<'_storage'>
  generation: number
}

type CreateUploadSessionMutation = FunctionReference<
  'mutation',
  'public',
  Record<string, never>,
  StudioUploadSession
>

type ClaimUploadSessionMutation = FunctionReference<
  'mutation',
  'public',
  { sessionId: string; token: string; storageId: string },
  { sessionId: string; generation: number; expiresAt: number }
>

type StudioUploadReturn = {
  (input: File | File[]): Promise<StudioUploadClaim | StudioUploadClaim[]>
  upload: (input: File | File[]) => Promise<StudioUploadClaim | StudioUploadClaim[]>
  data: Ref<StudioUploadClaim | undefined>
  status: ComputedRef<'idle' | 'pending' | 'success' | 'error'>
  pending: ComputedRef<boolean>
  progress: ComputedRef<number>
  error: Ref<Error | null>
  reset: () => void
}

async function uploadFile(postUrl: string, file: File): Promise<GenericId<'_storage'>> {
  const response = await fetch(postUrl, {
    method: 'POST',
    headers: file.type ? { 'Content-Type': file.type } : undefined,
    body: file,
  })
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
  }
  const body = (await response.json()) as { storageId?: unknown }
  if (typeof body.storageId !== 'string' || body.storageId.length === 0) {
    throw new Error('Upload endpoint response missing valid storageId')
  }
  // Convex's upload endpoint returns a storage id as JSON text. Runtime
  // validation above is the transport boundary for restoring its branded type.
  return body.storageId as GenericId<'_storage'>
}

export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options?: StudioMutationOptions<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>,
): StudioMutationReturn<Mutation> {
  type Args = FunctionArgs<Mutation>
  type Result = FunctionReturnType<Mutation>

  const callable = useBetterConvexMutation(mutation, {
    onSuccess: options?.onSuccess,
    onError: (error, args) =>
      options?.onError?.(normalizeCmsStudioQueryError(error, mutation, 'mutation'), args),
  })

  const execute = (async (args: Args): Promise<Result> => {
    try {
      return await callable(args)
    } catch (err) {
      const normalized = normalizeCmsStudioQueryError(err, mutation, 'mutation')
      throw normalized
    }
  }) as StudioMutationReturn<Mutation>

  execute.data = callable.data
  execute.status = callable.status
  execute.pending = callable.pending
  execute.error = computed(() =>
    callable.error.value
      ? normalizeCmsStudioQueryError(callable.error.value, mutation, 'mutation')
      : null,
  )
  execute.reset = callable.reset

  return execute
}

export function useConvexAction<Action extends FunctionReference<'action'>>(
  action: Action,
  options?: StudioMutationOptions<FunctionArgs<Action>, FunctionReturnType<Action>>,
): StudioActionReturn<Action> {
  type Args = FunctionArgs<Action>
  type Result = FunctionReturnType<Action>

  const callable = useBetterConvexAction(action, {
    onSuccess: options?.onSuccess,
    onError: (error, args) =>
      options?.onError?.(normalizeCmsStudioQueryError(error, action, 'action'), args),
  })

  const execute = (async (args: Args): Promise<Result> => {
    try {
      return await callable(args)
    } catch (err) {
      const normalized = normalizeCmsStudioQueryError(err, action, 'action')
      throw normalized
    }
  }) as StudioActionReturn<Action>

  execute.data = callable.data
  execute.status = callable.status
  execute.pending = callable.pending
  execute.error = computed(() =>
    callable.error.value
      ? normalizeCmsStudioQueryError(callable.error.value, action, 'action')
      : null,
  )
  execute.reset = callable.reset

  return execute
}

export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<FunctionArgs<Query> | null | undefined>,
): UseCmsStudioQueryReturn<DataT> {
  return useCmsStudioQuery<Query, DataT>(query, args)
}

export function useConvexUpload(
  createUploadSessionMutation: CreateUploadSessionMutation,
  claimUploadSessionMutation: ClaimUploadSessionMutation,
  options?: UseConvexUploadOptions,
): StudioUploadReturn {
  const createUploadSession = useBetterConvexMutation(createUploadSessionMutation)
  const claimUploadSession = useBetterConvexMutation(claimUploadSessionMutation)
  const data = ref<StudioUploadClaim | undefined>(undefined)
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const progress = ref(0)
  const error = ref<Error | null>(null)
  const clearState = () => {
    data.value = undefined
    status.value = 'idle'
    progress.value = 0
    error.value = null
  }
  const scope = useStudioUploadScope(clearState)

  const uploadOne = async (
    file: File,
    operation: { generation: number; principalKey: string },
  ): Promise<StudioUploadClaim> => {
    validateUpload(file, options)
    const session = await createUploadSession({})
    scope.assertCurrent(operation)
    if (
      typeof session?.sessionId !== 'string' ||
      typeof session.uploadUrl !== 'string' ||
      typeof session.token !== 'string' ||
      typeof session.expiresAt !== 'number'
    ) {
      throw new TypeError('createAssetUploadSession mutation returned an invalid session')
    }
    const storageId = await uploadFile(session.uploadUrl, file)
    scope.assertCurrent(operation)
    const claimed = await claimUploadSession({
      sessionId: session.sessionId,
      token: session.token,
      storageId,
    })
    scope.assertCurrent(operation)
    const result = { ...session, storageId, generation: claimed.generation }
    data.value = result
    progress.value = 100
    options?.onProgress?.({ loaded: file.size, total: file.size, percent: 100 }, file)
    options?.onSuccess?.(result, file)
    return result
  }

  const upload = (async (input: File | File[]) => {
    let operation: ReturnType<typeof scope.begin> | null = null
    status.value = 'pending'
    error.value = null
    progress.value = 0
    try {
      const settlement = scope.authenticationSettlement()
      if (settlement) await settlement
      operation = scope.begin()
      const activeOperation = operation
      const result = Array.isArray(input)
        ? await Promise.all(input.map((file) => uploadOne(file, activeOperation)))
        : await uploadOne(input, activeOperation)
      if (!scope.isCurrent(activeOperation)) return result
      status.value = 'success'
      options?.onQueueIdle?.()
      return result
    } catch (err) {
      const normalized = normalizeCmsStudioQueryError(err, createUploadSessionMutation, 'upload')
      const firstFile = Array.isArray(input) ? input[0] : input
      if (operation ? scope.isCurrent(operation) : scope.canReset()) {
        error.value = normalized
        status.value = 'error'
        if (firstFile) options?.onError?.(normalized, firstFile)
      }
      throw normalized
    }
  }) as StudioUploadReturn

  upload.upload = upload
  upload.data = data
  upload.status = computed(() => status.value)
  upload.pending = computed(() => status.value === 'pending')
  upload.progress = computed(() => progress.value)
  upload.error = error
  upload.reset = () => {
    if (scope.canReset()) clearState()
  }

  return upload
}
