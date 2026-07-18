import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { internalAction, internalMutation } from '../_generated/server.js'
import { canManagePortability } from '../auth/checks.js'
import { callerMutation, callerQuery } from '../functions.js'
import type { MutationCtx } from '../lib/types.js'
import {
  activateAssetReferenceProof,
  readAssetReferenceCanonicalGeneration,
} from './assetReferenceProof.js'
import { processProjectionRepairPhasePage } from './projectionRepairPages.js'
import {
  createProjectionRepairLease,
  failProjectionRepairLease,
  projectionRepairLeasePatch,
  type ProjectionRepairLease,
  type ProjectionRepairWorkerRefs,
  scheduleProjectionRepairLease,
} from './projectionRepairWorker.js'

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 25

const repairPhaseValidator = v.union(
  v.literal('entries'),
  v.literal('drafts'),
  v.literal('revisions'),
  v.literal('draftSearchRows'),
  v.literal('publicRows'),
  v.literal('publicSearchRows'),
  v.literal('assetRefs'),
  v.literal('verifyEntries'),
  v.literal('verifyDrafts'),
  v.literal('verifyRevisions'),
  v.literal('verifyDraftSearchRows'),
  v.literal('verifyPublicRows'),
  v.literal('verifyPublicSearchRows'),
  v.literal('verifyAssetRefs'),
)

const repairLeaseArgs = {
  runId: v.string(),
  generation: v.number(),
  workGeneration: v.number(),
  token: v.string(),
  expectedPhase: repairPhaseValidator,
  expectedCursor: v.union(v.string(), v.null()),
}

export type RepairPhase =
  | 'entries'
  | 'drafts'
  | 'revisions'
  | 'draftSearchRows'
  | 'publicRows'
  | 'publicSearchRows'
  | 'assetRefs'
  | 'verifyEntries'
  | 'verifyDrafts'
  | 'verifyRevisions'
  | 'verifyDraftSearchRows'
  | 'verifyPublicRows'
  | 'verifyPublicSearchRows'
  | 'verifyAssetRefs'

const REPAIR_PHASES: RepairPhase[] = [
  'entries',
  'drafts',
  'revisions',
  'draftSearchRows',
  'publicRows',
  'publicSearchRows',
  'assetRefs',
  'verifyEntries',
  'verifyDrafts',
  'verifyRevisions',
  'verifyDraftSearchRows',
  'verifyPublicRows',
  'verifyPublicSearchRows',
  'verifyAssetRefs',
]

const repairRunStatusValidator = v.object({
  runId: v.string(),
  state: v.union(
    v.literal('running'),
    v.literal('complete'),
    v.literal('failed'),
    v.literal('dead'),
  ),
  phase: repairPhaseValidator,
  cursor: v.union(v.string(), v.null()),
  generation: v.number(),
  canonicalGeneration: v.number(),
  workGeneration: v.number(),
  workToken: v.union(v.string(), v.null()),
  workLeaseExpiresAt: v.union(v.number(), v.null()),
  workAttempts: v.number(),
  workNextAttemptAt: v.union(v.number(), v.null()),
  workLastError: v.union(v.string(), v.null()),
  workDeadLetteredAt: v.union(v.number(), v.null()),
  pageSize: v.number(),
  autoContinue: v.boolean(),
  processedEntries: v.number(),
  processedDrafts: v.number(),
  processedRevisions: v.number(),
  inspectedDraftSearchRows: v.number(),
  inspectedPublicRows: v.number(),
  inspectedAssetRefs: v.number(),
  referencedAssetIds: v.array(v.string()),
  repairedPublicRows: v.number(),
  repairedDraftSearchRows: v.number(),
  repairedAssetRefSources: v.number(),
  deletedOrphans: v.number(),
  issueCount: v.number(),
  lastIssue: v.union(v.string(), v.null()),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.union(v.number(), v.null()),
})

const processResultValidator = v.object({
  status: v.union(
    v.literal('applied'),
    v.literal('stale'),
    v.literal('complete'),
    v.literal('failed'),
  ),
  runId: v.string(),
  generation: v.number(),
  phase: repairPhaseValidator,
  cursor: v.union(v.string(), v.null()),
  processed: v.number(),
  issueCount: v.number(),
})

type ProcessArgs = {
  runId: string
  generation: number
  workGeneration: number
  token: string
  expectedPhase: RepairPhase
  expectedCursor: string | null
  failurePoint?: 'after-work'
}

type ProcessResult = {
  status: 'applied' | 'stale' | 'complete' | 'failed'
  runId: string
  generation: number
  phase: RepairPhase
  cursor: string | null
  processed: number
  issueCount: number
}

const processProjectionRepairPageRef = makeFunctionReference<
  'mutation',
  ProcessArgs,
  ProcessResult
>('entries/projectionMaintenance:processProjectionRepairPage')

const runProjectionRepairPageRef = makeFunctionReference<'action', ProjectionRepairLease, null>(
  'entries/projectionMaintenance:runProjectionRepairPage',
)

const expireProjectionRepairLeaseRef = makeFunctionReference<
  'mutation',
  ProjectionRepairLease,
  null
>('entries/projectionMaintenance:expireProjectionRepairLease')

const recordProjectionRepairFailureRef = makeFunctionReference<
  'mutation',
  ProjectionRepairLease & { error: string },
  'retrying' | 'dead-lettered' | 'stale'
>('entries/projectionMaintenance:recordProjectionRepairFailure')

const projectionRepairWorkerRefs: ProjectionRepairWorkerRefs = {
  run: runProjectionRepairPageRef,
  watchdog: expireProjectionRepairLeaseRef,
}

function pageSize(value: number | undefined) {
  return Math.min(Math.max(Math.floor(value ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE)
}

function runStatus(run: Doc<'projectionRepairRuns'>) {
  const { _id: _runId, _creationTime: _creationTime, ...status } = run
  return status
}

async function getRun(ctx: MutationCtx, runId: string) {
  return await ctx.db
    .query('projectionRepairRuns')
    .withIndex('by_run_id', (query) => query.eq('runId', runId))
    .unique()
}

async function scheduleCurrentPage(ctx: MutationCtx, run: Doc<'projectionRepairRuns'>) {
  if (!run.autoContinue || run.state !== 'running' || !run.workToken) return
  await scheduleProjectionRepairLease(
    ctx,
    {
      runId: run.runId,
      generation: run.generation,
      workGeneration: run.workGeneration,
      token: run.workToken,
      expectedPhase: run.phase,
      expectedCursor: run.cursor,
    },
    projectionRepairWorkerRefs,
  )
}

export const startProjectionRepairRun = callerMutation.protected({
  id: 'entries:projectionMaintenance:startProjectionRepairRun',
  args: {
    runId: v.string(),
    pageSize: v.optional(v.number()),
    autoContinue: v.optional(v.boolean()),
  },
  guard: canManagePortability,
  returns: repairRunStatusValidator,
  handler: async (ctx, args) => {
    const normalizedRunId = args.runId.trim()
    if (!normalizedRunId || normalizedRunId.length > 128) {
      throw new Error('Projection repair runId must contain 1-128 characters.')
    }
    const existing = await getRun(ctx, normalizedRunId)
    if (existing) {
      await scheduleCurrentPage(ctx, existing)
      return runStatus(existing)
    }
    const identity = await ctx.appIdentity()
    const now = Date.now()
    const canonicalGeneration = await readAssetReferenceCanonicalGeneration(ctx)
    const initialLease = createProjectionRepairLease(
      {
        runId: normalizedRunId,
        generation: 1,
        phase: 'entries',
        cursor: null,
      },
      1,
    )
    const runId = await ctx.db.insert('projectionRepairRuns', {
      runId: normalizedRunId,
      state: 'running',
      phase: 'entries',
      cursor: null,
      generation: 1,
      canonicalGeneration,
      ...projectionRepairLeasePatch(initialLease, now),
      workAttempts: 0,
      workNextAttemptAt: null,
      workLastError: null,
      workDeadLetteredAt: null,
      pageSize: pageSize(args.pageSize),
      autoContinue: args.autoContinue ?? true,
      processedEntries: 0,
      processedDrafts: 0,
      processedRevisions: 0,
      inspectedDraftSearchRows: 0,
      inspectedPublicRows: 0,
      inspectedAssetRefs: 0,
      referencedAssetIds: [],
      repairedPublicRows: 0,
      repairedDraftSearchRows: 0,
      repairedAssetRefSources: 0,
      deletedOrphans: 0,
      issueCount: 0,
      lastIssue: null,
      createdBy: identity.userId,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    const run = await ctx.db.get(runId)
    if (!run) throw new Error('Projection repair run was not readable after creation.')
    await scheduleCurrentPage(ctx, run)
    return runStatus(run)
  },
})

export const resumeProjectionRepairRun = callerMutation.protected({
  id: 'entries:projectionMaintenance:resumeProjectionRepairRun',
  args: {
    runId: v.string(),
    autoContinue: v.optional(v.boolean()),
  },
  guard: canManagePortability,
  returns: repairRunStatusValidator,
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.runId)
    if (!run) throw new Error('Projection repair run not found.')
    if (run.state === 'complete') throw new Error('Projection repair run is already complete.')
    const now = Date.now()
    const canonicalGeneration = await readAssetReferenceCanonicalGeneration(ctx)
    const restart = run.state === 'failed' || run.canonicalGeneration !== canonicalGeneration
    const generation = run.generation + 1
    const phase = restart ? ('entries' as const) : run.phase
    const cursor = restart ? null : run.cursor
    const lease = createProjectionRepairLease(
      { runId: run.runId, generation, phase, cursor },
      run.workGeneration + 1,
    )
    await ctx.db.patch(run._id, {
      state: 'running',
      phase,
      cursor,
      generation,
      canonicalGeneration: restart ? canonicalGeneration : run.canonicalGeneration,
      ...projectionRepairLeasePatch(lease, now),
      workAttempts: 0,
      workNextAttemptAt: null,
      workLastError: null,
      workDeadLetteredAt: null,
      autoContinue: args.autoContinue ?? run.autoContinue,
      processedEntries: restart ? 0 : run.processedEntries,
      processedDrafts: restart ? 0 : run.processedDrafts,
      processedRevisions: restart ? 0 : run.processedRevisions,
      inspectedDraftSearchRows: restart ? 0 : run.inspectedDraftSearchRows,
      inspectedPublicRows: restart ? 0 : run.inspectedPublicRows,
      inspectedAssetRefs: restart ? 0 : run.inspectedAssetRefs,
      referencedAssetIds: restart ? [] : run.referencedAssetIds,
      repairedPublicRows: restart ? 0 : run.repairedPublicRows,
      repairedDraftSearchRows: restart ? 0 : run.repairedDraftSearchRows,
      repairedAssetRefSources: restart ? 0 : run.repairedAssetRefSources,
      deletedOrphans: restart ? 0 : run.deletedOrphans,
      issueCount: restart ? 0 : run.issueCount,
      lastIssue: restart ? null : run.lastIssue,
      updatedAt: now,
      completedAt: null,
    })
    const resumed = await ctx.db.get(run._id)
    if (!resumed) throw new Error('Projection repair run disappeared during resume.')
    await scheduleCurrentPage(ctx, resumed)
    return runStatus(resumed)
  },
})

export const getProjectionRepairRun = callerQuery.protected({
  id: 'entries:projectionMaintenance:getProjectionRepairRun',
  args: { runId: v.string() },
  guard: canManagePortability,
  returns: v.union(repairRunStatusValidator, v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query('projectionRepairRuns')
      .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
      .unique()
    return run ? runStatus(run) : null
  },
})

function nextPhase(phase: RepairPhase): RepairPhase | null {
  const index = REPAIR_PHASES.indexOf(phase)
  return REPAIR_PHASES[index + 1] ?? null
}

function leaseMatches(run: Doc<'projectionRepairRuns'>, lease: ProjectionRepairLease) {
  return (
    run.state === 'running' &&
    run.generation === lease.generation &&
    run.workGeneration === lease.workGeneration &&
    run.workToken === lease.token &&
    run.phase === lease.expectedPhase &&
    run.cursor === lease.expectedCursor
  )
}

export const runProjectionRepairPage = internalAction({
  args: {
    ...repairLeaseArgs,
    failurePoint: v.optional(v.literal('after-work')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(processProjectionRepairPageRef, args)
    } catch (error) {
      await ctx.runMutation(recordProjectionRepairFailureRef, {
        runId: args.runId,
        generation: args.generation,
        workGeneration: args.workGeneration,
        token: args.token,
        expectedPhase: args.expectedPhase,
        expectedCursor: args.expectedCursor,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  },
})

export const recordProjectionRepairFailure = internalMutation({
  args: { ...repairLeaseArgs, error: v.string() },
  returns: v.union(v.literal('retrying'), v.literal('dead-lettered'), v.literal('stale')),
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.runId)
    if (!run || !leaseMatches(run, args)) return 'stale'
    return await failProjectionRepairLease(ctx, run, projectionRepairWorkerRefs, args.error)
  },
})

export const expireProjectionRepairLease = internalMutation({
  args: repairLeaseArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.runId)
    if (
      !run ||
      !leaseMatches(run, args) ||
      run.workLeaseExpiresAt === null ||
      run.workLeaseExpiresAt > Date.now()
    ) {
      return null
    }
    await failProjectionRepairLease(
      ctx,
      run,
      projectionRepairWorkerRefs,
      'Projection repair worker lease expired before completion.',
    )
    return null
  },
})

export const processProjectionRepairPage = internalMutation({
  args: {
    ...repairLeaseArgs,
    failurePoint: v.optional(v.literal('after-work')),
  },
  returns: processResultValidator,
  handler: async (ctx, args): Promise<ProcessResult> => {
    const run = await getRun(ctx, args.runId)
    if (
      !run ||
      run.state !== 'running' ||
      run.generation !== args.generation ||
      run.workGeneration !== args.workGeneration ||
      run.workToken !== args.token ||
      run.workLeaseExpiresAt === null ||
      run.workLeaseExpiresAt <= Date.now() ||
      run.phase !== args.expectedPhase ||
      run.cursor !== args.expectedCursor
    ) {
      return {
        status: 'stale',
        runId: args.runId,
        generation: run?.generation ?? args.generation,
        phase: run?.phase ?? args.expectedPhase,
        cursor: run?.cursor ?? args.expectedCursor,
        processed: 0,
        issueCount: run?.issueCount ?? 0,
      }
    }

    const canonicalGeneration = await readAssetReferenceCanonicalGeneration(ctx)
    if (run.canonicalGeneration !== canonicalGeneration) {
      const now = Date.now()
      await ctx.db.patch(run._id, {
        state: 'failed',
        workToken: null,
        workLeaseExpiresAt: null,
        workNextAttemptAt: null,
        workLastError: 'Canonical content changed during projection/reference verification.',
        updatedAt: now,
        completedAt: null,
      })
      return {
        status: 'failed',
        runId: run.runId,
        generation: run.generation,
        phase: run.phase,
        cursor: run.cursor,
        processed: 0,
        issueCount: run.issueCount,
      }
    }

    const work = await processProjectionRepairPhasePage(ctx, run)
    if (args.failurePoint === 'after-work') {
      throw new Error('PROJECTION_REPAIR_INJECTED_PAGE_FAILURE')
    }

    const issues = run.issueCount + work.result.issues.length
    const followingPhase = work.isDone ? nextPhase(run.phase) : run.phase
    const finished = followingPhase === null
    const state = finished ? (issues === 0 ? 'complete' : 'failed') : 'running'
    const now = Date.now()
    const phase = followingPhase ?? run.phase
    const cursor = work.isDone ? null : work.continueCursor
    const referencedAssetIds = work.referencedAssetIds
      ? [...new Set([...run.referencedAssetIds, ...work.referencedAssetIds])].sort()
      : run.referencedAssetIds
    const nextLease =
      state === 'running'
        ? createProjectionRepairLease(
            { runId: run.runId, generation: run.generation, phase, cursor },
            run.workGeneration + 1,
          )
        : null
    const patch = {
      state,
      phase,
      cursor,
      ...(nextLease
        ? projectionRepairLeasePatch(nextLease, now)
        : { workToken: null, workLeaseExpiresAt: null }),
      workAttempts: 0,
      workNextAttemptAt: null,
      workLastError: null,
      workDeadLetteredAt: null,
      processedEntries:
        run.processedEntries +
        (run.phase === 'entries' || run.phase === 'verifyEntries' ? work.processed : 0),
      processedDrafts:
        run.processedDrafts +
        (run.phase === 'drafts' || run.phase === 'verifyDrafts' ? work.processed : 0),
      processedRevisions:
        run.processedRevisions +
        (run.phase === 'revisions' || run.phase === 'verifyRevisions' ? work.processed : 0),
      inspectedDraftSearchRows:
        run.inspectedDraftSearchRows +
        (run.phase === 'draftSearchRows' || run.phase === 'verifyDraftSearchRows'
          ? work.processed
          : 0),
      inspectedPublicRows:
        run.inspectedPublicRows +
        ((
          [
            'publicRows',
            'publicSearchRows',
            'verifyPublicRows',
            'verifyPublicSearchRows',
          ] as RepairPhase[]
        ).includes(run.phase)
          ? work.processed
          : 0),
      inspectedAssetRefs:
        run.inspectedAssetRefs +
        (run.phase === 'assetRefs' || run.phase === 'verifyAssetRefs' ? work.processed : 0),
      referencedAssetIds,
      repairedPublicRows: run.repairedPublicRows + work.result.repairedPublicRows,
      repairedDraftSearchRows: run.repairedDraftSearchRows + work.result.repairedDraftSearchRows,
      repairedAssetRefSources: run.repairedAssetRefSources + work.result.repairedAssetRefSources,
      deletedOrphans: run.deletedOrphans + work.result.deletedOrphans,
      issueCount: issues,
      lastIssue: work.result.issues.at(-1)?.message ?? run.lastIssue,
      updatedAt: now,
      completedAt: finished ? now : null,
    } as const
    await ctx.db.patch(run._id, patch)
    const updated = await ctx.db.get(run._id)
    if (!updated) throw new Error('Projection repair run disappeared after page commit.')
    if (updated.state === 'complete') await activateAssetReferenceProof(ctx, updated)
    await scheduleCurrentPage(ctx, updated)
    return {
      status: state === 'running' ? 'applied' : state,
      runId: run.runId,
      generation: run.generation,
      phase: updated.phase,
      cursor: updated.cursor,
      processed: work.processed,
      issueCount: issues,
    }
  },
})
