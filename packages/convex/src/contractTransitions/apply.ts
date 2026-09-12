import type { Id } from '../_generated/dataModel.js'
import { projectContentCollection } from '../lib/installedContract.js'
import type { MutationCtx } from '../lib/types.js'
import { applyTransitionOutput } from './applyOutput.js'
import {
  boundedTransitionPageSize,
  hashTransitionValue,
  readTransitionInput,
  requireTransitionRun,
  TRANSITION_APPLY_PAGE_SIZE_MAX,
  transitionCollections,
  transitionOutputFromStored,
  validateTransitionOutput,
} from './model.js'
import { noWritePolicyVersionChangeForRun, noWriteTransitionOutput } from './policyVersionChange.js'

export async function applyContractTransitionPageHandler(
  ctx: MutationCtx,
  args: {
    runId: Id<'contractTransitionRuns'>
    generation: number
    cursor: string | null
    limit?: number
    actor: string
  },
) {
  const run = await requireTransitionRun(ctx, args.runId)
  if (run.state !== 'ready' && run.state !== 'applying') {
    throw new Error(`Contract transition cannot apply from state "${run.state}".`)
  }
  if (run.generation !== args.generation) throw new Error('CONTRACT_TRANSITION_STALE_GENERATION')
  if (run.cursor !== args.cursor) throw new Error('CONTRACT_TRANSITION_STALE_CURSOR')
  if (run.validatedCount !== run.stagedCount || run.validatedHash !== run.stagedHash) {
    throw new Error('CONTRACT_TRANSITION_NOT_VALIDATED')
  }
  const { installed, target, affected } = await transitionCollections(ctx, run)
  const noWritePolicyChange = Boolean(
    await noWritePolicyVersionChangeForRun(installed, run, target),
  )
  const limit = boundedTransitionPageSize(args.limit, TRANSITION_APPLY_PAGE_SIZE_MAX)
  const pending = await ctx.db
    .query('contractTransitionItems')
    .withIndex('by_run_state', (query) => query.eq('runId', run._id).eq('state', 'validated'))
    .take(limit + 1)
  const page = pending.slice(0, limit)
  const now = Date.now()
  for (const item of page) {
    const entry = await ctx.db.get(item.entryId)
    if (!entry || !affected.has(entry.collection)) {
      throw new Error(`Transition entry "${item.entryId}" no longer exists in its scope.`)
    }
    if (!noWritePolicyChange && entry.activePublications.length > 0) {
      throw new Error(`Entry "${entry._id}" was published after the transition was staged.`)
    }
    const current = await readTransitionInput(ctx, entry)
    if (
      current.draftVersion !== item.inputDraftVersion ||
      (await hashTransitionValue(current)) !== item.inputHash
    ) {
      throw new Error(`Entry "${entry._id}" changed after transition staging.`)
    }
    const output = transitionOutputFromStored(item.output)
    if ((await hashTransitionValue(output)) !== item.outputHash) {
      throw new Error(`Entry "${entry._id}" has a corrupt staged output.`)
    }
    if (
      noWritePolicyChange &&
      (await hashTransitionValue(output)) !==
        (await hashTransitionValue(noWriteTransitionOutput(current)))
    ) {
      throw new Error(`CONTRACT_TRANSITION_NO_WRITE_OUTPUT_CHANGED: entry "${entry._id}".`)
    }
    await validateTransitionOutput(ctx, entry, output, target)
    const targetCollection = target.collections[entry.collection]
    if (!targetCollection) {
      throw new Error(`Collection "${entry.collection}" still contains entries.`)
    }
    if (!noWritePolicyChange) {
      await applyTransitionOutput(ctx, {
        entry,
        output,
        collection: projectContentCollection(targetCollection, {
          contentHash: run.toContentHash,
          presentation: run.targetPresentation,
          installedAt: now,
          installedBy: args.actor,
        }),
        actor: args.actor,
        now,
      })
    }
    await ctx.db.patch(item._id, { state: 'applied', appliedAt: now })
  }
  const appliedCount = run.appliedCount + page.length
  const generation = run.state === 'ready' ? run.generation + 1 : run.generation
  const cursor = page.length > 0 ? String(page[page.length - 1]!._id) : run.cursor
  await ctx.db.patch(run._id, {
    state: 'applying',
    generation,
    cursor,
    appliedCount,
    updatedAt: now,
  })
  return {
    generation,
    cursor,
    applied: page.length,
    appliedCount,
    readyToActivate: pending.length <= limit,
  }
}

export async function activateContractTransitionHandler(
  ctx: MutationCtx,
  args: { runId: Id<'contractTransitionRuns'>; generation: number; actor: string },
) {
  const run = await requireTransitionRun(ctx, args.runId)
  if (run.state !== 'applying') throw new Error('CONTRACT_TRANSITION_NOT_APPLIED')
  if (run.generation !== args.generation) throw new Error('CONTRACT_TRANSITION_STALE_GENERATION')
  if (
    run.validatedCount !== run.stagedCount ||
    run.appliedCount !== run.stagedCount ||
    run.validatedHash !== run.stagedHash
  ) {
    throw new Error('CONTRACT_TRANSITION_APPLY_INCOMPLETE')
  }
  const { installed, target } = await transitionCollections(ctx, run)
  await noWritePolicyVersionChangeForRun(installed, run, target)
  const pending = await ctx.db
    .query('contractTransitionItems')
    .withIndex('by_run_state', (query) => query.eq('runId', run._id).eq('state', 'validated'))
    .first()
  if (pending) throw new Error('CONTRACT_TRANSITION_APPLY_INCOMPLETE')

  const now = Date.now()
  await ctx.db.patch(installed.record._id, {
    content: run.targetContent,
    contentHash: run.toContentHash,
    presentation: run.targetPresentation,
    presentationHash: run.toPresentationHash,
    writeGeneration: installed.record.writeGeneration + 1,
    transitionState: 'ready',
    transitionRunId: null,
    installedAt: now,
    installedBy: args.actor,
  })
  await ctx.db.patch(run._id, {
    state: 'complete',
    generation: run.generation + 1,
    cursor: null,
    updatedAt: now,
  })
  return {
    state: 'complete' as const,
    contentHash: run.toContentHash,
    presentationHash: run.toPresentationHash,
    appliedCount: run.appliedCount,
  }
}
