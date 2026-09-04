import {
  abortImport as abortImportArgs,
  applyImportBatch as applyImportBatchArgs,
  beginImportApply as beginImportApplyArgs,
  beginImportVerification as beginImportVerificationArgs,
  expireImport as expireImportArgs,
  finalizeImport as finalizeImportArgs,
  resumePortabilityRun as resumePortabilityRunArgs,
  sealImportPlan as sealImportPlanArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import { canManagePortability } from '../auth/checks.js'
import {
  callerAction,
  callerMutation,
  directInternalMutation,
  directInternalQuery,
  requireCmsContractWriteToken,
} from '../functions.js'
import {
  assertCmsContractWriteToken,
  cmsContractWriteTokenValidator,
  type CmsContractWriteToken,
} from '../lib/installedContract.js'
import {
  getImportRun as getRun,
  requireCurrentImportRun as requireCurrentRun,
  type ImportRun,
} from './importModel.js'
import {
  processCleanupPage,
  queueNextWorkPage,
  verifyImportTargetContract,
} from './importWorker.js'
import { assertImportPlanPayload } from './model.js'
import { portableRunStatusValidator, type PortableRunStatus } from './runStatus.js'
import { PORTABLE_WORK_LEASE_MS, type PortableWorkLease } from './worker.js'

const stateResult = v.object({ runId: v.string(), state: v.string() })
const processImportWorkPageRef = makeFunctionReference<
  'mutation',
  PortableWorkLease,
  { status: string }
>('portability/runs:processImportWorkPage')
const recordImportWorkFailureRef = makeFunctionReference<
  'mutation',
  PortableWorkLease & { error: string },
  { status: string }
>('portability/runs:recordImportWorkFailure')

const startImportSealWorkRef = makeFunctionReference<
  'mutation',
  {
    planId: string
    callerId: string
    payloadSha256: string
    contractWriteToken: CmsContractWriteToken
  },
  { runId: string; state: string; generation: number | null; token: string | null }
>('portability/runs:startImportSealWork')

const readImportWorkStatusRef = makeFunctionReference<
  'query',
  { runId: string; callerId: string; payloadSha256: string },
  { runId: string; state: string }
>('portability/runs:readImportWorkStatus')

export function defineSealImportPlan() {
  return callerAction.protected({
    id: 'portability:sealImportPlan',
    args: sealImportPlanArgs.args,
    guard: canManagePortability,
    returns: stateResult,
    handler: async (ctx, args): Promise<{ runId: string; state: string }> => {
      const identity = await ctx.appIdentity()
      const contractWriteToken = requireCmsContractWriteToken(ctx)
      const started = await ctx.runMutation(startImportSealWorkRef, {
        planId: args.planId,
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
        contractWriteToken,
      })
      if (started.generation !== null && started.token !== null) {
        try {
          await ctx.runMutation(processImportWorkPageRef, {
            runId: started.runId,
            generation: started.generation,
            token: started.token,
            contractWriteToken,
          })
        } catch (error) {
          await ctx.runMutation(recordImportWorkFailureRef, {
            runId: started.runId,
            generation: started.generation,
            token: started.token,
            contractWriteToken,
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
      }
      return await ctx.runQuery(readImportWorkStatusRef, {
        runId: started.runId,
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
      })
    },
  })
}

export function defineBeginImportApply() {
  return callerMutation.protected({
    id: 'portability:beginImportApply',
    args: beginImportApplyArgs.args,
    guard: canManagePortability,
    returns: stateResult,
    handler: async (ctx, args) => {
      const identity = await ctx.appIdentity()
      const run = await getRun(ctx, args.runId)
      if (run.callerId !== identity.userId || run.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable run caller or payload mismatch.')
      }
      if (run.state !== 'complete') {
        await verifyImportTargetContract(ctx, run.targetContentHash)
      }
      if (run.state === 'verifying' || run.state === 'complete') {
        return { runId: run.runId, state: run.state }
      }
      if (run.state === 'applying') {
        if (run.workPhase === null) return { runId: run.runId, state: 'applying' }
        if (run.workPhase !== 'apply') throw new Error('Portable apply worker phase is invalid.')
        const now = Date.now()
        if (
          run.workToken === null ||
          run.workLeaseExpiresAt === null ||
          run.workLeaseExpiresAt <= now ||
          run.workDeadLetteredAt !== null
        ) {
          await queueNextWorkPage(
            ctx,
            run,
            { workPhase: 'apply', workCursor: null },
            { scheduleProcess: false, callerClaim: true },
          )
        }
        return { runId: run.runId, state: 'applying' }
      }
      requireCurrentRun(run, {
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
        state: 'planned',
      })
      const payload = assertImportPlanPayload(run.payload)
      if (run.attachedAssetCount !== payload.assetCount) {
        throw new Error('Portable import cannot apply before every asset is attached.')
      }
      await queueNextWorkPage(
        ctx,
        run,
        {
          state: 'applying',
          workPhase: 'apply',
          workCursor: null,
        },
        { scheduleProcess: false, callerClaim: true },
      )
      return { runId: run.runId, state: 'applying' }
    },
  })
}

export function defineEnsureImportApplyWork() {
  return directInternalMutation({
    args: {
      runId: v.string(),
      callerId: v.string(),
      payloadSha256: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
    },
    returns: v.object({
      committed: v.number(),
      complete: v.boolean(),
      generation: v.union(v.number(), v.null()),
      token: v.union(v.string(), v.null()),
    }),
    handler: async (ctx, args) => {
      await assertCmsContractWriteToken(ctx, args.contractWriteToken)
      const run = await getRun(ctx, args.runId)
      requireCurrentRun(run, {
        callerId: args.callerId,
        payloadSha256: args.payloadSha256,
        state: 'applying',
      })
      await verifyImportTargetContract(ctx, run.targetContentHash)
      const payload = assertImportPlanPayload(run.payload)
      if (run.workPhase === null) {
        return {
          committed: run.committedItemCount,
          complete: run.committedItemCount === payload.itemCount,
          generation: null,
          token: null,
        }
      }
      if (run.workPhase !== 'apply') throw new Error('Portable apply worker phase is invalid.')
      const now = Date.now()
      if (
        run.workToken === null ||
        run.workLeaseExpiresAt === null ||
        run.workLeaseExpiresAt <= now ||
        run.workDeadLetteredAt !== null
      ) {
        const lease = await queueNextWorkPage(
          ctx,
          run,
          { workPhase: 'apply', workCursor: null },
          { scheduleProcess: false, callerClaim: true },
        )
        return {
          committed: run.committedItemCount,
          complete: false,
          generation: lease.generation,
          token: lease.token,
        }
      }
      if (run.workNextAttemptAt === null) {
        await ctx.db.patch(run._id, { workNextAttemptAt: now, updatedAt: now })
        return {
          committed: run.committedItemCount,
          complete: false,
          generation: run.workGeneration,
          token: run.workToken,
        }
      }
      return { committed: run.committedItemCount, complete: false, generation: null, token: null }
    },
  })
}

export function defineEnsureImportCleanupWork() {
  return directInternalMutation({
    args: {
      runId: v.string(),
      callerId: v.string(),
      payloadSha256: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
    },
    returns: v.object({
      generation: v.union(v.number(), v.null()),
      token: v.union(v.string(), v.null()),
    }),
    handler: async (ctx, args) => {
      await assertCmsContractWriteToken(ctx, args.contractWriteToken)
      const run = await getRun(ctx, args.runId)
      if (run.callerId !== args.callerId || run.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable run caller or payload mismatch.')
      }
      if (run.state !== 'aborted' && run.state !== 'expired') {
        throw new Error('Portable import cleanup is not ready.')
      }
      if (run.workPhase === null) return { generation: null, token: null }
      if (run.workPhase !== 'cleanup') throw new Error('Portable import cleanup phase is invalid.')
      const now = Date.now()
      if (
        run.workToken !== null &&
        run.workLeaseExpiresAt !== null &&
        run.workLeaseExpiresAt > now &&
        run.workDeadLetteredAt === null
      ) {
        return { generation: null, token: null }
      }
      const lease = await queueNextWorkPage(
        ctx,
        run,
        { workPhase: 'cleanup', workCursor: run.workCursor },
        { scheduleProcess: false, callerClaim: true },
      )
      return { generation: lease.generation, token: lease.token }
    },
  })
}

const ensureImportApplyWorkRef = makeFunctionReference<
  'mutation',
  {
    runId: string
    callerId: string
    payloadSha256: string
    contractWriteToken: CmsContractWriteToken
  },
  { committed: number; complete: boolean; generation: number | null; token: string | null }
>('portability/runs:ensureImportApplyWork')

const ensureImportCleanupWorkRef = makeFunctionReference<
  'mutation',
  {
    runId: string
    callerId: string
    payloadSha256: string
    contractWriteToken: CmsContractWriteToken
  },
  { generation: number | null; token: string | null }
>('portability/runs:ensureImportCleanupWork')

const readImportApplyStatusRef = makeFunctionReference<
  'query',
  { runId: string; callerId: string; payloadSha256: string },
  { committed: number; complete: boolean }
>('portability/runs:readImportApplyStatus')

const readPortabilityResumeInputRef = makeFunctionReference<
  'query',
  { runId: string; callerId: string },
  {
    mode: 'import' | 'export'
    planId: string | null
    payloadSha256: string
    state: string
  }
>('portability/runs:readPortabilityResumeInput')

const readPortabilityRunStatusRef = makeFunctionReference<
  'query',
  { runId: string },
  PortableRunStatus
>('portability/runs:readPortabilityRunStatus')

const ensureExportCleanupWorkRef = makeFunctionReference<
  'mutation',
  { runId: string; callerId: string; contractWriteToken: CmsContractWriteToken },
  { generation: number | null; token: string | null }
>('portability/exports:ensureExportCleanupWork')

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

export function defineReadImportApplyStatus() {
  return directInternalQuery({
    args: { runId: v.string(), callerId: v.string(), payloadSha256: v.string() },
    returns: v.object({ committed: v.number(), complete: v.boolean() }),
    handler: async (ctx, args) => {
      const run = await getRun(ctx, args.runId)
      if (run.callerId !== args.callerId || run.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable run caller or payload mismatch.')
      }
      const payload = assertImportPlanPayload(run.payload)
      return {
        committed: run.committedItemCount,
        complete: run.committedItemCount === payload.itemCount,
      }
    },
  })
}

export function defineApplyImportBatch() {
  return callerAction.protected({
    id: 'portability:applyImportBatch',
    args: applyImportBatchArgs.args,
    guard: canManagePortability,
    returns: v.object({ committed: v.number(), complete: v.boolean() }),
    handler: async (ctx, args): Promise<{ committed: number; complete: boolean }> => {
      const identity = await ctx.appIdentity()
      const contractWriteToken = requireCmsContractWriteToken(ctx)
      const work = await ctx.runMutation(ensureImportApplyWorkRef, {
        runId: args.runId,
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
        contractWriteToken,
      })
      if (!work.complete && work.generation !== null && work.token !== null) {
        try {
          await ctx.runMutation(processImportWorkPageRef, {
            runId: args.runId,
            generation: work.generation,
            token: work.token,
            contractWriteToken,
          })
        } catch (error) {
          await ctx.runMutation(recordImportWorkFailureRef, {
            runId: args.runId,
            generation: work.generation,
            token: work.token,
            contractWriteToken,
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
      }
      return await ctx.runQuery(readImportApplyStatusRef, {
        runId: args.runId,
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
      })
    },
  })
}

export function defineResumePortabilityRun() {
  return callerAction.protected({
    id: 'portability:resumePortabilityRun',
    args: resumePortabilityRunArgs.args,
    guard: canManagePortability,
    returns: portableRunStatusValidator,
    handler: async (ctx, args): Promise<PortableRunStatus> => {
      const identity = await ctx.appIdentity()
      const contractWriteToken = requireCmsContractWriteToken(ctx)
      const input = await ctx.runQuery(readPortabilityResumeInputRef, {
        runId: args.runId,
        callerId: identity.userId,
      })
      if (input.mode === 'export') {
        if (input.state === 'capturing' || input.state === 'ready') {
          throw new Error('Active portable exports resume through the original export command.')
        }
        const work = await ctx.runMutation(ensureExportCleanupWorkRef, {
          runId: args.runId,
          callerId: identity.userId,
          contractWriteToken,
        })
        if (work.generation !== null && work.token !== null) {
          try {
            await ctx.runMutation(processExportCleanupPageRef, {
              runId: args.runId,
              generation: work.generation,
              token: work.token,
              contractWriteToken,
            })
          } catch (error) {
            await ctx.runMutation(recordExportCleanupFailureRef, {
              runId: args.runId,
              generation: work.generation,
              token: work.token,
              contractWriteToken,
              error: error instanceof Error ? error.message : String(error),
            })
            throw error
          }
        }
        return await ctx.runQuery(readPortabilityRunStatusRef, { runId: args.runId })
      }
      let work: { generation: number | null; token: string | null } | null = null
      if (input.state === 'staging' || input.state === 'sealing') {
        if (input.planId === null) throw new Error('Portable import plan identity is missing.')
        work = await ctx.runMutation(startImportSealWorkRef, {
          planId: input.planId,
          callerId: identity.userId,
          payloadSha256: input.payloadSha256,
          contractWriteToken,
        })
      } else if (input.state === 'applying') {
        work = await ctx.runMutation(ensureImportApplyWorkRef, {
          runId: args.runId,
          callerId: identity.userId,
          payloadSha256: input.payloadSha256,
          contractWriteToken,
        })
      } else if (input.state === 'aborted' || input.state === 'expired') {
        work = await ctx.runMutation(ensureImportCleanupWorkRef, {
          runId: args.runId,
          callerId: identity.userId,
          payloadSha256: input.payloadSha256,
          contractWriteToken,
        })
      }
      if (work?.generation !== null && work?.generation !== undefined && work.token !== null) {
        try {
          await ctx.runMutation(processImportWorkPageRef, {
            runId: args.runId,
            generation: work.generation,
            token: work.token,
            contractWriteToken,
          })
        } catch (error) {
          await ctx.runMutation(recordImportWorkFailureRef, {
            runId: args.runId,
            generation: work.generation,
            token: work.token,
            contractWriteToken,
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
      }
      return await ctx.runQuery(readPortabilityRunStatusRef, { runId: args.runId })
    },
  })
}

export function defineBeginImportVerification() {
  return callerMutation.protected({
    id: 'portability:beginImportVerification',
    args: beginImportVerificationArgs.args,
    guard: canManagePortability,
    returns: stateResult,
    handler: async (ctx, args) => {
      const identity = await ctx.appIdentity()
      const run = await getRun(ctx, args.runId)
      if (run.callerId !== identity.userId || run.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable run caller or payload mismatch.')
      }
      if (run.state !== 'complete') {
        await verifyImportTargetContract(ctx, run.targetContentHash)
      }
      if (run.state === 'verifying' || run.state === 'complete') {
        return { runId: run.runId, state: run.state }
      }
      requireCurrentRun(run, {
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
        state: 'applying',
      })
      const payload = assertImportPlanPayload(run.payload)
      if (run.committedItemCount !== payload.itemCount) {
        throw new Error('Portable import cannot verify before every item is committed.')
      }
      await ctx.db.patch(run._id, { state: 'verifying', updatedAt: Date.now() })
      return { runId: run.runId, state: 'verifying' }
    },
  })
}

export function defineFinalizeImport() {
  return callerMutation.protected({
    id: 'portability:finalizeImport',
    args: finalizeImportArgs.args,
    guard: canManagePortability,
    returns: v.object({
      runId: v.string(),
      payloadSha256: v.string(),
      documentCount: v.number(),
      assetCount: v.number(),
      completedAt: v.number(),
    }),
    handler: async (ctx, args) => {
      const identity = await ctx.appIdentity()
      const run = await getRun(ctx, args.runId)
      if (run.state === 'complete') {
        if (run.callerId !== identity.userId || run.payloadSha256 !== args.payloadSha256) {
          throw new Error('Portable import receipt caller or payload mismatch.')
        }
        if (run.completedAt === null) throw new Error('Portable import completion is corrupt.')
        const payload = assertImportPlanPayload(run.payload)
        return {
          runId: run.runId,
          payloadSha256: run.payloadSha256,
          documentCount: payload.itemCount,
          assetCount: payload.assetCount,
          completedAt: run.completedAt,
        }
      }
      requireCurrentRun(run, {
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
        state: 'verifying',
      })
      await verifyImportTargetContract(ctx, run.targetContentHash)
      const payload = assertImportPlanPayload(run.payload)
      if (
        run.committedItemCount !== payload.itemCount ||
        run.attachedAssetCount !== payload.assetCount
      ) {
        throw new Error('Portable import is incomplete.')
      }
      const completedAt = Date.now()
      const result = {
        runId: run.runId,
        payloadSha256: run.payloadSha256,
        documentCount: payload.itemCount,
        assetCount: payload.assetCount,
        completedAt,
      }
      await ctx.db.patch(run._id, { state: 'complete', completedAt, updatedAt: completedAt })
      return result
    },
  })
}

export function defineAbortImport() {
  return callerMutation.protected({
    id: 'portability:abortImport',
    args: abortImportArgs.args,
    guard: canManagePortability,
    returns: stateResult,
    handler: async (ctx, args) => {
      const identity = await ctx.appIdentity()
      const run = await getRun(ctx, args.runId)
      if (run.callerId !== identity.userId || run.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable run caller or payload mismatch.')
      }
      if (run.state === 'aborted') {
        const now = Date.now()
        if (
          run.workPhase === 'cleanup' &&
          (run.workToken === null ||
            run.workLeaseExpiresAt === null ||
            run.workLeaseExpiresAt <= now ||
            run.workDeadLetteredAt !== null)
        ) {
          await queueNextWorkPage(ctx, run, { workPhase: 'cleanup' })
        }
        return { runId: run.runId, state: run.state }
      }
      if (run.state === 'complete' || run.state === 'expired') {
        throw new Error(`Terminal portable run state ${run.state} cannot be aborted.`)
      }
      if (run.expiresAt <= Date.now()) {
        throw new Error('Portable run expired and must be closed as expired.')
      }
      const cleanupRun: ImportRun = {
        ...run,
        state: 'aborted',
        workPhase: 'cleanup',
        workCursor: null,
        workGeneration: run.workGeneration + 1,
        workToken: 'guarded-operation',
        workLeaseExpiresAt: Date.now() + PORTABLE_WORK_LEASE_MS,
        workAttempts: 0,
        workNextAttemptAt: Date.now(),
        workLastError: null,
        workDeadLetteredAt: null,
      }
      await ctx.db.patch(run._id, {
        state: cleanupRun.state,
        workPhase: cleanupRun.workPhase,
        workCursor: cleanupRun.workCursor,
        workGeneration: cleanupRun.workGeneration,
        workToken: cleanupRun.workToken,
        workLeaseExpiresAt: cleanupRun.workLeaseExpiresAt,
        workAttempts: 0,
        workNextAttemptAt: cleanupRun.workNextAttemptAt,
        workLastError: null,
        workDeadLetteredAt: null,
        updatedAt: Date.now(),
      })
      await processCleanupPage(ctx, cleanupRun)
      return { runId: run.runId, state: 'aborted' }
    },
  })
}

export function defineExpireImport() {
  return callerMutation.protected({
    id: 'portability:expireImport',
    args: expireImportArgs.args,
    guard: canManagePortability,
    returns: stateResult,
    handler: async (ctx, args) => {
      const identity = await ctx.appIdentity()
      const run = await getRun(ctx, args.runId)
      if (run.callerId !== identity.userId || run.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable run caller or payload mismatch.')
      }
      if (run.state === 'expired') {
        const now = Date.now()
        if (
          run.workPhase === 'cleanup' &&
          (run.workToken === null ||
            run.workLeaseExpiresAt === null ||
            run.workLeaseExpiresAt <= now ||
            run.workDeadLetteredAt !== null)
        ) {
          await queueNextWorkPage(ctx, run, { workPhase: 'cleanup' })
        }
        return { runId: run.runId, state: run.state }
      }
      if (run.state === 'complete' || run.state === 'aborted') {
        throw new Error(`Terminal portable run state ${run.state} cannot expire.`)
      }
      if (run.expiresAt > Date.now()) throw new Error('Portable run has not expired.')
      const cleanupRun: ImportRun = {
        ...run,
        state: 'expired',
        workPhase: 'cleanup',
        workCursor: null,
        workGeneration: run.workGeneration + 1,
        workToken: 'guarded-operation',
        workLeaseExpiresAt: Date.now() + PORTABLE_WORK_LEASE_MS,
        workAttempts: 0,
        workNextAttemptAt: Date.now(),
        workLastError: null,
        workDeadLetteredAt: null,
      }
      await ctx.db.patch(run._id, {
        state: cleanupRun.state,
        workPhase: cleanupRun.workPhase,
        workCursor: cleanupRun.workCursor,
        workGeneration: cleanupRun.workGeneration,
        workToken: cleanupRun.workToken,
        workLeaseExpiresAt: cleanupRun.workLeaseExpiresAt,
        workAttempts: 0,
        workNextAttemptAt: cleanupRun.workNextAttemptAt,
        workLastError: null,
        workDeadLetteredAt: null,
        updatedAt: Date.now(),
      })
      await processCleanupPage(ctx, cleanupRun)
      return { runId: run.runId, state: 'expired' }
    },
  })
}
