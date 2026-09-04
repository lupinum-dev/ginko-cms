import { CMS_TREE_MAX_DEPTH } from '@lupinum/ginko-cms-contract/shared/placementGraph.js'
import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import {
  asTransitionEntryId,
  boundedTransitionPageSize,
  hashTransitionValue,
  readTransitionInput,
  requireTransitionRun,
  rollTransitionHash,
  transitionCollections,
  transitionOutputFromStored,
  transitionRouteClaims,
  type TransitionRouteClaim,
  validateTransitionOutput,
} from './model.js'

function persistedClaims(claims: Doc<'contractTransitionRouteClaims'>[]): TransitionRouteClaim[] {
  return claims
    .map((claim) => ({
      collection: claim.collection,
      locale: claim.locale,
      parentEntryId: claim.parentEntryId === null ? null : String(claim.parentEntryId),
      segment: claim.segment,
    }))
    .sort((left, right) =>
      `${left.collection}\u0000${left.locale}\u0000${left.parentEntryId ?? ''}\u0000${left.segment}`.localeCompare(
        `${right.collection}\u0000${right.locale}\u0000${right.parentEntryId ?? ''}\u0000${right.segment}`,
      ),
    )
}

async function validatePlacementChain(
  ctx: QueryOrMutationCtx,
  runId: Id<'contractTransitionRuns'>,
  item: Doc<'contractTransitionItems'>,
): Promise<void> {
  let parentEntryId = item.parentEntryId
  let depth = 1
  const visited = new Set<string>([String(item.entryId)])
  while (parentEntryId !== null) {
    const parentKey = String(parentEntryId)
    if (visited.has(parentKey)) {
      throw new Error(`Final placement graph contains a cycle at "${parentKey}".`)
    }
    visited.add(parentKey)
    const parent = await ctx.db
      .query('contractTransitionItems')
      .withIndex('by_run_entry', (query) => query.eq('runId', runId).eq('entryId', parentEntryId!))
      .first()
    if (!parent) {
      throw new Error(
        `Final placement graph node "${item.entryId}" references missing parent "${parentKey}".`,
      )
    }
    if (parent.collection !== item.collection) {
      throw new Error(`Final placement graph node "${item.entryId}" has a cross-collection parent.`)
    }
    depth += 1
    if (depth > CMS_TREE_MAX_DEPTH) {
      throw new Error(
        `Final placement graph exceeds the supported tree depth of ${CMS_TREE_MAX_DEPTH}.`,
      )
    }
    parentEntryId = parent.parentEntryId
  }
}

async function validateStagedItem(
  ctx: MutationCtx,
  run: Doc<'contractTransitionRuns'>,
  item: Doc<'contractTransitionItems'>,
  target: Awaited<ReturnType<typeof transitionCollections>>['target'],
  affected: Set<string>,
): Promise<void> {
  if (item.state !== 'staged') {
    throw new Error(`Transition item "${item.entryId}" was already validated.`)
  }
  const entry = await ctx.db.get(item.entryId)
  if (!entry || !affected.has(entry.collection) || entry.collection !== item.collection) {
    throw new Error('CONTRACT_TRANSITION_STAGED_ENTRY_SET_CHANGED')
  }
  if (entry.activePublications.length > 0) {
    throw new Error(
      `CONTRACT_TRANSITION_REQUIRES_UNPUBLISH: entry "${entry._id}" still has active publications.`,
    )
  }
  const current = await readTransitionInput(ctx, entry)
  if (
    current.draftVersion !== item.inputDraftVersion ||
    (await hashTransitionValue(current)) !== item.inputHash
  ) {
    throw new Error(`Entry "${entry._id}" changed after it was staged.`)
  }
  const output = transitionOutputFromStored(item.output)
  if ((await hashTransitionValue(output)) !== item.outputHash) {
    throw new Error(`Entry "${entry._id}" has a corrupt staged output.`)
  }
  await validateTransitionOutput(ctx, entry, output, target)
  const expectedParent =
    output.parentEntryId === null ? null : asTransitionEntryId(ctx, output.parentEntryId)
  if (expectedParent !== item.parentEntryId) {
    throw new Error(`Entry "${entry._id}" has corrupt staged placement metadata.`)
  }

  const expectedClaims = await transitionRouteClaims(entry, output, target)
  const expectedClaimsHash = await hashTransitionValue(expectedClaims as unknown as JsonValue)
  if (expectedClaimsHash !== item.routeClaimsHash) {
    throw new Error(`Entry "${entry._id}" has corrupt staged route-claim metadata.`)
  }
  const storedClaims = await ctx.db
    .query('contractTransitionRouteClaims')
    .withIndex('by_run_entry', (query) => query.eq('runId', run._id).eq('entryId', entry._id))
    .take(target.locales.length + 1)
  if (
    storedClaims.length !== expectedClaims.length ||
    (await hashTransitionValue(persistedClaims(storedClaims) as unknown as JsonValue)) !==
      expectedClaimsHash
  ) {
    throw new Error(`Entry "${entry._id}" has incomplete staged route claims.`)
  }
  for (const claim of storedClaims) {
    const collisions = await ctx.db
      .query('contractTransitionRouteClaims')
      .withIndex('by_run_route', (query) =>
        query
          .eq('runId', run._id)
          .eq('collection', claim.collection)
          .eq('locale', claim.locale)
          .eq('parentEntryId', claim.parentEntryId)
          .eq('segment', claim.segment),
      )
      .take(2)
    if (collisions.some((candidate) => candidate.entryId !== entry._id)) {
      throw new Error(`Entry "${entry._id}" has a staged route collision.`)
    }
  }
  await validatePlacementChain(ctx, run._id, item)
}

type ValidationCursor = {
  v: 1
  kind: 'contractTransitionItems'
  runId: string
  sequence: number
}

function parseValidationCursor(
  value: string | null,
  runId: Id<'contractTransitionRuns'>,
): ValidationCursor | null {
  if (value === null) return null
  let cursor: Partial<ValidationCursor>
  try {
    cursor = JSON.parse(value) as Partial<ValidationCursor>
  } catch {
    throw new Error('CONTRACT_TRANSITION_INVALID_CURSOR')
  }
  if (
    cursor.v !== 1 ||
    cursor.kind !== 'contractTransitionItems' ||
    cursor.runId !== String(runId) ||
    !Number.isSafeInteger(cursor.sequence) ||
    cursor.sequence! < 0
  ) {
    throw new Error('CONTRACT_TRANSITION_INVALID_CURSOR')
  }
  return cursor as ValidationCursor
}

export async function validateContractTransitionPageHandler(
  ctx: MutationCtx,
  args: {
    runId: Id<'contractTransitionRuns'>
    generation: number
    cursor: string | null
    limit?: number
  },
) {
  const run = await requireTransitionRun(ctx, args.runId)
  if (run.state !== 'validating') throw new Error('CONTRACT_TRANSITION_NOT_VALIDATING')
  if (run.generation !== args.generation) throw new Error('CONTRACT_TRANSITION_STALE_GENERATION')
  if (run.cursor !== args.cursor) throw new Error('CONTRACT_TRANSITION_STALE_CURSOR')
  const { target, affected } = await transitionCollections(ctx, run)
  const limit = boundedTransitionPageSize(args.limit)
  const cursor = parseValidationCursor(args.cursor, run._id)
  const candidates = await ctx.db
    .query('contractTransitionItems')
    .withIndex('by_run_sequence', (query) => {
      const scope = query.eq('runId', run._id)
      return cursor ? scope.gt('sequence', cursor.sequence) : scope
    })
    .order('asc')
    .take(limit + 1)
  const page = candidates.slice(0, limit)
  const isDone = candidates.length <= limit
  const last = page.at(-1)
  const continueCursor =
    isDone || !last
      ? null
      : JSON.stringify({
          v: 1,
          kind: 'contractTransitionItems',
          runId: String(run._id),
          sequence: last.sequence,
        } satisfies ValidationCursor)

  let validatedHash = run.validatedHash
  const now = Date.now()
  for (const item of page) {
    await validateStagedItem(ctx, run, item, target, affected)
    validatedHash = await rollTransitionHash(validatedHash, [
      {
        entryId: String(item.entryId),
        inputHash: item.inputHash,
        outputHash: item.outputHash,
        routeClaimsHash: item.routeClaimsHash,
      },
    ])
    await ctx.db.patch(item._id, { state: 'validated', validatedAt: now })
  }
  const validatedCount = run.validatedCount + page.length
  if (isDone) {
    if (validatedCount !== run.stagedCount) {
      throw new Error('CONTRACT_TRANSITION_STAGING_INCOMPLETE')
    }
    if (validatedHash !== run.stagedHash) {
      throw new Error('CONTRACT_TRANSITION_VALIDATION_HASH_MISMATCH')
    }
  }
  const state = isDone ? ('ready' as const) : ('validating' as const)
  const generation = isDone ? run.generation + 1 : run.generation
  await ctx.db.patch(run._id, {
    state,
    generation,
    cursor: continueCursor,
    validatedCount,
    validatedHash,
    updatedAt: now,
  })
  return {
    state,
    generation,
    validated: page.length,
    validatedCount,
    continueCursor,
  }
}
