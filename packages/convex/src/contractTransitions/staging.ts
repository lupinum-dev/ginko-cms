import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import type { MutationCtx, QueryCtx, QueryOrMutationCtx } from '../lib/types.js'
import {
  asTransitionEntryId,
  boundedTransitionPageSize,
  hashTransitionValue,
  readTransitionInput,
  requireTransitionRun,
  rollTransitionHash,
  type stagedTransitionItemValidator,
  TRANSITION_MAX_ENTRIES,
  transitionCollections,
  transitionRouteClaims,
  validateTransitionOutput,
} from './model.js'

type StagedTransitionItem = (typeof stagedTransitionItemValidator)['type']

type StagingCursor = {
  v: 1
  kind: 'contractTransitionEntries'
  runId: string
  collection: string
  stableId: string
}

function parseStagingCursor(
  value: string | null,
  runId: Id<'contractTransitionRuns'>,
  collections: string[],
): StagingCursor | null {
  if (value === null) return null
  let cursor: Partial<StagingCursor>
  try {
    cursor = JSON.parse(value) as Partial<StagingCursor>
  } catch {
    throw new Error('CONTRACT_TRANSITION_INVALID_CURSOR')
  }
  if (
    cursor.v !== 1 ||
    cursor.kind !== 'contractTransitionEntries' ||
    cursor.runId !== String(runId) ||
    typeof cursor.collection !== 'string' ||
    !collections.includes(cursor.collection) ||
    typeof cursor.stableId !== 'string' ||
    cursor.stableId.length === 0
  ) {
    throw new Error('CONTRACT_TRANSITION_INVALID_CURSOR')
  }
  return cursor as StagingCursor
}

async function readStagingPage(
  ctx: QueryOrMutationCtx,
  args: {
    runId: Id<'contractTransitionRuns'>
    cursor: string | null
    limit: number
    affected: Set<string>
  },
) {
  const collections = [...args.affected].sort()
  const cursor = parseStagingCursor(args.cursor, args.runId, collections)
  const firstCollection = cursor ? collections.indexOf(cursor.collection) : 0
  const candidates: Doc<'entries'>[] = []
  for (let index = firstCollection; index < collections.length; index += 1) {
    const collection = collections[index]!
    const remaining = args.limit + 1 - candidates.length
    if (remaining <= 0) break
    const rows = await ctx.db
      .query('entries')
      .withIndex('by_collection_stableId', (query) => {
        const scope = query.eq('collection', collection)
        return cursor?.collection === collection ? scope.gt('stableId', cursor.stableId) : scope
      })
      .order('asc')
      .take(remaining)
    candidates.push(...rows)
  }
  const rows = candidates.slice(0, args.limit)
  const last = rows.at(-1)
  const isDone = candidates.length <= args.limit
  const continueCursor =
    isDone || !last
      ? null
      : JSON.stringify({
          v: 1,
          kind: 'contractTransitionEntries',
          runId: String(args.runId),
          collection: last.collection,
          stableId: last.stableId,
        } satisfies StagingCursor)
  const snapshots = await Promise.all(
    rows.map(async (entry) => {
      const current = await readTransitionInput(ctx, entry)
      return { entry, current, inputHash: await hashTransitionValue(current) }
    }),
  )
  return { rows, isDone, continueCursor, snapshots }
}

function assertStagingFence(
  run: Doc<'contractTransitionRuns'>,
  args: { generation: number; cursor: string | null },
): void {
  if (run.state !== 'staging') throw new Error('CONTRACT_TRANSITION_NOT_STAGING')
  if (run.generation !== args.generation) throw new Error('CONTRACT_TRANSITION_STALE_GENERATION')
  if (run.cursor !== args.cursor) throw new Error('CONTRACT_TRANSITION_STALE_CURSOR')
}

export async function listContractTransitionPageHandler(
  ctx: QueryCtx,
  args: {
    runId: Id<'contractTransitionRuns'>
    generation: number
    cursor: string | null
    limit?: number
  },
) {
  const run = await requireTransitionRun(ctx, args.runId)
  assertStagingFence(run, args)
  const { affected } = await transitionCollections(ctx, run)
  const result = await readStagingPage(ctx, {
    runId: run._id,
    cursor: args.cursor,
    limit: boundedTransitionPageSize(args.limit),
    affected,
  })
  return {
    page: result.snapshots.map(({ entry, current, inputHash }) => ({
      entryId: String(entry._id),
      inputDraftVersion: entry.draftVersion,
      inputHash,
      current,
    })),
    isDone: result.isDone,
    continueCursor: result.continueCursor ?? '',
  }
}

export async function stageContractTransitionPageHandler(
  ctx: MutationCtx,
  args: {
    runId: Id<'contractTransitionRuns'>
    generation: number
    cursor: string | null
    limit?: number
    items: StagedTransitionItem[]
  },
) {
  const run = await requireTransitionRun(ctx, args.runId)
  assertStagingFence(run, args)
  const { target, affected } = await transitionCollections(ctx, run)
  const result = await readStagingPage(ctx, {
    runId: run._id,
    cursor: args.cursor,
    limit: boundedTransitionPageSize(args.limit),
    affected,
  })
  const scannedCount = run.scannedCount + result.rows.length
  if (scannedCount > TRANSITION_MAX_ENTRIES) {
    throw new Error(`Contract transitions support at most ${TRANSITION_MAX_ENTRIES} entries.`)
  }
  if (result.snapshots.length !== args.items.length) {
    throw new Error('CONTRACT_TRANSITION_PAGE_DOES_NOT_MATCH')
  }

  let stagedHash = run.stagedHash
  for (let index = 0; index < result.snapshots.length; index += 1) {
    const expected = result.snapshots[index]!
    const item = args.items[index]!
    if (expected.entry.activePublications.length > 0) {
      throw new Error(
        `CONTRACT_TRANSITION_REQUIRES_UNPUBLISH: entry "${expected.entry._id}" still has active publications.`,
      )
    }
    if (
      item.entryId !== String(expected.entry._id) ||
      item.inputDraftVersion !== expected.entry.draftVersion ||
      item.inputHash !== expected.inputHash
    ) {
      throw new Error(`Transition input for entry "${item.entryId}" is stale.`)
    }
    if ((await hashTransitionValue(item.output)) !== item.outputHash) {
      throw new Error(`Transition output hash mismatch for entry "${item.entryId}".`)
    }
    await validateTransitionOutput(ctx, expected.entry, item.output, target)
    const duplicate = await ctx.db
      .query('contractTransitionItems')
      .withIndex('by_run_entry', (query) =>
        query.eq('runId', run._id).eq('entryId', expected.entry._id),
      )
      .first()
    if (duplicate) throw new Error(`Entry "${item.entryId}" is already staged.`)

    const parentEntryId =
      item.output.parentEntryId === null
        ? null
        : asTransitionEntryId(ctx, item.output.parentEntryId)
    const routeClaims = await transitionRouteClaims(expected.entry, item.output, target)
    const routeClaimsHash = await hashTransitionValue(routeClaims as unknown as JsonValue)
    const sequence = run.stagedCount + index
    await ctx.db.insert('contractTransitionItems', {
      runId: run._id,
      entryId: expected.entry._id,
      sequence,
      collection: expected.entry.collection,
      stableId: expected.entry.stableId,
      parentEntryId,
      inputDraftVersion: item.inputDraftVersion,
      inputHash: item.inputHash,
      outputHash: item.outputHash,
      routeClaimsHash,
      output: item.output,
      state: 'staged',
      validatedAt: null,
      appliedAt: null,
    })
    for (const claim of routeClaims) {
      await ctx.db.insert('contractTransitionRouteClaims', {
        runId: run._id,
        entryId: expected.entry._id,
        collection: claim.collection,
        locale: claim.locale,
        parentEntryId:
          claim.parentEntryId === null ? null : asTransitionEntryId(ctx, claim.parentEntryId),
        segment: claim.segment,
      })
    }
    stagedHash = await rollTransitionHash(stagedHash, [
      {
        entryId: item.entryId,
        inputHash: item.inputHash,
        outputHash: item.outputHash,
        routeClaimsHash,
      },
    ])
  }

  const state = result.isDone ? ('validating' as const) : ('staging' as const)
  const generation = result.isDone ? run.generation + 1 : run.generation
  const stagedCount = run.stagedCount + args.items.length
  await ctx.db.patch(run._id, {
    state,
    generation,
    cursor: result.isDone ? null : result.continueCursor,
    scannedCount,
    stagedCount,
    stagedHash,
    updatedAt: Date.now(),
  })
  return {
    state,
    generation,
    scanned: result.rows.length,
    scannedCount,
    staged: args.items.length,
    stagedCount,
    continueCursor: result.isDone ? null : result.continueCursor,
  }
}
