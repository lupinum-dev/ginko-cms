import { v } from 'convex/values'

type OperationDefinition = {
  id?: string
  name?: string
  kind?: 'safe' | 'destructive'
  safety?: string
  args?: Record<string, unknown>
  guard?: any
  returns?: unknown
  previewReturns?: unknown
  executeFunctionRef?: string
  load?: (...args: any[]) => unknown
  preview?: (...args: any[]) => unknown
  handler: (...args: any[]) => unknown
}

type OperationPreviewInput = {
  summary?: string
  blockers?: unknown[]
  warnings?: unknown[]
  effects?: unknown[]
  details?: unknown
  confirm?: unknown
  version?: unknown
}

export type OperationHandle = OperationDefinition
export type OperationDescriptor<TId extends string = string> = {
  _type: 'operation-descriptor'
  id: TId
  name: string
  kind: 'safe' | 'destructive'
  args?: unknown
}

export function defineOperation<const TDefinition extends OperationDefinition>(
  definition: TDefinition,
): TDefinition {
  return definition
}

defineOperation.withContext =
  <TCtx>() =>
  <const TDefinition extends OperationDefinition>(definition: TDefinition): TDefinition =>
    definition

export function previewOf(operation: OperationDefinition): OperationDefinition {
  if (!operation.preview) {
    throw new Error('previewOf() requires an operation with a preview handler.')
  }

  return {
    id: operation.id ? `${operation.id}:preview` : undefined,
    args: operation.args,
    guard: operation.guard,
    returns: operation.previewReturns,
    load: operation.load,
    handler: async (ctx: unknown, args: unknown, loaded: unknown) =>
      await operation.preview!(ctx, args, loaded),
  }
}

export function operationIssue<TIssue extends Record<string, unknown>>(issue: TIssue): TIssue {
  return issue
}

export function operationEffect<TEffect extends Record<string, unknown>>(effect: TEffect): TEffect {
  return effect
}

export function operationPreview<TPreview extends OperationPreviewInput>(preview: TPreview) {
  return {
    allowed: (preview.blockers ?? []).length === 0,
    blockers: preview.blockers ?? [],
    warnings: preview.warnings ?? [],
    effects: preview.effects ?? [],
    summary: preview.summary ?? '',
    details: preview.details ?? null,
    confirm: preview.confirm ?? null,
    confirmation:
      preview.confirm === undefined
        ? null
        : {
            token: JSON.stringify(preview.confirm),
            expiresAt: Date.now() + 5 * 60_000,
          },
    version: preview.version ?? null,
  }
}

export function blockedOperationPreview(input: OperationPreviewInput & { blocker?: unknown }) {
  return operationPreview({
    ...input,
    blockers: input.blockers ?? (input.blocker === undefined ? [] : [input.blocker]),
  })
}

export function operationPreviewValidator() {
  return v.any()
}

export function defineOperationHandle<TDescriptor extends OperationDescriptor>(
  descriptor: TDescriptor,
  refs: Record<string, unknown>,
) {
  return {
    ...descriptor,
    ...refs,
  }
}

export function projectOperationRef<TDescriptor extends OperationDescriptor>(
  descriptor: TDescriptor,
  projection: 'execute' | 'preview',
  ref: unknown,
  refs?: Record<string, unknown>,
  previewRefs?: Record<string, unknown>,
) {
  return {
    ...descriptor,
    projection,
    ref,
    ...refs,
    ...previewRefs,
  }
}
