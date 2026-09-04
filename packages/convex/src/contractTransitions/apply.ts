import type { Doc, Id } from '../_generated/dataModel.js'
import { deleteAssetRefsForSource } from '../entries/workflow/assetRefs.js'
import { refreshDraftAssetRefsForSave } from '../entries/workflow/commands.js'
import { readDraftRows } from '../entries/workflow/drafts.js'
import {
  deleteDraftSearchEntry,
  refreshDraftSearchEntriesForEntry,
} from '../entries/workflow/draftSearch.js'
import { isEqualJsonValue } from '../lib/data.js'
import { projectContentCollection } from '../lib/installedContract.js'
import type { CmsCollection, MutationCtx } from '../lib/types.js'
import {
  asTransitionEntryId,
  boundedTransitionPageSize,
  hashTransitionValue,
  readTransitionInput,
  requireTransitionRun,
  TRANSITION_APPLY_PAGE_SIZE_MAX,
  transitionCollections,
  transitionOutputFromStored,
  type TransitionOutput,
  validateTransitionOutput,
} from './model.js'

async function applyTransitionOutput(
  ctx: MutationCtx,
  args: {
    entry: Doc<'entries'>
    output: TransitionOutput
    collection: CmsCollection
    actor: string
    now: number
  },
): Promise<void> {
  const drafts = await readDraftRows(ctx, args.entry._id)
  const parentEntryId =
    args.output.parentEntryId === null ? null : asTransitionEntryId(ctx, args.output.parentEntryId)
  const sharedUpdated =
    args.entry.slug !== args.output.slug ||
    args.entry.parentEntryId !== parentEntryId ||
    args.entry.orderRank !== args.output.orderRank ||
    args.entry.nodeKind !== args.output.nodeKind ||
    !isEqualJsonValue(args.entry.shared, args.output.shared)
  const upsertedLocales = new Set<string>()
  const removedLocales = new Set<string>()
  const allLocales = new Set([...Object.keys(drafts.byLocale), ...Object.keys(args.output.locales)])

  for (const locale of allLocales) {
    const existing = drafts.byLocale[locale]
    const desired = args.output.locales[locale]
    if (!desired) {
      if (existing) {
        await ctx.db.delete(existing._id)
        await deleteAssetRefsForSource(
          ctx,
          { sourceKind: 'draft', sourceId: `${args.entry._id}:${locale}` },
          'canonical',
        )
        await deleteDraftSearchEntry(ctx, args.entry._id, locale)
        removedLocales.add(locale)
      }
      continue
    }
    const changed =
      !existing ||
      existing.slug !== desired.slug ||
      existing.bodyMdc !== desired.bodyMdc ||
      !isEqualJsonValue(existing.values, desired.values)
    if (!changed) continue
    const payload = {
      entryId: args.entry._id,
      locale,
      slug: desired.slug,
      values: desired.values,
      bodyMdc: desired.bodyMdc,
      version: (existing?.version ?? 0) + 1,
      updatedBy: args.actor,
      updatedAt: args.now,
    }
    if (existing) await ctx.db.replace(existing._id, payload)
    else await ctx.db.insert('entryLocaleDrafts', payload)
    upsertedLocales.add(locale)
  }

  if (!sharedUpdated && upsertedLocales.size === 0 && removedLocales.size === 0) return
  await ctx.db.patch(args.entry._id, {
    ...(sharedUpdated
      ? {
          slug: args.output.slug,
          parentEntryId,
          orderRank: args.output.orderRank,
          nodeKind: args.output.nodeKind,
          shared: args.output.shared,
          sharedVersion: args.entry.sharedVersion + 1,
        }
      : {}),
    draftVersion: args.entry.draftVersion + 1,
    updatedBy: args.actor,
    updatedAt: args.now,
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: args.entry._id,
    collection: args.entry.collection,
    sharedUpdated,
    affectedLocales: [...upsertedLocales],
  })
  await refreshDraftSearchEntriesForEntry(ctx, args.entry._id, args.collection)
  for (const locale of removedLocales) {
    await deleteDraftSearchEntry(ctx, args.entry._id, locale)
  }
}

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
  const { target, affected } = await transitionCollections(ctx, run)
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
    if (entry.activePublications.length > 0) {
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
    await validateTransitionOutput(ctx, entry, output, target)
    const targetCollection = target.collections[entry.collection]
    if (!targetCollection) {
      throw new Error(`Collection "${entry.collection}" still contains entries.`)
    }
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
  const { installed } = await transitionCollections(ctx, run)
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
