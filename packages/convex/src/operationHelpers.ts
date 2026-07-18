import type { CmsCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { DefaultFunctionArgs, GenericMutationCtx } from 'convex/server'
import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel.js'
import type { CmsMemberAppIdentity } from './auth/appIdentity.js'
import { can, type CmsGuard } from './auth/checks.js'
import type { CmsErrorData } from './errors.js'
import { logActivity } from './lib/activity.js'
import { createToken, hashValue, sha256Hex } from './operationHash.js'

export { hashValue } from './operationHash.js'

const CONFIRMATION_TTL_MS = 5 * 60_000
const SCOPE_KEY = 'ginko-cms'

type HandlerCtx = GenericMutationCtx<DataModel> & {
  cmsCaller?: () => Promise<CmsCaller>
  appIdentity: () => Promise<CmsMemberAppIdentity>
}

type ArgsFor<TArgsValidator> = TArgsValidator extends GenericValidator
  ? TArgsValidator['type']
  : TArgsValidator extends PropertyValidators
    ? ObjectType<TArgsValidator>
    : DefaultFunctionArgs

type OperationLoad<TArgsValidator> = (ctx: HandlerCtx, args: ArgsFor<TArgsValidator>) => unknown

type LoadedFor<TLoad> = TLoad extends (...args: infer _Args) => infer TLoaded
  ? Awaited<TLoaded>
  : undefined

type LooseValue = ReturnType<typeof v.any>['type']

export type OperationBlockedResult = {
  status: 'blocked'
  code: string
  message: string
  details: unknown
}

export type OperationStaleResult = {
  status: 'stale'
  code: string
  message: string
  details: unknown
}

export type OperationAppliedResult<TValue> = {
  status: 'applied'
  value: TValue
}

export type OperationExecuteResult<TValue> =
  | OperationAppliedResult<TValue>
  | OperationBlockedResult
  | OperationStaleResult

type OperationIssueResult = OperationBlockedResult | OperationStaleResult

export type CmsOperationDefinition<
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
  TLoaded = LooseValue,
  TResult = unknown,
> = {
  id?: string
  kind?: 'safe' | 'destructive'
  contractWrite?: 'required' | 'bypass'
  args?: TArgsValidator
  guard?: CmsGuard
  returns?: GenericValidator | PropertyValidators
  previewReturns?: GenericValidator | PropertyValidators
  executeFunctionRef?: string
  load?: (ctx: HandlerCtx, args: ArgsFor<TArgsValidator>) => TLoaded | Promise<TLoaded>
  preview?: (
    ctx: HandlerCtx,
    args: ArgsFor<TArgsValidator>,
    loaded: TLoaded,
  ) => PreviewInput | PreviewResult | Promise<PreviewInput | PreviewResult>
  handler: (ctx: HandlerCtx, args: ArgsFor<TArgsValidator>, loaded: TLoaded) => TResult
}

export type DestructiveCmsOperationDefinition<
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
  TLoaded = LooseValue,
  TResult = unknown,
> = CmsOperationDefinition<TArgsValidator, TLoaded, TResult> & {
  kind: 'destructive'
  returns: GenericValidator
  acceptsTrustedCaller?: never
}

type PreviewInput = {
  allowed?: boolean
  summary?: string
  blockers?: unknown[]
  warnings?: unknown[]
  effects?: unknown[]
  details?: unknown
  confirm?: unknown
  version?: unknown
}

type PreviewResult = {
  allowed: boolean
  blockers: unknown[]
  warnings: unknown[]
  effects: unknown[]
  summary: string
  details: unknown
  confirm: unknown
  confirmation: { token: string; expiresAt: number } | null
  version: unknown
}

type CmsOperationInput<
  TArgsValidator extends GenericValidator | PropertyValidators | undefined,
  TLoad extends OperationLoad<TArgsValidator> | undefined,
  TResult,
> = Omit<CmsOperationDefinition<TArgsValidator, LoadedFor<TLoad> | LooseValue, TResult>, 'load'> & {
  load?: TLoad
}

export function defineCmsOperation<
  const TArgsValidator extends GenericValidator | PropertyValidators | undefined,
  const TLoad extends OperationLoad<TArgsValidator> | undefined,
  const TResult,
  const TDefinition extends CmsOperationInput<TArgsValidator, TLoad, TResult>,
>(definition: TDefinition): TDefinition {
  if (definition.kind === 'destructive') {
    if (!definition.id) throw new Error('Destructive operation requires a stable id.')
    if (!definition.executeFunctionRef) {
      throw new Error(`Destructive operation ${definition.id} requires an execute function ref.`)
    }
    if (!definition.preview) {
      throw new Error(`Destructive operation ${definition.id} requires a preview handler.`)
    }
    if (definition.returns === undefined) {
      throw new Error(`Destructive operation ${definition.id} requires a return validator.`)
    }
  }
  return definition
}

export function definePreview<
  TArgsValidator extends GenericValidator | PropertyValidators | undefined,
  TLoaded,
  TResult,
>(
  operation: CmsOperationDefinition<TArgsValidator, TLoaded, TResult>,
): CmsOperationDefinition<TArgsValidator, TLoaded, PreviewResult | Promise<PreviewResult>> & {
  kind?: 'safe'
} {
  const previewOperation = operation.preview
  if (!previewOperation) {
    throw new Error('A preview handler is required.')
  }

  return {
    id: operation.id ? `${operation.id}:preview` : undefined,
    contractWrite: operation.contractWrite,
    args: operation.args,
    guard: operation.guard,
    returns: operation.previewReturns,
    handler: async (ctx, args) => {
      let loaded: TLoaded
      try {
        loaded = operation.load ? await operation.load(ctx, args) : (undefined as TLoaded)
      } catch (error) {
        const issue = classifyOperationError(error, 'stale')
        if (!issue) throw error
        return buildPreview({
          allowed: false,
          summary: issue.message,
          blockers: [
            operationIssue({
              status: issue.status,
              code: issue.code,
              message: issue.message,
              details: issue.details,
            }),
          ],
          details: { operationIssue: issue },
          confirm: null,
          version: null,
        })
      }
      let preview: PreviewResult
      try {
        const previewInput = await previewOperation(ctx, args, loaded)
        preview = buildPreview(previewInput)
      } catch (error) {
        const issue = classifyOperationError(error, 'blocked')
        if (!issue) throw error
        return buildPreview({
          allowed: false,
          summary: issue.message,
          blockers: [
            operationIssue({
              status: issue.status,
              code: issue.code,
              message: issue.message,
              details: issue.details,
            }),
          ],
          details: { operationIssue: issue },
          confirm: null,
          version: null,
        })
      }
      if (operation.kind !== 'destructive') return preview
      return await attachConfirmation(ctx, operation, args, preview)
    },
  }
}

export function operationIssue<TIssue extends Record<string, unknown>>(issue: TIssue): TIssue {
  return issue
}

export function operationEffect<TEffect extends Record<string, unknown>>(effect: TEffect): TEffect {
  return effect
}

export function buildPreview<TPreview extends PreviewInput>(preview: TPreview): PreviewResult {
  const blockers = preview.blockers ?? []
  return {
    allowed: preview.allowed ?? blockers.length === 0,
    blockers,
    warnings: preview.warnings ?? [],
    effects: preview.effects ?? [],
    summary: preview.summary ?? '',
    details: preview.details ?? null,
    confirm: preview.confirm ?? null,
    confirmation: null,
    version: preview.version ?? null,
  }
}

export function blockedPreview(input: PreviewInput & { blocker?: unknown }) {
  return buildPreview({
    ...input,
    allowed: false,
    blockers: input.blockers ?? (input.blocker === undefined ? [] : [input.blocker]),
  })
}

export function previewResultValidator() {
  return v.object({
    allowed: v.boolean(),
    blockers: v.array(v.any()),
    warnings: v.array(v.any()),
    effects: v.array(v.any()),
    summary: v.string(),
    details: v.any(),
    confirm: v.any(),
    confirmation: v.union(
      v.object({
        token: v.string(),
        expiresAt: v.number(),
      }),
      v.null(),
    ),
    version: v.any(),
  })
}

export function operationExecuteResultValidator<const TValueValidator extends GenericValidator>(
  valueValidator: TValueValidator,
) {
  return v.union(
    v.object({
      status: v.literal('applied'),
      value: valueValidator,
    }),
    v.object({
      status: v.literal('blocked'),
      code: v.string(),
      message: v.string(),
      details: v.any(),
    }),
    v.object({
      status: v.literal('stale'),
      code: v.string(),
      message: v.string(),
      details: v.any(),
    }),
  )
}

export function operationApplied<TValue>(value: TValue): OperationAppliedResult<TValue> {
  return { status: 'applied', value }
}

/**
 * Record an applied operation authorized by a domain-owned credential rather
 * than a generic confirmation token. The domain remains responsible for
 * validating that credential and running the operation's load/preview/handler;
 * receipt identity and hashes stay identical to the confirmation path.
 */
export async function writeAppliedOperationReceipt(
  ctx: HandlerCtx,
  input: {
    operation: Pick<CmsOperationDefinition, 'id' | 'executeFunctionRef'>
    authorizationId: string
    args: unknown
    preview: PreviewResult
    recordedAt?: number
  },
) {
  await writeOperationReceipt(ctx, {
    operationId: input.operation.id ?? '',
    jti: input.authorizationId,
    callerKey: await resolveCallerKey(ctx),
    argsHash: await hashValue(input.args),
    previewHash: await hashPreview(input.preview),
    executePath: input.operation.executeFunctionRef ?? input.operation.id ?? '',
    result: operationApplied(null),
    recordedAt: input.recordedAt ?? Date.now(),
  })
}

export function operationBlocked(
  code: string,
  message: string,
  details: unknown = null,
): OperationBlockedResult {
  return { status: 'blocked', code, message, details }
}

export function operationStale(
  code: string,
  message: string,
  details: unknown = null,
): OperationStaleResult {
  return { status: 'stale', code, message, details }
}

export async function executeDestructiveOperation<
  TArgsValidator extends GenericValidator | PropertyValidators | undefined,
  TLoaded,
  TResult,
>(
  ctx: HandlerCtx,
  operation: CmsOperationDefinition<TArgsValidator, TLoaded, TResult>,
  args: ArgsFor<TArgsValidator>,
  token: string | undefined,
  options: {
    preflightIssue?: OperationIssueResult
    beforeHandler?: () => Promise<OperationIssueResult | undefined>
  } = {},
): Promise<OperationExecuteResult<Awaited<TResult>>> {
  if (operation.kind !== 'destructive') {
    throw new Error('Only destructive operations use the guarded executor.')
  }
  if (!operation.preview) throw new Error('Destructive operation requires a preview handler.')

  const now = Date.now()
  const callerKey = await resolveCallerKey(ctx)
  const argsHash = await hashValue(args)
  const executePath = operation.executeFunctionRef ?? operation.id ?? ''
  const tokenHash = token ? await sha256Hex(token) : null
  const confirmation = tokenHash
    ? await ctx.db
        .query('destructiveConfirmations')
        .withIndex('by_token_hash', (q) => q.eq('tokenHash', tokenHash))
        .first()
    : null

  const recordIssue = async (issue: OperationIssueResult) => {
    await writeOperationReceipt(ctx, {
      operationId: confirmation?.operationId ?? operation.id ?? '',
      jti: confirmation?.jti ?? `unmatched:${tokenHash ?? 'missing'}`,
      callerKey,
      argsHash,
      previewHash: confirmation?.previewHash ?? '',
      executePath: confirmation?.executePath ?? executePath,
      result: issue,
      recordedAt: now,
    })
    return issue
  }

  const identity = await ctx.appIdentity()
  if (!identity || (operation.guard && !can(identity, operation.guard))) {
    const issue = operationBlocked(
      'OPERATION_FORBIDDEN',
      operation.guard
        ? `You no longer have permission: ${operation.guard.label}.`
        : 'You are not allowed to execute this operation.',
    )
    // Record authorization drift for a confirmation owned by this caller. Do
    // not let anonymous or foreign-token probes create unbounded receipt rows.
    return confirmation?.callerKey === callerKey ? await recordIssue(issue) : issue
  }

  if (!token) {
    return await recordIssue(
      operationBlocked('CONFIRMATION_REQUIRED', 'This operation requires a current confirmation.'),
    )
  }
  if (!confirmation) {
    return await recordIssue(
      operationStale(
        'CONFIRMATION_NOT_FOUND',
        'The confirmation no longer exists. Preview the operation again.',
      ),
    )
  }
  if (confirmation.redeemedAt != null) {
    return await recordIssue(
      operationStale(
        'CONFIRMATION_ALREADY_USED',
        'The confirmation was already used. Preview the operation again.',
      ),
    )
  }
  if (confirmation.expiresAt <= now) {
    return await recordIssue(
      operationStale(
        'CONFIRMATION_EXPIRED',
        'The confirmation expired. Preview the operation again.',
        { expiresAt: confirmation.expiresAt },
      ),
    )
  }

  const staticMismatch = firstStaticConfirmationMismatch(confirmation, {
    operationId: operation.id ?? '',
    executePath,
    callerKey,
    argsHash,
  })
  if (staticMismatch) return await recordIssue(staticMismatch)

  let loaded: TLoaded
  try {
    loaded = operation.load ? await operation.load(ctx, args) : (undefined as TLoaded)
  } catch (error) {
    const issue = classifyOperationError(error, 'stale')
    if (!issue) throw error
    return await recordIssue(issue)
  }

  let currentPreview: PreviewResult
  try {
    currentPreview = buildPreview(await operation.preview(ctx, args, loaded))
  } catch (error) {
    const issue = classifyOperationError(error, 'stale')
    if (!issue) throw error
    return await recordIssue(issue)
  }
  if (!currentPreview.allowed) {
    return await recordIssue(
      operationStale(
        'OPERATION_NO_LONGER_ALLOWED',
        'The operation is no longer allowed. Preview it again.',
        { blockers: currentPreview.blockers },
      ),
    )
  }
  const previewHash = await hashPreview(currentPreview)
  const versionHash = await hashValue(currentPreview.version ?? null)
  if (confirmation.versionHash !== versionHash) {
    return await recordIssue(
      operationStale(
        'CONFIRMATION_VERSION_MISMATCH',
        'The protected state changed. Preview the operation again.',
      ),
    )
  }
  if (confirmation.previewHash !== previewHash) {
    return await recordIssue(
      operationStale(
        'CONFIRMATION_PREVIEW_MISMATCH',
        'The operation impact changed. Preview it again.',
      ),
    )
  }

  if (options.preflightIssue) return await recordIssue(options.preflightIssue)

  // Expected blockers must be expressed by load/preview before the handler starts.
  // An unexpected handler failure stays uncaught so Convex rolls back every write.
  const beforeHandlerIssue = await options.beforeHandler?.()
  if (beforeHandlerIssue) return await recordIssue(beforeHandlerIssue)
  const value = await operation.handler(ctx, args, loaded)
  const appliedAt = Date.now()
  await ctx.db.patch(confirmation._id, { redeemedAt: appliedAt })
  const result = operationApplied(value)
  await writeAppliedOperationReceipt(ctx, {
    operation,
    authorizationId: confirmation.jti,
    args,
    preview: currentPreview,
    recordedAt: appliedAt,
  })
  return result
}

export function operationIssueFromCmsError(
  error: unknown,
  fallbackStatus: OperationIssueResult['status'] = 'blocked',
): OperationIssueResult {
  const issue = classifyOperationError(error, fallbackStatus)
  if (!issue) throw error
  return issue
}

function firstStaticConfirmationMismatch(
  confirmation: {
    operationId: string
    executePath: string
    callerKey: string
    scopeKey: string
    argsHash: string
  },
  expected: {
    operationId: string
    executePath: string
    callerKey: string
    argsHash: string
  },
): OperationIssueResult | null {
  if (confirmation.callerKey !== expected.callerKey) {
    return operationBlocked(
      'CONFIRMATION_CALLER_MISMATCH',
      'This confirmation belongs to a different caller.',
    )
  }
  if (confirmation.scopeKey !== SCOPE_KEY) {
    return operationBlocked(
      'CONFIRMATION_SCOPE_MISMATCH',
      'This confirmation belongs to a different scope.',
    )
  }
  if (
    confirmation.operationId !== expected.operationId ||
    confirmation.executePath !== expected.executePath
  ) {
    return operationStale(
      'CONFIRMATION_OPERATION_MISMATCH',
      'This confirmation belongs to a different operation.',
    )
  }
  if (confirmation.argsHash !== expected.argsHash) {
    return operationStale(
      'CONFIRMATION_ARGUMENT_MISMATCH',
      'The operation arguments differ from the confirmed preview.',
    )
  }
  return null
}

function classifyOperationError(
  error: unknown,
  fallbackStatus: OperationIssueResult['status'],
): OperationIssueResult | null {
  const data = readCmsErrorData(error)
  if (!data) return null
  const status = isAuthorityCmsErrorCode(data.code)
    ? 'blocked'
    : isStaleCmsErrorCode(data.code)
      ? 'stale'
      : fallbackStatus
  return status === 'stale'
    ? operationStale(data.code, data.message, data.details ?? null)
    : operationBlocked(data.code, data.message, data.details ?? null)
}

function readCmsErrorData(error: unknown): CmsErrorData | null {
  if (!error || typeof error !== 'object' || !('data' in error)) return null
  const data = error.data
  if (!data || typeof data !== 'object') return null
  if (!('code' in data) || typeof data.code !== 'string') return null
  if (!('message' in data) || typeof data.message !== 'string') return null
  return data as CmsErrorData
}

function isAuthorityCmsErrorCode(code: string): boolean {
  return /FORBIDDEN|UNAUTHORIZED|PERMISSION|CREDENTIAL/u.test(code)
}

function isStaleCmsErrorCode(code: string): boolean {
  return /CONCURRENT|STALE|CHANGED|VERSION|NOT_FOUND|EXPIRED|MISMATCH|FENCE/u.test(code)
}

async function writeOperationReceipt(
  ctx: HandlerCtx,
  input: {
    operationId: string
    jti: string
    callerKey: string
    argsHash: string
    previewHash: string
    executePath: string
    result: OperationExecuteResult<unknown>
    recordedAt: number
  },
) {
  const receiptId = await ctx.db.insert('destructiveAuditLog', {
    operationId: input.operationId,
    jti: input.jti,
    callerKey: input.callerKey,
    scopeKey: SCOPE_KEY,
    argsHash: input.argsHash,
    previewHash: input.previewHash,
    status: input.result.status,
    code: input.result.status === 'applied' ? null : input.result.code,
    message: input.result.status === 'applied' ? null : input.result.message,
    recordedAt: input.recordedAt,
    executePath: input.executePath,
  })
  if (input.result.status !== 'applied') {
    const identity = await ctx.appIdentity()
    await logActivity(ctx, {
      kind: `operation.${input.result.status}`,
      outcome: input.result.status,
      summary: `Guarded operation ${input.result.status}: ${input.operationId || 'unknown operation'}`,
      appIdentityId: identity?.userId ?? input.callerKey,
      subjectKey: input.operationId || null,
      detail: {
        operationId: input.operationId,
        receiptId: String(receiptId),
        code: input.result.code,
      },
      createdAt: input.recordedAt,
    })
  }
}

async function attachConfirmation(
  ctx: HandlerCtx,
  operation: CmsOperationDefinition,
  args: unknown,
  preview: PreviewResult,
): Promise<PreviewResult> {
  if (!preview.allowed || preview.confirm == null) return { ...preview, confirmation: null }

  const now = Date.now()
  const expiresAt = now + CONFIRMATION_TTL_MS
  const token = createToken()
  const jti = createToken()
  const argsHash = await hashValue(args)
  const previewHash = await hashPreview(preview)
  const versionHash = await hashValue(preview.version ?? null)
  const callerKey = await resolveCallerKey(ctx)

  await ctx.db.insert('destructiveConfirmations', {
    tokenHash: await sha256Hex(token),
    jti,
    operationId: operation.id ?? '',
    executePath: operation.executeFunctionRef ?? operation.id ?? '',
    previewPath: operation.id ? `${operation.id}:preview` : '',
    callerKey,
    scopeKey: SCOPE_KEY,
    argsHash,
    previewHash,
    versionHash,
    createdAt: now,
    expiresAt,
  })

  return {
    ...preview,
    confirmation: { token, expiresAt },
  }
}

async function resolveCallerKey(ctx: HandlerCtx): Promise<string> {
  const caller = ctx.cmsCaller ? await ctx.cmsCaller() : null
  if (caller?.kind === 'mcp') return `mcp:${caller.apiKeyId}`
  if (caller?.kind === 'user') return `user:${caller.userId}`

  const identity = ctx.appIdentity ? await ctx.appIdentity() : null
  if (identity?.userId) return `user:${identity.userId}`
  return 'anonymous'
}

async function hashPreview(preview: PreviewResult): Promise<string> {
  return await hashValue({
    allowed: preview.allowed,
    blockers: preview.blockers,
    warnings: preview.warnings,
    effects: preview.effects,
    summary: preview.summary,
    details: preview.details,
    confirm: preview.confirm,
    version: preview.version,
  })
}
