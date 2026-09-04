import { PORTABLE_IMPORT_LIMITS } from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { canonicalJsonBytes, validatePortableDocument } from '@lupinum/ginko-content/portability'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { internalAction } from '../_generated/server.js'
import { isStorageClaimedByAnotherOwner } from '../assets/storageOwnership.js'
import { directInternalMutation, directInternalQuery } from '../functions.js'
import { assertMdcBodyWithinLimit } from '../lib/contentLimits.js'
import {
  assertCmsContractWriteToken,
  cmsContractWriteTokenValidator,
  readInstalledCmsContract,
} from '../lib/installedContract.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { createPortableRootHashState, DurableSha256 } from './durableHash.js'
import {
  getImportRun as getRun,
  getImportRunByPlan as getRunByPlan,
  readActiveAssetMatch,
  type ImportRun,
} from './importModel.js'
import { applyPortableDraftGroup, inspectPortableDraft } from './items.js'
import {
  assertImportPlanAssetPayload,
  assertImportPlanItemPayload,
  assertImportPlanPayload,
  PORTABLE_PLAN_PAGE_LIMIT,
} from './model.js'
import { assertPortableFinalPlacementForRows } from './placement.js'
import {
  claimPortableWork,
  clearPortableWorkFields,
  failPortableWork,
  type PortableWorkerRefs,
  type PortableWorkLease,
} from './worker.js'

const stateResult = v.object({ runId: v.string(), state: v.string() })

const PORTABLE_STAGE_CLEANUP_PAGE_SIZE = 100
type ImportItem = Extract<Doc<'portableItems'>, { mode: 'import' }>

const runImportWorkPageRef = makeFunctionReference<'action', PortableWorkLease, null>(
  'portability/runs:runImportWorkPage',
)

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

const expireImportWorkLeaseRef = makeFunctionReference<'mutation', PortableWorkLease, null>(
  'portability/runs:expireImportWorkLease',
)

const importWorkerRefs: PortableWorkerRefs = {
  run: runImportWorkPageRef,
  watchdog: expireImportWorkLeaseRef,
}

export async function verifyImportTargetContract(
  ctx: QueryOrMutationCtx,
  targetContentHash: string,
): Promise<NonNullable<Awaited<ReturnType<typeof readInstalledCmsContract>>>> {
  const installed = await readInstalledCmsContract(ctx)
  if (
    !installed ||
    installed.record.contentHash !== targetContentHash ||
    installed.record.transitionState !== 'ready'
  ) {
    throw new Error('Portable plan target content hash no longer matches the installed contract.')
  }
  return installed
}

export function defineStartImportSealWork() {
  return directInternalMutation({
    args: {
      planId: v.string(),
      callerId: v.string(),
      payloadSha256: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
    },
    returns: v.object({
      runId: v.string(),
      state: v.string(),
      generation: v.union(v.number(), v.null()),
      token: v.union(v.string(), v.null()),
    }),
    handler: async (ctx, args) => {
      await assertCmsContractWriteToken(ctx, args.contractWriteToken)
      const plan = await getRunByPlan(ctx, args.planId)
      if (plan.callerId !== args.callerId || plan.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable plan caller or payload mismatch.')
      }
      if (plan.expiresAt <= Date.now()) throw new Error('Portable plan expired.')
      const payload = assertImportPlanPayload(plan.payload)
      if (
        plan.stagedItemCount !== payload.itemCount ||
        plan.stagedAssetCount !== payload.assetCount
      ) {
        throw new Error('Portable plan rows are incomplete.')
      }
      if (plan.state !== 'staging') {
        if (plan.state !== 'sealing') {
          return { runId: plan.runId, state: plan.state, generation: null, token: null }
        }
        if (plan.workPhase !== 'seal-items' && plan.workPhase !== 'seal-assets') {
          throw new Error('Portable seal worker phase is invalid.')
        }
        const now = Date.now()
        if (
          plan.workToken !== null &&
          plan.workLeaseExpiresAt !== null &&
          plan.workLeaseExpiresAt > now &&
          plan.workDeadLetteredAt === null
        ) {
          return {
            runId: plan.runId,
            state: 'sealing',
            generation: null,
            token: null,
          }
        }
        const lease = await claimPortableWork(
          ctx,
          plan,
          importWorkerRefs,
          {},
          {
            scheduleProcess: false,
          },
        )
        // The caller executes this newly claimed page immediately. The watchdog
        // is the crash recovery path if the action disappears before doing so.
        return {
          runId: lease.runId,
          state: 'sealing',
          generation: lease.generation,
          token: lease.token,
        }
      }

      await verifyImportTargetContract(ctx, payload.targetContentHash)
      const lease = await claimPortableWork(
        ctx,
        plan,
        importWorkerRefs,
        {
          state: 'sealing',
          workPhase: 'seal-items',
          workCursor: null,
          sealItemCount: 0,
          sealItemHash: createPortableRootHashState(),
          sealAssetCount: 0,
          sealAssetHash: createPortableRootHashState(),
          committedItemCount: 0,
          attachedAssetCount: 0,
        },
        { scheduleProcess: false },
      )
      return {
        runId: lease.runId,
        state: 'sealing',
        generation: lease.generation,
        token: lease.token,
      }
    },
  })
}

export async function queueNextWorkPage(
  ctx: MutationCtx,
  run: ImportRun,
  patch: Record<string, unknown>,
  options: { scheduleProcess?: boolean; callerClaim?: boolean } = {},
): Promise<PortableWorkLease> {
  return await claimPortableWork(ctx, run, importWorkerRefs, patch, options)
}

async function processSealItemPage(ctx: MutationCtx, run: ImportRun): Promise<void> {
  const payload = assertImportPlanPayload(run.payload)
  const installed = await verifyImportTargetContract(ctx, run.targetContentHash)
  const indexed = ctx.db.query('portableItems').withIndex('by_run_item', (query) => {
    const scoped = query.eq('runId', run.runId)
    return run.workCursor === null ? scoped : scoped.gt('itemKey', run.workCursor)
  })
  const fetched = await indexed.take(PORTABLE_PLAN_PAGE_LIMIT + 1)
  const rows = fetched.slice(0, PORTABLE_PLAN_PAGE_LIMIT)
  const hash = new DurableSha256(run.sealItemHash)
  let itemCount = run.sealItemCount
  for (const row of rows) {
    if (row.mode !== 'import') throw new Error('Portable import item mode mismatch.')
    const item = assertImportPlanItemPayload(row.payload)
    if (!payload.scope.collections.includes(item.identity.collection)) {
      throw new Error('Portable plan item is outside the collection scope.')
    }
    const current = await inspectPortableDraft(ctx, item.identity)
    const currentSha256 = current.currentDraftSha256
    if (current.currentSharedSha256 !== item.expectedSharedSha256) {
      throw new Error('Portable plan has a current shared draft conflict.')
    }
    const expectedEffect =
      currentSha256 === null
        ? 'create'
        : currentSha256 !== item.expectedDraftSha256
          ? 'conflict'
          : currentSha256 === item.documentSha256
            ? 'skip'
            : 'update'
    if (item.effect !== expectedEffect) {
      throw new Error(
        expectedEffect === 'conflict'
          ? 'Portable plan has a current draft conflict.'
          : `Portable plan item effect mismatch: expected ${expectedEffect}.`,
      )
    }
    const document = validatePortableDocument(row.document, installed.content)
    assertMdcBodyWithinLimit(document.body?.source ?? '', {
      locale: document.locale,
      field: 'bodyMdc',
    })
    if (itemCount > 0) hash.update(new TextEncoder().encode(','))
    hash.update(canonicalJsonBytes(row.payload))
    itemCount += 1
  }
  await assertPortableFinalPlacementForRows(
    ctx,
    run,
    rows.filter((row): row is ImportItem => row.mode === 'import'),
    installed.content,
  )
  if (fetched.length > PORTABLE_PLAN_PAGE_LIMIT) {
    await queueNextWorkPage(ctx, run, {
      workCursor: rows.at(-1)!.itemKey,
      sealItemCount: itemCount,
      sealItemHash: hash.snapshot(),
    })
    return
  }
  hash.update(new TextEncoder().encode(']'))
  if (
    itemCount !== payload.itemCount ||
    itemCount !== run.stagedItemCount ||
    hash.digestHex() !== payload.itemRootSha256
  ) {
    throw new Error('Portable plan item root or count mismatch.')
  }
  if (payload.assetCount === 0) {
    const assetHash = new DurableSha256(run.sealAssetHash)
    assetHash.update(new TextEncoder().encode(']'))
    if (assetHash.digestHex() !== payload.assetRootSha256 || run.stagedAssetCount !== 0) {
      throw new Error('Portable asset plan root or count mismatch.')
    }
    await verifyImportTargetContract(ctx, run.targetContentHash)
    await ctx.db.patch(run._id, {
      state: 'planned',
      sealItemCount: itemCount,
      sealItemHash: hash.snapshot(),
      sealAssetHash: assetHash.snapshot(),
      ...clearPortableWorkFields(),
      updatedAt: Date.now(),
    })
    return
  }
  await queueNextWorkPage(ctx, run, {
    workPhase: 'seal-assets',
    workCursor: null,
    sealItemCount: itemCount,
    sealItemHash: hash.snapshot(),
  })
}

async function processSealAssetPage(ctx: MutationCtx, run: ImportRun): Promise<void> {
  const payload = assertImportPlanPayload(run.payload)
  await verifyImportTargetContract(ctx, run.targetContentHash)
  const indexed = ctx.db.query('portableAssets').withIndex('by_run_sha256', (query) => {
    const scoped = query.eq('runId', run.runId)
    return run.workCursor === null ? scoped : scoped.gt('sha256', run.workCursor)
  })
  const fetched = await indexed.take(PORTABLE_PLAN_PAGE_LIMIT + 1)
  const rows = fetched.slice(0, PORTABLE_PLAN_PAGE_LIMIT)
  const hash = new DurableSha256(run.sealAssetHash)
  let assetCount = run.sealAssetCount
  let attachedAssetCount = run.attachedAssetCount
  for (const row of rows) {
    if (row.mode !== 'import' || row.state !== 'staged') {
      throw new Error('Portable asset seal cursor replayed unexpectedly.')
    }
    const asset = assertImportPlanAssetPayload(row.payload)
    const { active, exact } = await readActiveAssetMatch(ctx, asset)
    const expectedEffect = active === null ? 'upload' : exact ? 'reuse' : 'conflict'
    if (asset.effect !== expectedEffect || expectedEffect === 'conflict') {
      throw new Error(`Portable asset effect mismatch: expected ${expectedEffect}.`)
    }
    const now = Date.now()
    await ctx.db.patch(row._id, {
      state: exact ? 'attached' : 'awaiting-upload',
      storageId: exact?.storageId ?? null,
      assetId: exact ? String(exact._id) : null,
      updatedAt: now,
    })
    if (exact) attachedAssetCount += 1
    if (assetCount > 0) hash.update(new TextEncoder().encode(','))
    hash.update(canonicalJsonBytes(row.payload))
    assetCount += 1
  }
  if (fetched.length > PORTABLE_PLAN_PAGE_LIMIT) {
    await queueNextWorkPage(ctx, run, {
      workCursor: rows.at(-1)!.sha256,
      sealAssetCount: assetCount,
      sealAssetHash: hash.snapshot(),
      attachedAssetCount,
    })
    return
  }
  hash.update(new TextEncoder().encode(']'))
  if (
    assetCount !== payload.assetCount ||
    assetCount !== run.stagedAssetCount ||
    hash.digestHex() !== payload.assetRootSha256
  ) {
    throw new Error('Portable asset plan root or count mismatch.')
  }
  await verifyImportTargetContract(ctx, run.targetContentHash)
  await ctx.db.patch(run._id, {
    state: 'planned',
    sealAssetCount: assetCount,
    sealAssetHash: hash.snapshot(),
    attachedAssetCount,
    ...clearPortableWorkFields(),
    updatedAt: Date.now(),
  })
}

async function processApplyPage(ctx: MutationCtx, run: ImportRun): Promise<void> {
  const payload = assertImportPlanPayload(run.payload)
  const installed = await verifyImportTargetContract(ctx, run.targetContentHash)
  const rows: ImportItem[] = []
  let nextIndex = run.committedItemCount
  while (
    nextIndex < payload.itemCount &&
    rows.length < PORTABLE_IMPORT_LIMITS.appliedItemsPerBatch
  ) {
    const first = await ctx.db
      .query('portableItems')
      .withIndex('by_run_index', (query) => query.eq('runId', run.runId).eq('index', nextIndex))
      .unique()
    if (!first || first.mode !== 'import') {
      throw new Error('Portable import apply order is incomplete.')
    }
    const group = (
      await ctx.db
        .query('portableItems')
        .withIndex('by_run_identity', (query) =>
          query
            .eq('runId', run.runId)
            .eq('collection', first.collection)
            .eq('canonicalKey', first.canonicalKey),
        )
        .collect()
    )
      .filter((row): row is ImportItem => row.mode === 'import')
      .sort((left, right) => left.index - right.index)
    group.forEach((row, offset) => {
      if (row.index !== nextIndex + offset) {
        throw new Error('Portable canonical-entry group is not contiguous in apply order.')
      }
    })
    rows.push(...group)
    nextIndex += group.length
  }
  if (rows.length === 0 && run.committedItemCount < payload.itemCount) {
    throw new Error('Portable import apply page cannot make progress.')
  }
  let committedItemCount = run.committedItemCount
  for (let offset = 0; offset < rows.length; ) {
    const first = rows[offset]!
    const group = rows
      .slice(offset)
      .filter(
        (row) => row.collection === first.collection && row.canonicalKey === first.canonicalKey,
      )
    if (group.some((row) => row.state !== 'staged')) {
      throw new Error('Portable import apply cursor replayed a committed row.')
    }
    await assertPortableFinalPlacementForRows(ctx, run, group, installed.content)
    const applied = await applyPortableDraftGroup(ctx, {
      items: group.map((row) => ({
        documentValue: row.document,
        planItem: assertImportPlanItemPayload(row.payload),
      })),
      runId: run.runId,
      targetContentHash: run.targetContentHash,
      appIdentityId: run.callerId,
      now: Date.now(),
    })
    const committedAt = Date.now()
    for (let index = 0; index < group.length; index += 1) {
      await ctx.db.patch(group[index]!._id, {
        state: 'committed',
        effect: applied[index]!.effect,
        resultId: applied[index]!.resultId,
        committedAt,
      })
      committedItemCount += 1
    }
    offset += group.length
  }
  if (committedItemCount > payload.itemCount) {
    throw new Error('Portable import committed item count exceeded its immutable plan.')
  }
  if (committedItemCount === payload.itemCount) {
    await ctx.db.patch(run._id, {
      committedItemCount,
      ...clearPortableWorkFields(),
      updatedAt: Date.now(),
    })
    return
  }
  await queueNextWorkPage(ctx, run, { committedItemCount })
}

export async function processCleanupPage(ctx: MutationCtx, run: ImportRun): Promise<void> {
  const indexed = ctx.db.query('portableAssets').withIndex('by_run_sha256', (query) => {
    const scoped = query.eq('runId', run.runId)
    return run.workCursor === null ? scoped : scoped.gt('sha256', run.workCursor)
  })
  const fetched = await indexed.take(PORTABLE_STAGE_CLEANUP_PAGE_SIZE + 1)
  const stages = fetched.slice(0, PORTABLE_STAGE_CLEANUP_PAGE_SIZE)
  const now = Date.now()
  for (const stage of stages) {
    if (stage.state === 'cleaned') continue
    if (stage.state === 'attached') {
      if (stage.storageOrigin === null || !stage.storageId || !stage.assetId) continue
      const assetId = ctx.db.normalizeId('assets', stage.assetId)
      const asset = assetId ? await ctx.db.get(assetId) : null
      if (!asset || asset.storageId !== stage.storageId) continue
      const contentReference = await ctx.db
        .query('contentAssetRefs')
        .withIndex('by_asset_source', (query) => query.eq('assetId', stage.assetId!))
        .first()
      if (contentReference) continue
      if (
        await isStorageClaimedByAnotherOwner(ctx, stage.storageId, {
          assetId: asset._id,
          portableAssetId: stage._id,
        })
      ) {
        continue
      }
      await ctx.db.delete(asset._id)
      await ctx.db.patch(stage._id, {
        state: 'cleanup-required',
        assetId: null,
        attemptTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      await ctx.scheduler.runAfter(0, cleanupPortableAssetStageRef, {
        stageId: stage._id,
        storageId: stage.storageId,
        attempt: 1,
      })
      continue
    }
    if (!stage.storageId) {
      await ctx.db.patch(stage._id, {
        state: 'cleaned',
        attemptTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      continue
    }
    await ctx.db.patch(stage._id, {
      state: 'cleanup-required',
      attemptTokenHash: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, cleanupPortableAssetStageRef, {
      stageId: stage._id,
      storageId: stage.storageId,
      attempt: 1,
    })
  }
  if (fetched.length > PORTABLE_STAGE_CLEANUP_PAGE_SIZE) {
    await queueNextWorkPage(ctx, run, { workCursor: stages.at(-1)!.sha256 })
    return
  }
  await ctx.db.patch(run._id, { ...clearPortableWorkFields(), updatedAt: now })
}

export function defineProcessImportWorkPage() {
  return directInternalMutation({
    args: {
      runId: v.string(),
      generation: v.number(),
      token: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
    },
    returns: v.object({ status: v.string() }),
    handler: async (ctx, args) => {
      await assertCmsContractWriteToken(ctx, args.contractWriteToken)
      const run = await getRun(ctx, args.runId)
      if (run.workToken !== args.token || run.workGeneration !== args.generation) {
        return { status: 'stale' }
      }
      if (run.workLeaseExpiresAt === null || run.workLeaseExpiresAt <= Date.now()) {
        return { status: 'stale' }
      }
      if (run.workPhase === 'seal-items' && run.state === 'sealing') {
        await processSealItemPage(ctx, run)
        return { status: 'applied' }
      }
      if (run.workPhase === 'seal-assets' && run.state === 'sealing') {
        await processSealAssetPage(ctx, run)
        return { status: 'applied' }
      }
      if (run.workPhase === 'apply' && run.state === 'applying') {
        await processApplyPage(ctx, run)
        return { status: 'applied' }
      }
      if (run.workPhase === 'cleanup' && (run.state === 'aborted' || run.state === 'expired')) {
        await processCleanupPage(ctx, run)
        return { status: 'applied' }
      }
      return { status: 'stale' }
    },
  })
}

export function defineRunImportWorkPage() {
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
        await ctx.runMutation(processImportWorkPageRef, args)
      } catch (error) {
        await ctx.runMutation(recordImportWorkFailureRef, {
          ...args,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return null
    },
  })
}

async function failImportWork(
  ctx: MutationCtx,
  run: ImportRun,
  error: string,
): Promise<{ status: string }> {
  return await failPortableWork(ctx, run, importWorkerRefs, error)
}

export function defineRecordImportWorkFailure() {
  return directInternalMutation({
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
      const run = await getRun(ctx, args.runId)
      if (run.workGeneration !== args.generation || run.workToken !== args.token) {
        return { status: 'stale' }
      }
      return await failImportWork(ctx, run, args.error)
    },
  })
}

export function defineExpireImportWorkLease() {
  return directInternalMutation({
    args: {
      runId: v.string(),
      generation: v.number(),
      token: v.string(),
      contractWriteToken: cmsContractWriteTokenValidator,
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      await assertCmsContractWriteToken(ctx, args.contractWriteToken)
      const run = await getRun(ctx, args.runId)
      if (
        run.workGeneration !== args.generation ||
        run.workToken !== args.token ||
        run.workLeaseExpiresAt === null ||
        run.workLeaseExpiresAt > Date.now()
      ) {
        return null
      }
      await failImportWork(ctx, run, 'Portable import worker lease expired before completion.')
      return null
    },
  })
}

export function defineReadImportWorkStatus() {
  return directInternalQuery({
    args: { runId: v.string(), callerId: v.string(), payloadSha256: v.string() },
    returns: stateResult,
    handler: async (ctx, args) => {
      const run = await getRun(ctx, args.runId)
      if (run.callerId !== args.callerId || run.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable run caller or payload mismatch.')
      }
      return {
        runId: run.runId,
        state: run.workDeadLetteredAt === null ? run.state : 'failed',
      }
    },
  })
}

const cleanupPortableAssetStageRef = makeFunctionReference<
  'action',
  { stageId: string; storageId: string; attempt: number },
  null
>('portability/assets:cleanupPortableAssetStage')
