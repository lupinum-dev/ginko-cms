import {
  getPortabilityRunStatus as getPortabilityRunStatusArgs,
  inspectPortableAssets as inspectPortableAssetsArgs,
  inspectPortableDrafts as inspectPortableDraftsArgs,
  listPortabilityItemReceipts as listPortabilityItemReceiptsArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { hashCanonicalJson } from '@lupinum/ginko-content/portability'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { canManagePortability } from '../auth/checks.js'
import { callerQuery, directInternalQuery } from '../functions.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import { readActiveAssetMatch } from './importModel.js'
import { inspectPortableDraft } from './items.js'
import { assertImportPlanPayload, assertSha256, PORTABLE_PLAN_PAGE_LIMIT } from './model.js'

export function defineInspectPortableDrafts() {
  return callerQuery.protected({
    id: 'portability:inspectPortableDrafts',
    args: inspectPortableDraftsArgs.args,
    guard: canManagePortability,
    returns: v.array(
      v.object({
        itemKey: v.string(),
        currentDraftSha256: v.union(v.string(), v.null()),
        currentSharedSha256: v.union(v.string(), v.null()),
      }),
    ),
    handler: async (ctx, args) => {
      if (args.items.length === 0 || args.items.length > PORTABLE_PLAN_PAGE_LIMIT) {
        throw new Error(`Portable inspection pages contain 1-${PORTABLE_PLAN_PAGE_LIMIT} rows.`)
      }
      const seen = new Set<string>()
      const result = []
      for (const item of args.items) {
        if (seen.has(item.itemKey)) throw new Error('Portable inspection page has duplicate keys.')
        seen.add(item.itemKey)
        if ((await hashCanonicalJson(item.identity)) !== item.itemKey) {
          throw new Error('Portable inspection item key mismatch.')
        }
        result.push({ itemKey: item.itemKey, ...(await inspectPortableDraft(ctx, item.identity)) })
      }
      return result
    },
  })
}

export function defineInspectPortableAssets() {
  return callerQuery.protected({
    id: 'portability:inspectPortableAssets',
    args: inspectPortableAssetsArgs.args,
    guard: canManagePortability,
    returns: v.array(
      v.object({
        sha256: v.string(),
        current: v.union(
          v.object({
            assetId: v.string(),
            bytes: v.number(),
            mediaType: v.string(),
          }),
          v.null(),
        ),
      }),
    ),
    handler: async (ctx, args) => {
      if (args.assets.length === 0 || args.assets.length > PORTABLE_PLAN_PAGE_LIMIT) {
        throw new Error(
          `Portable asset inspection pages contain 1-${PORTABLE_PLAN_PAGE_LIMIT} rows.`,
        )
      }
      const seen = new Set<string>()
      const result = []
      for (const asset of args.assets) {
        assertSha256(asset.sha256, 'asset sha256')
        if (seen.has(asset.sha256))
          throw new Error('Portable asset inspection has duplicate hashes.')
        seen.add(asset.sha256)
        const { active, exact } = await readActiveAssetMatch(ctx, asset)
        const current = exact ?? active
        result.push({
          sha256: asset.sha256,
          current: current
            ? {
                assetId: String(current._id),
                bytes: current.size,
                mediaType: current.mimeType,
              }
            : null,
        })
      }
      return result
    },
  })
}

type PortableItemOutcome = 'applied' | 'blocked' | 'failed' | 'pending' | 'skipped'

export type PortableRunStatus = {
  runId: string
  mode: 'import' | 'export'
  state: string
  phase: string | null
  generation: number
  leaseExpiresAt: number | null
  attempts: number
  nextAttemptAt: number | null
  lastError: string | null
  deadLetteredAt: number | null
  itemCount: number
  committedItemCount: number
  assetCount: number
  attachedAssetCount: number
  completedAt: number | null
  itemReceipts: Array<{
    index: number
    itemKey: string
    outcome: PortableItemOutcome
    state: string
    effect: string | null
    resultId: string | null
    committedAt: number | null
  }>
}

const portableItemOutcomeValidator = v.union(
  v.literal('applied'),
  v.literal('blocked'),
  v.literal('failed'),
  v.literal('pending'),
  v.literal('skipped'),
)

const portableItemReceiptValidator = v.object({
  index: v.number(),
  itemKey: v.string(),
  outcome: portableItemOutcomeValidator,
  state: v.string(),
  effect: v.union(v.string(), v.null()),
  resultId: v.union(v.string(), v.null()),
  committedAt: v.union(v.number(), v.null()),
})

export const portableRunStatusValidator = v.object({
  runId: v.string(),
  mode: v.union(v.literal('import'), v.literal('export')),
  state: v.string(),
  phase: v.union(v.string(), v.null()),
  generation: v.number(),
  leaseExpiresAt: v.union(v.number(), v.null()),
  attempts: v.number(),
  nextAttemptAt: v.union(v.number(), v.null()),
  lastError: v.union(v.string(), v.null()),
  deadLetteredAt: v.union(v.number(), v.null()),
  itemCount: v.number(),
  committedItemCount: v.number(),
  assetCount: v.number(),
  attachedAssetCount: v.number(),
  completedAt: v.union(v.number(), v.null()),
  itemReceipts: v.array(portableItemReceiptValidator),
})

function portableItemOutcome(
  run: Doc<'portableRuns'>,
  item: Doc<'portableItems'>,
): PortableItemOutcome {
  if (item.mode === 'export') return run.state === 'complete' ? 'applied' : 'pending'
  if (item.state === 'committed') return item.effect === 'skipped' ? 'skipped' : 'applied'
  if (run.workLastError === null) return 'pending'
  if (run.workPhase === 'seal-items' || run.workPhase === 'seal-assets') return 'blocked'
  if (run.workPhase === 'apply') return 'failed'
  return 'pending'
}

function portableItemReceipt(run: Doc<'portableRuns'>, item: Doc<'portableItems'>) {
  return {
    index: item.index,
    itemKey: item.itemKey,
    outcome: portableItemOutcome(run, item),
    state: item.state,
    effect: item.effect,
    resultId: item.resultId,
    committedAt: item.committedAt,
  }
}

async function portableRunStatus(
  ctx: QueryOrMutationCtx,
  runId: string,
  callerId?: string,
): Promise<PortableRunStatus> {
  const run = await ctx.db
    .query('portableRuns')
    .withIndex('by_run_id', (query) => query.eq('runId', runId))
    .unique()
  if (!run) throw new Error('Portable run not found.')
  if (callerId !== undefined && run.callerId !== callerId) {
    throw new Error('Portable run belongs to another caller.')
  }
  const receipts = await ctx.db
    .query('portableItems')
    .withIndex('by_run_index', (query) => query.eq('runId', run.runId))
    .order('desc')
    .take(25)
  if (run.mode === 'import') {
    const payload = assertImportPlanPayload(run.payload)
    return {
      runId: run.runId,
      mode: run.mode,
      state: run.workDeadLetteredAt === null ? run.state : 'failed',
      phase: run.workPhase,
      generation: run.workGeneration,
      leaseExpiresAt: run.workLeaseExpiresAt,
      attempts: run.workAttempts,
      nextAttemptAt: run.workNextAttemptAt,
      lastError: run.workLastError,
      deadLetteredAt: run.workDeadLetteredAt,
      itemCount: payload.itemCount,
      committedItemCount: run.committedItemCount,
      assetCount: payload.assetCount,
      attachedAssetCount: run.attachedAssetCount,
      completedAt: run.completedAt,
      itemReceipts: receipts.map((item) => portableItemReceipt(run, item)),
    }
  }
  return {
    runId: run.runId,
    mode: run.mode,
    state: run.workDeadLetteredAt === null ? run.state : 'failed',
    phase: run.workPhase ?? (run.state === 'capturing' ? 'capture' : null),
    generation: run.workPhase === null ? run.leaseGeneration : run.workGeneration,
    leaseExpiresAt: run.workPhase === null ? run.leaseExpiresAt : run.workLeaseExpiresAt,
    attempts: run.workAttempts,
    nextAttemptAt: run.workNextAttemptAt,
    lastError: run.workLastError,
    deadLetteredAt: run.workDeadLetteredAt,
    itemCount: run.documentCount,
    committedItemCount: run.documentCount,
    assetCount: run.assetCount,
    attachedAssetCount: run.assetCount,
    completedAt: run.completedAt,
    itemReceipts: receipts.map((item) => portableItemReceipt(run, item)),
  }
}

export function defineGetPortabilityRunStatus() {
  return callerQuery.protected({
    id: 'portability:getPortabilityRunStatus',
    args: getPortabilityRunStatusArgs.args,
    guard: canManagePortability,
    returns: portableRunStatusValidator,
    handler: async (ctx, args) => {
      const identity = await ctx.appIdentity()
      return await portableRunStatus(ctx, args.runId, identity.userId)
    },
  })
}

export function defineListPortabilityItemReceipts() {
  return callerQuery.protected({
    id: 'portability:listPortabilityItemReceipts',
    args: listPortabilityItemReceiptsArgs.args,
    guard: canManagePortability,
    returns: v.object({
      receipts: v.array(portableItemReceiptValidator),
      cursor: v.union(v.number(), v.null()),
    }),
    handler: async (ctx, args) => {
      if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100) {
        throw new Error('Portable receipt pages contain 1-100 scanned rows.')
      }
      if (args.cursor !== null && (!Number.isSafeInteger(args.cursor) || args.cursor < 0)) {
        throw new Error('Portable receipt cursor is invalid.')
      }
      const identity = await ctx.appIdentity()
      const run = await ctx.db
        .query('portableRuns')
        .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
        .unique()
      if (!run) throw new Error('Portable run not found.')
      if (run.callerId !== identity.userId)
        throw new Error('Portable run belongs to another caller.')
      const indexed = ctx.db.query('portableItems').withIndex('by_run_index', (query) => {
        const scoped = query.eq('runId', run.runId)
        return args.cursor === null ? scoped : scoped.gt('index', args.cursor)
      })
      const fetched = await indexed.take(args.limit + 1)
      const scanned = fetched.slice(0, args.limit)
      const receipts = scanned
        .map((item) => portableItemReceipt(run, item))
        .filter((receipt) => args.filter === 'all' || receipt.outcome === args.filter)
      return {
        receipts,
        cursor: fetched.length > args.limit && scanned.length > 0 ? scanned.at(-1)!.index : null,
      }
    },
  })
}

export function defineReadPortabilityRunStatus() {
  return directInternalQuery({
    args: { runId: v.string() },
    returns: portableRunStatusValidator,
    handler: async (ctx, args) => await portableRunStatus(ctx, args.runId),
  })
}

export function defineReadPortabilityResumeInput() {
  return directInternalQuery({
    args: { runId: v.string(), callerId: v.string() },
    returns: v.object({
      mode: v.union(v.literal('import'), v.literal('export')),
      planId: v.union(v.string(), v.null()),
      payloadSha256: v.string(),
      state: v.string(),
    }),
    handler: async (ctx, args) => {
      const run = await ctx.db
        .query('portableRuns')
        .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
        .unique()
      if (!run) throw new Error('Portable run not found.')
      if (run.callerId !== args.callerId) throw new Error('Portable run belongs to another caller.')
      return {
        mode: run.mode,
        planId: run.planId,
        payloadSha256: run.payloadSha256,
        state: run.state,
      }
    },
  })
}
