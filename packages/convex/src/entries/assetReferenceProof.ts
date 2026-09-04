import type { Doc } from '../_generated/dataModel.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'

const PROOF_KEY = 'global' as const

async function readState(ctx: QueryOrMutationCtx) {
  return await ctx.db
    .query('assetReferenceProofState')
    .withIndex('by_key', (query) => query.eq('key', PROOF_KEY))
    .unique()
}

export async function readAssetReferenceCanonicalGeneration(ctx: QueryOrMutationCtx) {
  return (await readState(ctx))?.canonicalGeneration ?? 0
}

export async function invalidateAssetReferenceProof(ctx: MutationCtx) {
  const state = await readState(ctx)
  if (!state) {
    await ctx.db.insert('assetReferenceProofState', {
      key: PROOF_KEY,
      canonicalGeneration: 1,
      verifiedRunId: null,
      verifiedAt: null,
    })
    return 1
  }
  const canonicalGeneration = state.canonicalGeneration + 1
  await ctx.db.patch(state._id, { canonicalGeneration })
  return canonicalGeneration
}

export async function activateAssetReferenceProof(
  ctx: MutationCtx,
  run: Doc<'projectionRepairRuns'>,
) {
  const state = await readState(ctx)
  const canonicalGeneration = state?.canonicalGeneration ?? 0
  if (
    run.state !== 'complete' ||
    run.issueCount !== 0 ||
    run.canonicalGeneration !== canonicalGeneration
  ) {
    throw new Error('ASSET_REFERENCE_PROOF_NOT_CURRENT')
  }
  const patch = {
    verifiedRunId: run.runId,
    verifiedAt: run.completedAt ?? Date.now(),
  }
  if (state) await ctx.db.patch(state._id, patch)
  else {
    await ctx.db.insert('assetReferenceProofState', {
      key: PROOF_KEY,
      canonicalGeneration,
      ...patch,
    })
  }
}

export type AssetReferenceProofStatus =
  | {
      current: false
      canonicalGeneration: number
      verifiedRunId: string | null
      verifiedAt: number | null
    }
  | {
      current: true
      canonicalGeneration: number
      verifiedRunId: string
      verifiedAt: number
      referenced: boolean
    }

export type AssetReferenceProofSnapshot = {
  current: boolean
  canonicalGeneration: number
  verifiedRunId: string | null
  verifiedAt: number | null
  referencedAssetIds: ReadonlySet<string>
}

/**
 * Load the global reference proof once for a bounded asset read.
 *
 * The returned referenced ids are trusted only when `current` is true. Callers
 * must still treat a concrete derived reference row as used when the proof is
 * stale: stale rows may create a conservative false-positive, but can never
 * justify displaying an asset as definitely unused.
 */
export async function readAssetReferenceProofSnapshot(
  ctx: QueryOrMutationCtx,
): Promise<AssetReferenceProofSnapshot> {
  const state = await readState(ctx)
  const unavailable = {
    current: false,
    canonicalGeneration: state?.canonicalGeneration ?? 0,
    verifiedRunId: state?.verifiedRunId ?? null,
    verifiedAt: state?.verifiedAt ?? null,
    referencedAssetIds: new Set<string>(),
  }
  if (!state?.verifiedRunId || state.verifiedAt === null) return unavailable

  const run = await ctx.db
    .query('projectionRepairRuns')
    .withIndex('by_run_id', (query) => query.eq('runId', state.verifiedRunId!))
    .unique()
  if (
    !run ||
    run.state !== 'complete' ||
    run.issueCount !== 0 ||
    run.canonicalGeneration !== state.canonicalGeneration
  ) {
    return unavailable
  }
  return {
    current: true,
    canonicalGeneration: state.canonicalGeneration,
    verifiedRunId: run.runId,
    verifiedAt: state.verifiedAt,
    referencedAssetIds: new Set(run.referencedAssetIds),
  }
}

export async function readAssetReferenceProofStatus(
  ctx: QueryOrMutationCtx,
  assetId: string,
): Promise<AssetReferenceProofStatus> {
  const proof = await readAssetReferenceProofSnapshot(ctx)
  if (!proof.current || !proof.verifiedRunId || proof.verifiedAt === null) {
    return {
      current: false,
      canonicalGeneration: proof.canonicalGeneration,
      verifiedRunId: proof.verifiedRunId,
      verifiedAt: proof.verifiedAt,
    }
  }
  return {
    current: true,
    canonicalGeneration: proof.canonicalGeneration,
    verifiedRunId: proof.verifiedRunId,
    verifiedAt: proof.verifiedAt,
    referenced: proof.referencedAssetIds.has(assetId),
  }
}
