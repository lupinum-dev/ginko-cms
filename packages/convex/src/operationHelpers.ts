import type { CmsCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { v } from 'convex/values'

const CONFIRMATION_TTL_MS = 5 * 60_000
const SCOPE_KEY = 'ginko-cms'

type CmsOperationDefinition = {
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

type HandlerCtx = {
  db: any
  cmsCaller?: () => Promise<CmsCaller>
  appIdentity?: () => Promise<{ userId: string } | null>
}

export type CmsOperationHandle = {
  id: string
  executeRef: unknown
  previewRef?: unknown
}

export function defineCmsOperation<const TDefinition extends CmsOperationDefinition>(
  definition: TDefinition,
): TDefinition {
  return definition
}

defineCmsOperation.withContext =
  <TCtx>() =>
  <const TDefinition extends CmsOperationDefinition>(definition: TDefinition): TDefinition =>
    definition

export function definePreview(operation: CmsOperationDefinition): CmsOperationDefinition {
  if (!operation.preview) {
    throw new Error('A preview handler is required.')
  }

  return {
    id: operation.id ? `${operation.id}:preview` : undefined,
    args: operation.args,
    guard: operation.guard,
    returns: operation.previewReturns,
    load: operation.load,
    handler: async (ctx: HandlerCtx, args: unknown, loaded: unknown) => {
      const preview = (await operation.preview!(ctx, args, loaded)) as PreviewResult
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
  return v.any()
}

export async function executeDestructiveOperation(
  ctx: HandlerCtx,
  operation: CmsOperationDefinition,
  args: Record<string, unknown>,
  loaded: unknown,
  token: string,
) {
  if (operation.kind !== 'destructive') return
  if (!operation.preview) throw new Error('Destructive operation requires a preview handler.')

  const now = Date.now()
  const tokenHash = await sha256Hex(token)
  const confirmation = await ctx.db
    .query('destructiveConfirmations')
    .withIndex('by_token_hash', (q: any) => q.eq('tokenHash', tokenHash))
    .first()

  if (!confirmation) throw new Error('Destructive confirmation was not found.')
  if (confirmation.redeemedAt != null) throw new Error('Destructive confirmation was already used.')
  if (confirmation.expiresAt <= now) throw new Error('Destructive confirmation expired.')

  const callerKey = await resolveCallerKey(ctx)
  const argsHash = await hashValue(args)
  const currentPreview = (await operation.preview(ctx, args, loaded)) as PreviewResult
  if (!currentPreview.allowed) throw new Error('Destructive operation is no longer allowed.')
  const previewHash = await hashPreview(currentPreview)
  const versionHash = await hashValue(currentPreview.version ?? null)

  assertMatches(confirmation.operationId, operation.id ?? '', 'operation')
  assertMatches(
    confirmation.executePath,
    operation.executeFunctionRef ?? operation.id ?? '',
    'execute path',
  )
  assertMatches(confirmation.callerKey, callerKey, 'caller')
  assertMatches(confirmation.scopeKey, SCOPE_KEY, 'scope')
  assertMatches(confirmation.argsHash, argsHash, 'arguments')
  assertMatches(confirmation.previewHash, previewHash, 'preview')
  if (confirmation.versionHash !== undefined) {
    assertMatches(confirmation.versionHash, versionHash, 'version')
  }

  await ctx.db.patch(confirmation._id, { redeemedAt: now })
  await ctx.db.insert('destructiveAuditLog', {
    operationId: confirmation.operationId,
    jti: confirmation.jti,
    callerKey,
    scopeKey: SCOPE_KEY,
    argsHash,
    previewHash,
    executedAt: now,
    executePath: confirmation.executePath,
  })
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
  if (caller?.kind === 'mcp') return `mcp:${caller.mcpKeyId}`
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

async function hashValue(value: unknown): Promise<string> {
  return await sha256Hex(stableJson(value))
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createToken(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
    .join(',')}}`
}

function assertMatches(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new Error(`Destructive confirmation ${label} mismatch.`)
  }
}
