import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'

import type { Id } from '../_generated/dataModel.js'
import { assertCmsPresentation } from '../contract.js'
import { readInstalledCmsContract } from '../lib/installedContract.js'
import type { MutationCtx, QueryCtx } from '../lib/types.js'
import {
  changedCollectionSlugs,
  EMPTY_TRANSITION_HASH,
  requireLockedContractForRun,
  requireTransitionRun,
  targetContractForRun,
} from './model.js'

export async function beginContractTransitionHandler(
  ctx: MutationCtx,
  args: {
    runKey: string
    targetContent: JsonObject
    targetContentHash: string
    targetPresentation: JsonObject
    targetPresentationHash: string
    actor: string
  },
) {
  const target = assertResolvedContentContract(args.targetContent)
  const computedContentHash = await hashCanonicalJson(args.targetContent)
  if (computedContentHash !== args.targetContentHash) {
    throw new Error('CONTRACT_TRANSITION_TARGET_HASH_MISMATCH')
  }
  assertCmsPresentation(args.targetPresentation, target)
  const computedPresentationHash = await hashCanonicalJson(args.targetPresentation)
  if (computedPresentationHash !== args.targetPresentationHash) {
    throw new Error('CONTRACT_TRANSITION_TARGET_PRESENTATION_HASH_MISMATCH')
  }

  const existing = await ctx.db
    .query('contractTransitionRuns')
    .withIndex('by_run_key', (query) => query.eq('runKey', args.runKey))
    .first()
  if (existing) {
    if (
      existing.toContentHash !== args.targetContentHash ||
      existing.toPresentationHash !== args.targetPresentationHash
    ) {
      throw new Error(`Transition run key "${args.runKey}" already targets another contract.`)
    }
    await targetContractForRun(existing)
    return {
      runId: existing._id,
      state: existing.state,
      fromContentHash: existing.fromContentHash,
      toContentHash: existing.toContentHash,
      fromPresentationHash: existing.fromPresentationHash,
      toPresentationHash: existing.toPresentationHash,
      affectedCollections: existing.affectedCollections,
    }
  }

  const installed = await readInstalledCmsContract(ctx)
  if (!installed) throw new Error('CMS_CONTRACT_MISSING')
  if (installed.record.transitionState !== 'ready') throw new Error('CMS_CONTRACT_LOCKED')
  if (installed.record.contentHash === args.targetContentHash) {
    throw new Error('CONTRACT_TRANSITION_NOT_REQUIRED')
  }
  const affectedCollections = await changedCollectionSlugs(installed.content, target)

  const now = Date.now()
  const runId = await ctx.db.insert('contractTransitionRuns', {
    runKey: args.runKey,
    fromContentHash: installed.record.contentHash,
    toContentHash: args.targetContentHash,
    fromPresentationHash: installed.record.presentationHash,
    toPresentationHash: args.targetPresentationHash,
    affectedCollections,
    targetContent: args.targetContent,
    targetPresentation: args.targetPresentation,
    state: 'staging',
    generation: 1,
    cursor: null,
    scannedCount: 0,
    stagedCount: 0,
    validatedCount: 0,
    appliedCount: 0,
    stagedHash: EMPTY_TRANSITION_HASH,
    validatedHash: EMPTY_TRANSITION_HASH,
    createdBy: args.actor,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.patch(installed.record._id, {
    writeGeneration: installed.record.writeGeneration + 1,
    transitionState: 'locked',
    transitionRunId: String(runId),
  })
  return {
    runId,
    state: 'staging',
    fromContentHash: installed.record.contentHash,
    toContentHash: args.targetContentHash,
    fromPresentationHash: installed.record.presentationHash,
    toPresentationHash: args.targetPresentationHash,
    affectedCollections,
  }
}

export async function cancelContractTransitionHandler(
  ctx: MutationCtx,
  args: { runId: Id<'contractTransitionRuns'> },
) {
  const run = await requireTransitionRun(ctx, args.runId)
  if (run.state !== 'staging' && run.state !== 'validating' && run.state !== 'ready') {
    throw new Error('A contract transition can only be cancelled before apply begins.')
  }
  if (run.appliedCount !== 0) {
    throw new Error('A contract transition can only be cancelled before apply begins.')
  }
  const installed = await requireLockedContractForRun(ctx, run)
  const now = Date.now()
  await ctx.db.patch(installed.record._id, {
    writeGeneration: installed.record.writeGeneration + 1,
    transitionState: 'ready',
    transitionRunId: null,
  })
  await ctx.db.patch(run._id, {
    state: 'cancelled',
    generation: run.generation + 1,
    cursor: null,
    updatedAt: now,
  })
  return { state: 'cancelled' as const }
}

export async function getContractTransitionStatusHandler(
  ctx: QueryCtx,
  args: { runId: Id<'contractTransitionRuns'> },
) {
  const run = await requireTransitionRun(ctx, args.runId)
  const installed = await readInstalledCmsContract(ctx)
  return {
    runKey: run.runKey,
    state: run.state,
    fromContentHash: run.fromContentHash,
    toContentHash: run.toContentHash,
    fromPresentationHash: run.fromPresentationHash,
    toPresentationHash: run.toPresentationHash,
    generation: run.generation,
    scannedCount: run.scannedCount,
    stagedCount: run.stagedCount,
    validatedCount: run.validatedCount,
    appliedCount: run.appliedCount,
    pendingCount: run.stagedCount - run.appliedCount,
    stagedHash: run.stagedHash,
    validatedHash: run.validatedHash,
    lockActive:
      installed?.record.transitionState === 'locked' &&
      installed.record.transitionRunId === String(run._id),
    cursor: run.cursor,
  }
}
