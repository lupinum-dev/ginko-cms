import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import {
  computed,
  onScopeDispose,
  ref,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  watch,
} from 'vue'

import { useStudioHostContext } from '../boundary/studio-host-context'
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
  error: Ref<Error | null>
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
  error: Ref<Error | null>
  reset: () => void
}

function useStudioOperationScope(onRetire: () => void) {
  const { principalKey } = useCmsAuthState()
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

  const isCurrent = (operation: { generation: number; principalKey: string }) =>
    !disposed &&
    operation.generation === generation &&
    operation.principalKey === principalKey.value

  return {
    begin() {
      if (disposed) throw new Error('Studio operation scope was disposed.')
      generation += 1
      return { generation, principalKey: principalKey.value }
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
  onSuccess?: (storageId: string, file: File) => void
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

type StudioUploadReturn<Mutation extends FunctionReference<'mutation'>> = {
  (input: File | File[], mutationArgs?: FunctionArgs<Mutation>): Promise<string | string[]>
  upload: (
    input: File | File[],
    mutationArgs?: FunctionArgs<Mutation>,
  ) => Promise<string | string[]>
  data: Ref<string | undefined>
  status: ComputedRef<'idle' | 'pending' | 'success' | 'error'>
  pending: ComputedRef<boolean>
  progress: ComputedRef<number>
  error: Ref<Error | null>
  reset: () => void
}

async function uploadFile(postUrl: string, file: File): Promise<string> {
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
  return body.storageId
}

export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options?: StudioMutationOptions<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>,
): StudioMutationReturn<Mutation> {
  type Args = FunctionArgs<Mutation>
  type Result = FunctionReturnType<Mutation>

  const studioHost = useStudioHostContext()
  const data = ref<Result | undefined>(undefined)
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const error = ref<Error | null>(null)
  const clearState = () => {
    data.value = undefined
    status.value = 'idle'
    error.value = null
  }
  const scope = useStudioOperationScope(clearState)

  const execute = (async (args: Args): Promise<Result> => {
    const operation = scope.begin()
    status.value = 'pending'
    error.value = null
    try {
      const result = await studioHost.requireConvexClient().mutation(mutation, args)
      if (!scope.isCurrent(operation)) return result
      data.value = result
      status.value = 'success'
      options?.onSuccess?.(result, args)
      return result
    } catch (err) {
      const normalized = normalizeCmsStudioQueryError(err, mutation, 'mutation')
      if (scope.isCurrent(operation)) {
        error.value = normalized
        status.value = 'error'
        options?.onError?.(normalized, args)
      }
      throw normalized
    }
  }) as StudioMutationReturn<Mutation>

  execute.data = data
  execute.status = computed(() => status.value)
  execute.pending = computed(() => status.value === 'pending')
  execute.error = error
  execute.reset = () => {
    if (scope.canReset()) clearState()
  }

  return execute
}

export function useConvexAction<Action extends FunctionReference<'action'>>(
  action: Action,
  options?: StudioMutationOptions<FunctionArgs<Action>, FunctionReturnType<Action>>,
): StudioActionReturn<Action> {
  type Args = FunctionArgs<Action>
  type Result = FunctionReturnType<Action>

  const studioHost = useStudioHostContext()
  const data = ref<Result | undefined>(undefined)
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const error = ref<Error | null>(null)
  const clearState = () => {
    data.value = undefined
    status.value = 'idle'
    error.value = null
  }
  const scope = useStudioOperationScope(clearState)

  const execute = (async (args: Args): Promise<Result> => {
    const operation = scope.begin()
    status.value = 'pending'
    error.value = null
    try {
      const result = await studioHost.requireConvexClient().action(action, args)
      if (!scope.isCurrent(operation)) return result
      data.value = result
      status.value = 'success'
      options?.onSuccess?.(result, args)
      return result
    } catch (err) {
      const normalized = normalizeCmsStudioQueryError(err, action, 'action')
      if (scope.isCurrent(operation)) {
        error.value = normalized
        status.value = 'error'
        options?.onError?.(normalized, args)
      }
      throw normalized
    }
  }) as StudioActionReturn<Action>

  execute.data = data
  execute.status = computed(() => status.value)
  execute.pending = computed(() => status.value === 'pending')
  execute.error = error
  execute.reset = () => {
    if (scope.canReset()) clearState()
  }

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

export function useConvexUpload<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexUploadOptions,
): StudioUploadReturn<Mutation> {
  type Args = FunctionArgs<Mutation>

  const studioHost = useStudioHostContext()
  const data = ref<string | undefined>(undefined)
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const progress = ref(0)
  const error = ref<Error | null>(null)
  const clearState = () => {
    data.value = undefined
    status.value = 'idle'
    progress.value = 0
    error.value = null
  }
  const scope = useStudioOperationScope(clearState)

  const uploadOne = async (
    file: File,
    operation: { generation: number; principalKey: string },
    mutationArgs?: Args,
  ): Promise<string> => {
    validateUpload(file, options)
    const postUrl = await studioHost
      .requireConvexClient()
      .mutation(generateUploadUrlMutation, mutationArgs)
    scope.assertCurrent(operation)
    if (typeof postUrl !== 'string') {
      throw new TypeError('generateUploadUrl mutation must return a string URL')
    }
    const storageId = await uploadFile(postUrl, file)
    scope.assertCurrent(operation)
    data.value = storageId
    progress.value = 100
    options?.onProgress?.({ loaded: file.size, total: file.size, percent: 100 }, file)
    options?.onSuccess?.(storageId, file)
    return storageId
  }

  const upload = (async (input: File | File[], mutationArgs?: Args) => {
    const operation = scope.begin()
    status.value = 'pending'
    error.value = null
    progress.value = 0
    try {
      const result = Array.isArray(input)
        ? await Promise.all(input.map((file) => uploadOne(file, operation, mutationArgs)))
        : await uploadOne(input, operation, mutationArgs)
      if (!scope.isCurrent(operation)) return result
      status.value = 'success'
      options?.onQueueIdle?.()
      return result
    } catch (err) {
      const normalized = normalizeCmsStudioQueryError(err, generateUploadUrlMutation, 'upload')
      const firstFile = Array.isArray(input) ? input[0] : input
      if (scope.isCurrent(operation)) {
        error.value = normalized
        status.value = 'error'
        if (firstFile) options?.onError?.(normalized, firstFile)
      }
      throw normalized
    }
  }) as StudioUploadReturn<Mutation>

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
