import {
  abortExportRun as abortExportRunArgs,
  completeExportRun as completeExportRunArgs,
  expireExportRun as expireExportRunArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import { internalAction, internalMutation } from '../_generated/server.js'
import { canManagePortability } from '../auth/checks.js'
import { callerMutation } from '../functions.js'
import {
  assertCmsContractWriteToken,
  cmsContractWriteTokenValidator,
} from '../lib/installedContract.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { getExportRun, requireOwnedExport, type ExportRun } from './exportModel.js'
import { assertSha256 } from './model.js'
import {
  claimPortableWork,
  clearPortableWorkFields,
  failPortableWork,
  type PortableWorkerRefs,
  type PortableWorkLease,
} from './worker.js'

const CLEANUP_PAGE_SIZE = 100

const runExportCleanupPageRef = makeFunctionReference<'action', PortableWorkLease, null>(
  'portability/exports:runExportCleanupPage',
)

const processExportCleanupPageRef = makeFunctionReference<
  'mutation',
  PortableWorkLease,
  { status: string }
>('portability/exports:processExportCleanupPage')

const recordExportCleanupFailureRef = makeFunctionReference<
  'mutation',
  PortableWorkLease & { error: string },
  { status: string }
>('portability/exports:recordExportCleanupFailure')

const expireExportCleanupLeaseRef = makeFunctionReference<'mutation', PortableWorkLease, null>(
  'portability/exports:expireExportCleanupLease',
)

const exportCleanupWorkerRefs: PortableWorkerRefs = {
  run: runExportCleanupPageRef,
  watchdog: expireExportCleanupLeaseRef,
}

export function defineCompleteExportRun() {
  return callerMutation.protected({
    id: 'portability:completeExportRun',
    args: completeExportRunArgs.args,
    guard: canManagePortability,
    returns: v.object({
      state: v.literal('complete'),
      manifestSha256: v.string(),
      documentCount: v.number(),
      assetCount: v.number(),
    }),
    handler: async (ctx, args) => {
      const run = await requireOwnedExport(ctx, args.runId)
      assertSha256(args.manifestSha256, 'manifestSha256')
      if (run.state === 'complete') {
        if (
          run.manifestSha256 !== args.manifestSha256 ||
          run.documentCount !== args.documentCount ||
          run.assetCount !== args.assetCount
        ) {
          throw new Error('Portable export completion conflicts with its existing receipt.')
        }
        await ensureExportCleanupQueued(ctx, run)
        return {
          state: 'complete',
          manifestSha256: args.manifestSha256,
          documentCount: args.documentCount,
          assetCount: args.assetCount,
        }
      }
      if (run.state !== 'ready') throw new Error('Portable export is not ready for completion.')
      if (args.documentCount !== run.documentCount || args.assetCount !== run.assetCount) {
        throw new Error('Portable export completion counts do not match the sealed roster.')
      }
      const completedAt = Date.now()
      await ctx.db.patch(run._id, {
        state: 'complete',
        manifestSha256: args.manifestSha256,
        completedAt,
        updatedAt: completedAt,
      })
      await cleanupExportRowsAndContinue(ctx, run)
      return {
        state: 'complete',
        manifestSha256: args.manifestSha256,
        documentCount: args.documentCount,
        assetCount: args.assetCount,
      }
    },
  })
}

export function defineAbortExportRun() {
  return callerMutation.protected({
    id: 'portability:abortExportRun',
    args: abortExportRunArgs.args,
    guard: canManagePortability,
    returns: v.object({ state: v.literal('aborted') }),
    handler: async (ctx, args) => {
      const run = await requireOwnedExport(ctx, args.runId)
      if (run.state === 'aborted') {
        await ensureExportCleanupQueued(ctx, run)
        return { state: 'aborted' }
      }
      if (run.state === 'complete' || run.state === 'expired') {
        throw new Error(`Terminal portable export state ${run.state} cannot be aborted.`)
      }
      await ctx.db.patch(run._id, {
        state: 'aborted',
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: Date.now(),
      })
      await cleanupExportRowsAndContinue(ctx, run)
      return { state: 'aborted' }
    },
  })
}

export function defineExpireExportRun() {
  return callerMutation.protected({
    id: 'portability:expireExportRun',
    args: expireExportRunArgs.args,
    guard: canManagePortability,
    returns: v.object({ state: v.literal('expired') }),
    handler: async (ctx, args) => {
      const run = await requireOwnedExport(ctx, args.runId)
      if (run.state === 'expired') {
        await ensureExportCleanupQueued(ctx, run)
        return { state: 'expired' }
      }
      if (run.state === 'complete' || run.state === 'aborted') {
        throw new Error(`Terminal portable export state ${run.state} cannot expire.`)
      }
      if (run.expiresAt > Date.now())
        throw new Error('Portable export has not reached its deadline.')
      await ctx.db.patch(run._id, {
        state: 'expired',
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: Date.now(),
      })
      await cleanupExportRowsAndContinue(ctx, run)
      return { state: 'expired' }
    },
  })
}

export function defineExpireExportLeaseInternal() {
  return internalMutation({
    args: {
      runId: v.string(),
      leaseGeneration: v.number(),
      leaseExpiresAt: v.number(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const row = await ctx.db
        .query('portableRuns')
        .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
        .unique()
      if (
        row?.mode !== 'export' ||
        row.state !== 'capturing' ||
        row.leaseGeneration !== args.leaseGeneration ||
        row.leaseExpiresAt !== args.leaseExpiresAt ||
        row.leaseExpiresAt > Date.now()
      ) {
        return null
      }
      await ctx.db.patch(row._id, {
        state: 'expired',
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: Date.now(),
      })
      await cleanupExportRowsAndContinue(ctx, row)
      return null
    },
  })
}

export function defineExpireExportRunInternal() {
  return internalMutation({
    args: { runId: v.string(), expiresAt: v.number() },
    returns: v.null(),
    handler: async (ctx, args) => {
      const row = await ctx.db
        .query('portableRuns')
        .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
        .unique()
      if (
        row?.mode !== 'export' ||
        row.expiresAt !== args.expiresAt ||
        row.expiresAt > Date.now() ||
        row.state === 'complete' ||
        row.state === 'aborted' ||
        row.state === 'expired'
      ) {
        return null
      }
      await ctx.db.patch(row._id, {
        state: 'expired',
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: Date.now(),
      })
      await cleanupExportRowsAndContinue(ctx, row)
      return null
    },
  })
}

function isTerminalExport(run: ExportRun) {
  return run.state === 'complete' || run.state === 'aborted' || run.state === 'expired'
}

async function deleteExportRowsPage(ctx: MutationCtx, runId: string) {
  const roster = await ctx.db
    .query('portableItems')
    .withIndex('by_run_index', (query) => query.eq('runId', runId))
    .take(CLEANUP_PAGE_SIZE)
  for (const row of roster) await ctx.db.delete(row._id)
  const remaining = CLEANUP_PAGE_SIZE - roster.length
  const assets =
    remaining > 0
      ? await ctx.db
          .query('portableAssets')
          .withIndex('by_run', (query) => query.eq('runId', runId))
          .take(remaining)
      : []
  for (const row of assets) await ctx.db.delete(row._id)
  const deleted = roster.length + assets.length
  const cursor =
    assets.length > 0
      ? `asset:${assets.at(-1)!.sha256}`
      : roster.length > 0
        ? `item:${roster.at(-1)!.index}`
        : null
  return { deleted, complete: deleted < CLEANUP_PAGE_SIZE, cursor }
}

async function hasExportRows(ctx: QueryOrMutationCtx, runId: string) {
  const item = await ctx.db
    .query('portableItems')
    .withIndex('by_run', (query) => query.eq('runId', runId))
    .first()
  if (item) return true
  return Boolean(
    await ctx.db
      .query('portableAssets')
      .withIndex('by_run', (query) => query.eq('runId', runId))
      .first(),
  )
}

async function cleanupExportRowsAndContinue(ctx: MutationCtx, run: ExportRun) {
  const page = await deleteExportRowsPage(ctx, run.runId)
  if (page.complete) {
    await ctx.db.patch(run._id, { ...clearPortableWorkFields(), updatedAt: Date.now() })
    return page
  }
  await claimPortableWork(ctx, run, exportCleanupWorkerRefs, {
    workPhase: 'cleanup',
    workCursor: page.cursor,
  })
  return page
}

async function ensureExportCleanupQueued(
  ctx: MutationCtx,
  run: ExportRun,
  options: { callerClaim?: boolean } = {},
) {
  if (!isTerminalExport(run)) throw new Error('Portable export cleanup is not ready.')
  if (!(await hasExportRows(ctx, run.runId))) {
    await ctx.db.patch(run._id, { ...clearPortableWorkFields(), updatedAt: Date.now() })
    return null
  }
  const now = Date.now()
  if (
    run.workPhase === 'cleanup' &&
    run.workToken !== null &&
    run.workLeaseExpiresAt !== null &&
    run.workLeaseExpiresAt > now &&
    run.workDeadLetteredAt === null
  ) {
    return null
  }
  return await claimPortableWork(
    ctx,
    run,
    exportCleanupWorkerRefs,
    { workPhase: 'cleanup', workCursor: run.workCursor },
    options.callerClaim === true ? { scheduleProcess: false, callerClaim: true } : {},
  )
}

export function defineEnsureExportCleanupWork() {
  return internalMutation({
    args: {
      runId: v.string(),
      callerId: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
    },
    returns: v.object({
      generation: v.union(v.number(), v.null()),
      token: v.union(v.string(), v.null()),
    }),
    handler: async (ctx, args) => {
      await assertCmsContractWriteToken(ctx, args.contractWriteToken)
      const run = await getExportRun(ctx, args.runId)
      if (run.callerId !== args.callerId) throw new Error('Portable run belongs to another caller.')
      const lease = await ensureExportCleanupQueued(ctx, run, { callerClaim: true })
      return lease
        ? { generation: lease.generation, token: lease.token }
        : { generation: null, token: null }
    },
  })
}

export function defineProcessExportCleanupPage() {
  return internalMutation({
    args: {
      runId: v.string(),
      generation: v.number(),
      token: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
    },
    returns: v.object({ status: v.string() }),
    handler: async (ctx, args) => {
      await assertCmsContractWriteToken(ctx, args.contractWriteToken)
      const run = await getExportRun(ctx, args.runId)
      if (
        run.workGeneration !== args.generation ||
        run.workToken !== args.token ||
        run.workLeaseExpiresAt === null ||
        run.workPhase !== 'cleanup' ||
        !isTerminalExport(run)
      ) {
        return { status: 'stale' }
      }
      await cleanupExportRowsAndContinue(ctx, run)
      return { status: 'applied' }
    },
  })
}

export function defineRunExportCleanupPage() {
  return internalAction({
    args: {
      runId: v.string(),
      generation: v.number(),
      token: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      try {
        await ctx.runMutation(processExportCleanupPageRef, args)
      } catch (error) {
        await ctx.runMutation(recordExportCleanupFailureRef, {
          ...args,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return null
    },
  })
}

export function defineRecordExportCleanupFailure() {
  return internalMutation({
    args: {
      runId: v.string(),
      generation: v.number(),
      token: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
      error: v.string(),
    },
    returns: v.object({ status: v.string() }),
    handler: async (ctx, args) => {
      await assertCmsContractWriteToken(ctx, args.contractWriteToken)
      const run = await getExportRun(ctx, args.runId)
      if (run.workGeneration !== args.generation || run.workToken !== args.token) {
        return { status: 'stale' }
      }
      return await failPortableWork(ctx, run, exportCleanupWorkerRefs, args.error)
    },
  })
}

export function defineExpireExportCleanupLease() {
  return internalMutation({
    args: {
      runId: v.string(),
      generation: v.number(),
      token: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      await assertCmsContractWriteToken(ctx, args.contractWriteToken)
      const run = await getExportRun(ctx, args.runId)
      if (
        run.workGeneration !== args.generation ||
        run.workToken !== args.token ||
        run.workLeaseExpiresAt === null ||
        run.workLeaseExpiresAt > Date.now()
      ) {
        return null
      }
      await failPortableWork(
        ctx,
        run,
        exportCleanupWorkerRefs,
        'Portable export cleanup lease expired before completion.',
      )
      return null
    },
  })
}
