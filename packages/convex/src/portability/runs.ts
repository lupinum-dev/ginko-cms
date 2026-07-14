import {
  abortImport as abortImportArgs,
  appendImportPlanAssets as appendImportPlanAssetsArgs,
  appendImportPlanItems as appendImportPlanItemsArgs,
  applyImportBatch as applyImportBatchArgs,
  beginImportApply as beginImportApplyArgs,
  beginImportVerification as beginImportVerificationArgs,
  countPortableImportFieldValues,
  createImportPlan as createImportPlanArgs,
  expireImport as expireImportArgs,
  finalizeImport as finalizeImportArgs,
  inspectPortableAssets as inspectPortableAssetsArgs,
  inspectPortableDrafts as inspectPortableDraftsArgs,
  PORTABLE_IMPORT_LIMITS,
  sealImportPlan as sealImportPlanArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { assertResolvedContentContract } from '@lupinum/ginko-content/cms-contract'
import {
  canonicalJsonBytes,
  collectPortableReferences,
  hashCanonicalJson,
  IncrementalSha256,
  validatePortableDocument,
} from '@lupinum/ginko-content/portability'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { canManagePortability } from '../auth/checks.js'
import {
  callerAction,
  callerMutation,
  callerQuery,
  directInternalMutation,
  directInternalQuery,
} from '../functions.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { isCmsStorageReferenced } from '../storageMaintenance.js'
import { applyPortableDraft, portableDraftSha256 } from './items.js'
import {
  assertImportPlanAssetPayload,
  assertImportPlanItemPayload,
  assertImportPlanPayload,
  assertSha256,
  PORTABLE_PLAN_PAGE_LIMIT,
  PORTABLE_RUN_TTL_MS,
} from './model.js'

const stateResult = v.object({ runId: v.string(), state: v.string() })
const PORTABLE_STAGE_CLEANUP_PAGE_SIZE = 100

export const inspectPortableDrafts = callerQuery.protected({
  id: 'portability:inspectPortableDrafts',
  args: inspectPortableDraftsArgs.args,
  guard: canManagePortability,
  returns: v.array(
    v.object({
      itemKey: v.string(),
      currentDraftSha256: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.items.length === 0 || args.items.length > PORTABLE_PLAN_PAGE_LIMIT) {
      throw new Error(`Portable inspection pages contain 1-${PORTABLE_PLAN_PAGE_LIMIT} rows.`)
    }
    const seen = new Set<string>()
    const result = []
    for (const item of args.items) {
      if (seen.has(item.itemKey)) throw new Error('Portable inspection page has duplicate keys.')
      seen.add(item.itemKey)
      if ((await hashCanonicalJson(item.identity)) !== item.itemKey) {
        throw new Error('Portable inspection item key mismatch.')
      }
      result.push({
        itemKey: item.itemKey,
        currentDraftSha256: await portableDraftSha256(ctx, item.identity),
      })
    }
    return result
  },
})

export const inspectPortableAssets = callerQuery.protected({
  id: 'portability:inspectPortableAssets',
  args: inspectPortableAssetsArgs.args,
  guard: canManagePortability,
  returns: v.array(
    v.object({
      sha256: v.string(),
      current: v.union(
        v.object({
          assetId: v.string(),
          bytes: v.number(),
          mediaType: v.string(),
        }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.assets.length === 0 || args.assets.length > PORTABLE_PLAN_PAGE_LIMIT) {
      throw new Error(`Portable asset inspection pages contain 1-${PORTABLE_PLAN_PAGE_LIMIT} rows.`)
    }
    const seen = new Set<string>()
    const result = []
    for (const asset of args.assets) {
      assertSha256(asset.sha256, 'asset sha256')
      if (seen.has(asset.sha256)) throw new Error('Portable asset inspection has duplicate hashes.')
      seen.add(asset.sha256)
      const stored = await ctx.db
        .query('assets')
        .withIndex('by_sha256', (query) => query.eq('sha256', asset.sha256))
        .collect()
      const active = stored
        .filter((candidate) => candidate.deletedAt == null)
        .sort((left, right) => String(left._id).localeCompare(String(right._id)))
      const current =
        active.find(
          (candidate) => candidate.size === asset.bytes && candidate.mimeType === asset.mediaType,
        ) ?? active[0]
      result.push({
        sha256: asset.sha256,
        current: current
          ? {
              assetId: String(current._id),
              bytes: current.size,
              mediaType: current.mimeType,
            }
          : null,
      })
    }
    return result
  },
})

async function getPlan(ctx: QueryOrMutationCtx, planId: string): Promise<Doc<'portablePlans'>> {
  const plan = await ctx.db
    .query('portablePlans')
    .withIndex('by_plan_id', (query) => query.eq('planId', planId))
    .unique()
  if (!plan) throw new Error('Portable plan not found.')
  return plan
}

type ImportRun = Extract<Doc<'portableRuns'>, { mode: 'import' }>

async function getRun(ctx: QueryOrMutationCtx, runId: string): Promise<ImportRun> {
  const run = await ctx.db
    .query('portableRuns')
    .withIndex('by_run_id', (query) => query.eq('runId', runId))
    .unique()
  if (!run || run.mode !== 'import') throw new Error('Portable import run not found.')
  return run
}

function requireCurrentRun(
  run: ImportRun,
  args: { callerId: string; payloadSha256: string; state: ImportRun['state'] },
) {
  if (run.callerId !== args.callerId) throw new Error('Portable run belongs to another caller.')
  if (run.payloadSha256 !== args.payloadSha256) throw new Error('Portable run payload mismatch.')
  if (run.expiresAt <= Date.now()) throw new Error('Portable run expired.')
  if (run.state !== args.state)
    throw new Error(`Portable run state is ${run.state}, expected ${args.state}.`)
}

export const createImportPlan = callerMutation.protected({
  id: 'portability:createImportPlan',
  args: createImportPlanArgs.args,
  guard: canManagePortability,
  returns: v.object({ planId: v.string(), payloadSha256: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const identity = await ctx.appIdentity()
    const payload = assertImportPlanPayload(args.payload)
    assertSha256(args.payloadSha256, 'payloadSha256')
    if ((await hashCanonicalJson(args.payload)) !== args.payloadSha256) {
      throw new Error('Portable plan payload hash mismatch.')
    }
    const active = await ctx.db
      .query('cmsPolicies')
      .withIndex('by_key', (query) => query.eq('key', 'active'))
      .first()
    if (!active || active.contractSha256 !== payload.targetContractSha256) {
      throw new Error('Portable plan target contract does not match the installed contract.')
    }
    for (const collectionSlug of payload.scope.collections) {
      const collection = await ctx.db
        .query('collections')
        .withIndex('by_slug', (query) => query.eq('slug', collectionSlug))
        .first()
      if (!collection)
        throw new Error(`Portable plan collection "${collectionSlug}" is not installed.`)
    }
    const existing = await ctx.db
      .query('portablePlans')
      .withIndex('by_plan_id', (query) => query.eq('planId', args.planId))
      .unique()
    if (existing) {
      if (existing.callerId !== identity.userId || existing.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable plan ID conflict.')
      }
      return {
        planId: existing.planId,
        payloadSha256: existing.payloadSha256,
        expiresAt: existing.expiresAt,
      }
    }
    const createdAt = Date.now()
    const expiresAt = createdAt + PORTABLE_RUN_TTL_MS
    await ctx.db.insert('portablePlans', {
      planId: args.planId,
      payload: args.payload,
      payloadSha256: args.payloadSha256,
      callerId: identity.userId,
      stagedItemCount: 0,
      stagedAssetCount: 0,
      initializedAssetCount: 0,
      initializedAttachedAssetCount: 0,
      stagedLocales: [],
      stagedFieldValueCount: 0,
      stagedRelationEdgeCount: 0,
      createdAt,
      expiresAt,
    })
    return { planId: args.planId, payloadSha256: args.payloadSha256, expiresAt }
  },
})

export const appendImportPlanItems = callerMutation.protected({
  id: 'portability:appendImportPlanItems',
  args: appendImportPlanItemsArgs.args,
  guard: canManagePortability,
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const identity = await ctx.appIdentity()
    if (
      args.items.length === 0 ||
      args.items.length > PORTABLE_IMPORT_LIMITS.stagedItemsPerRequest
    ) {
      throw new Error(
        `Portable plan item pages contain 1-${PORTABLE_IMPORT_LIMITS.stagedItemsPerRequest} rows.`,
      )
    }
    const plan = await getPlan(ctx, args.planId)
    if (plan.callerId !== identity.userId || plan.payloadSha256 !== args.payloadSha256) {
      throw new Error('Portable plan caller or payload mismatch.')
    }
    if (plan.expiresAt <= Date.now()) throw new Error('Portable plan expired.')
    const run = await ctx.db
      .query('portableRuns')
      .withIndex('by_plan_id', (query) => query.eq('planId', plan.planId))
      .first()
    if (run) throw new Error('Sealed portable plans are immutable.')

    const payload = assertImportPlanPayload(plan.payload)
    const active = await ctx.db
      .query('cmsPolicies')
      .withIndex('by_key', (query) => query.eq('key', 'active'))
      .first()
    if (!active) throw new Error('Portable import requires an installed Content contract.')
    const contract = assertResolvedContentContract(active.contract)
    const seen = new Set<string>()
    const seenApplyOrders = new Set<number>()
    const stagedLocales = new Set(plan.stagedLocales)
    let stagedFieldValueCount = plan.stagedFieldValueCount
    let stagedRelationEdgeCount = plan.stagedRelationEdgeCount
    let inserted = 0
    for (const item of args.items) {
      if (seen.has(item.itemKey))
        throw new Error('Portable plan page contains a duplicate item key.')
      seen.add(item.itemKey)
      if (
        !Number.isSafeInteger(item.applyOrder) ||
        item.applyOrder < 0 ||
        item.applyOrder >= payload.itemCount ||
        seenApplyOrders.has(item.applyOrder)
      ) {
        throw new Error('Portable plan item apply order is invalid or duplicated.')
      }
      seenApplyOrders.add(item.applyOrder)
      const itemPayload = assertImportPlanItemPayload(item.payload)
      if ((await hashCanonicalJson(itemPayload.identity)) !== item.itemKey) {
        throw new Error('Portable item key mismatch.')
      }
      if ((await hashCanonicalJson(item.payload)) !== item.inputSha256) {
        throw new Error('Portable item input hash mismatch.')
      }
      const existing = await ctx.db
        .query('portableImportPlanItems')
        .withIndex('by_plan_item', (query) =>
          query.eq('planId', plan.planId).eq('itemKey', item.itemKey),
        )
        .unique()
      if (existing) {
        if (
          existing.inputSha256 !== item.inputSha256 ||
          existing.applyOrder !== item.applyOrder ||
          (await hashCanonicalJson(existing.document)) !== (await hashCanonicalJson(item.document))
        ) {
          throw new Error('Portable item key input mismatch.')
        }
        continue
      }
      const orderConflict = await ctx.db
        .query('portableImportPlanItems')
        .withIndex('by_plan_apply_order', (query) =>
          query.eq('planId', plan.planId).eq('applyOrder', item.applyOrder),
        )
        .unique()
      if (orderConflict) throw new Error('Portable plan apply order is duplicated.')
      if (canonicalJsonBytes(item.document).length > PORTABLE_IMPORT_LIMITS.documentBytes) {
        throw new Error('Portable import document exceeds 256 KiB.')
      }
      const document = validatePortableDocument(item.document, contract)
      if (
        document.collection !== itemPayload.identity.collection ||
        document.canonicalKey !== itemPayload.identity.canonicalKey ||
        document.locale !== itemPayload.identity.locale ||
        (await hashCanonicalJson(document as unknown as JsonMap)) !== itemPayload.documentSha256
      ) {
        throw new Error('Portable plan document does not match its immutable item payload.')
      }
      const collection = contract.collections[document.collection]!
      const relationEdges =
        collectPortableReferences(collection.fields, {
          ...document.shared,
          ...document.localized,
        }).length + (document.parentCanonicalKey === null ? 0 : 1)
      stagedLocales.add(document.locale)
      stagedFieldValueCount += countPortableImportFieldValues(document)
      stagedRelationEdgeCount += relationEdges
      if (stagedLocales.size > PORTABLE_IMPORT_LIMITS.locales) {
        throw new Error(`Portable import locale count exceeds ${PORTABLE_IMPORT_LIMITS.locales}.`)
      }
      if (stagedFieldValueCount > PORTABLE_IMPORT_LIMITS.fieldValues) {
        throw new Error(
          `Portable import field value count exceeds ${PORTABLE_IMPORT_LIMITS.fieldValues}.`,
        )
      }
      if (stagedRelationEdgeCount > PORTABLE_IMPORT_LIMITS.relationEdges) {
        throw new Error(
          `Portable import relation edge count exceeds ${PORTABLE_IMPORT_LIMITS.relationEdges}.`,
        )
      }
      await ctx.db.insert('portableImportPlanItems', {
        planId: plan.planId,
        applyOrder: item.applyOrder,
        itemKey: item.itemKey,
        inputSha256: item.inputSha256,
        payload: item.payload,
        document: item.document,
      })
      inserted += 1
    }
    if (plan.stagedItemCount + inserted > payload.itemCount) {
      throw new Error('Portable plan has more item rows than its immutable payload.')
    }
    if (inserted > 0) {
      await ctx.db.patch(plan._id, {
        stagedItemCount: plan.stagedItemCount + inserted,
        stagedLocales: [...stagedLocales].sort(),
        stagedFieldValueCount,
        stagedRelationEdgeCount,
      })
    }
    return { accepted: args.items.length }
  },
})

export const appendImportPlanAssets = callerMutation.protected({
  id: 'portability:appendImportPlanAssets',
  args: appendImportPlanAssetsArgs.args,
  guard: canManagePortability,
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const identity = await ctx.appIdentity()
    if (args.assets.length === 0 || args.assets.length > PORTABLE_PLAN_PAGE_LIMIT) {
      throw new Error(`Portable plan asset pages contain 1-${PORTABLE_PLAN_PAGE_LIMIT} rows.`)
    }
    const plan = await getPlan(ctx, args.planId)
    if (plan.callerId !== identity.userId || plan.payloadSha256 !== args.payloadSha256) {
      throw new Error('Portable plan caller or payload mismatch.')
    }
    if (plan.expiresAt <= Date.now()) throw new Error('Portable plan expired.')
    const run = await ctx.db
      .query('portableRuns')
      .withIndex('by_plan_id', (query) => query.eq('planId', plan.planId))
      .first()
    if (run) throw new Error('Sealed portable plans are immutable.')

    const planPayload = assertImportPlanPayload(plan.payload)
    const seen = new Set<string>()
    let inserted = 0
    for (const asset of args.assets) {
      if (seen.has(asset.assetKey)) {
        throw new Error('Portable plan page contains a duplicate asset key.')
      }
      seen.add(asset.assetKey)
      const payload = assertImportPlanAssetPayload(asset.payload)
      if (payload.sha256 !== asset.assetKey) throw new Error('Portable asset key mismatch.')
      if ((await hashCanonicalJson(asset.payload)) !== asset.inputSha256) {
        throw new Error('Portable asset input hash mismatch.')
      }
      const existing = await ctx.db
        .query('portableImportPlanAssets')
        .withIndex('by_plan_asset', (query) =>
          query.eq('planId', plan.planId).eq('assetKey', asset.assetKey),
        )
        .unique()
      if (existing) {
        if (existing.inputSha256 !== asset.inputSha256) {
          throw new Error('Portable asset key input mismatch.')
        }
        continue
      }
      await ctx.db.insert('portableImportPlanAssets', {
        planId: plan.planId,
        assetKey: asset.assetKey,
        inputSha256: asset.inputSha256,
        payload: asset.payload,
      })
      inserted += 1
    }
    if (plan.stagedAssetCount + inserted > planPayload.assetCount) {
      throw new Error('Portable plan has more asset rows than its immutable payload.')
    }
    if (inserted > 0) {
      await ctx.db.patch(plan._id, { stagedAssetCount: plan.stagedAssetCount + inserted })
    }
    return { accepted: args.assets.length }
  },
})

export const readImportSealPage = directInternalQuery({
  args: {
    planId: v.string(),
    callerId: v.string(),
    payloadSha256: v.string(),
    afterItemKey: v.union(v.string(), v.null()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const plan = await ctx.db
      .query('portablePlans')
      .withIndex('by_plan_id', (query) => query.eq('planId', args.planId))
      .unique()
    if (!plan || plan.callerId !== args.callerId || plan.payloadSha256 !== args.payloadSha256) {
      throw new Error('Portable plan caller or payload mismatch.')
    }
    if (plan.expiresAt <= Date.now()) throw new Error('Portable plan expired.')
    const payload = assertImportPlanPayload(plan.payload)
    const indexed = ctx.db.query('portableImportPlanItems').withIndex('by_plan_item', (query) => {
      const scoped = query.eq('planId', plan.planId)
      return args.afterItemKey === null ? scoped : scoped.gt('itemKey', args.afterItemKey)
    })
    const fetched = await indexed.take(PORTABLE_PLAN_PAGE_LIMIT + 1)
    const rows = fetched.slice(0, PORTABLE_PLAN_PAGE_LIMIT)
    for (const row of rows) {
      const item = assertImportPlanItemPayload(row.payload)
      if (!payload.scope.collections.includes(item.identity.collection)) {
        throw new Error('Portable plan item is outside the collection scope.')
      }
      const currentSha256 = await portableDraftSha256(ctx, item.identity)
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
    }
    return {
      payload: plan.payload,
      rows: rows.map((row) => ({ itemKey: row.itemKey, payload: row.payload })),
      nextItemKey:
        fetched.length > PORTABLE_PLAN_PAGE_LIMIT ? (rows.at(-1)?.itemKey ?? null) : null,
    }
  },
})

export const readImportAssetSealPage = directInternalQuery({
  args: {
    planId: v.string(),
    callerId: v.string(),
    payloadSha256: v.string(),
    afterAssetKey: v.union(v.string(), v.null()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const plan = await ctx.db
      .query('portablePlans')
      .withIndex('by_plan_id', (query) => query.eq('planId', args.planId))
      .unique()
    if (!plan || plan.callerId !== args.callerId || plan.payloadSha256 !== args.payloadSha256) {
      throw new Error('Portable plan caller or payload mismatch.')
    }
    if (plan.expiresAt <= Date.now()) throw new Error('Portable plan expired.')
    const indexed = ctx.db.query('portableImportPlanAssets').withIndex('by_plan_asset', (query) => {
      const scoped = query.eq('planId', plan.planId)
      return args.afterAssetKey === null ? scoped : scoped.gt('assetKey', args.afterAssetKey)
    })
    const fetched = await indexed.take(PORTABLE_PLAN_PAGE_LIMIT + 1)
    const rows = fetched.slice(0, PORTABLE_PLAN_PAGE_LIMIT)
    for (const row of rows) {
      const asset = assertImportPlanAssetPayload(row.payload)
      const stored = await ctx.db
        .query('assets')
        .withIndex('by_sha256', (query) => query.eq('sha256', asset.sha256))
        .collect()
      const active = stored.filter((candidate) => candidate.deletedAt == null)
      const exact = active.some(
        (candidate) => candidate.size === asset.bytes && candidate.mimeType === asset.mediaType,
      )
      const expectedEffect = active.length === 0 ? 'upload' : exact ? 'reuse' : 'conflict'
      if (asset.effect !== expectedEffect) {
        throw new Error(`Portable asset effect mismatch: expected ${expectedEffect}.`)
      }
      if (expectedEffect === 'conflict') {
        throw new Error(`Portable asset ${asset.sha256} conflicts with stored metadata.`)
      }
    }
    return {
      rows: rows.map((row) => ({ assetKey: row.assetKey, payload: row.payload })),
      nextAssetKey:
        fetched.length > PORTABLE_PLAN_PAGE_LIMIT ? (rows.at(-1)?.assetKey ?? null) : null,
    }
  },
})

export const initializeImportAssetStagePage = directInternalMutation({
  args: {
    planId: v.string(),
    callerId: v.string(),
    payloadSha256: v.string(),
    assetKeys: v.array(v.string()),
  },
  returns: v.object({ initialized: v.number(), attached: v.number() }),
  handler: async (ctx, args) => {
    if (args.assetKeys.length === 0 || args.assetKeys.length > PORTABLE_PLAN_PAGE_LIMIT) {
      throw new Error(
        `Portable asset initialization pages contain 1-${PORTABLE_PLAN_PAGE_LIMIT} rows.`,
      )
    }
    const plan = await getPlan(ctx, args.planId)
    if (plan.callerId !== args.callerId || plan.payloadSha256 !== args.payloadSha256) {
      throw new Error('Portable plan caller or payload mismatch.')
    }
    if (plan.expiresAt <= Date.now()) throw new Error('Portable plan expired.')
    const runId = `portable-import:${plan.planId}`
    let initialized = 0
    let attached = 0
    for (const assetKey of args.assetKeys) {
      const existing = await ctx.db
        .query('portableAssetStages')
        .withIndex('by_run_sha256', (query) => query.eq('runId', runId).eq('sha256', assetKey))
        .unique()
      if (existing) continue
      const row = await ctx.db
        .query('portableImportPlanAssets')
        .withIndex('by_plan_asset', (query) =>
          query.eq('planId', plan.planId).eq('assetKey', assetKey),
        )
        .unique()
      if (!row) throw new Error('Portable plan asset is missing during initialization.')
      const asset = assertImportPlanAssetPayload(row.payload)
      const stored = await ctx.db
        .query('assets')
        .withIndex('by_sha256', (query) => query.eq('sha256', asset.sha256))
        .collect()
      const exact = stored
        .filter(
          (candidate) =>
            candidate.deletedAt == null &&
            candidate.size === asset.bytes &&
            candidate.mimeType === asset.mediaType,
        )
        .sort((left, right) => String(left._id).localeCompare(String(right._id)))[0]
      const expectedEffect = stored.some((candidate) => candidate.deletedAt == null)
        ? exact
          ? 'reuse'
          : 'conflict'
        : 'upload'
      if (asset.effect !== expectedEffect || expectedEffect === 'conflict') {
        throw new Error(`Portable asset effect mismatch: expected ${expectedEffect}.`)
      }
      const now = Date.now()
      await ctx.db.insert('portableAssetStages', {
        runId,
        callerId: plan.callerId,
        sha256: asset.sha256,
        byteLength: asset.bytes,
        mediaType: asset.mediaType,
        state: exact ? 'attached' : 'awaiting-upload',
        storageId: exact?.storageId ?? null,
        assetId: exact ? String(exact._id) : null,
        attemptTokenHash: null,
        attemptGeneration: 0,
        leaseExpiresAt: null,
        storageOrigin: null,
        createdAt: now,
        updatedAt: now,
      })
      initialized += 1
      if (exact) attached += 1
    }
    if (initialized > 0) {
      await ctx.db.patch(plan._id, {
        initializedAssetCount: plan.initializedAssetCount + initialized,
        initializedAttachedAssetCount: plan.initializedAttachedAssetCount + attached,
      })
    }
    return { initialized, attached }
  },
})

export const commitImportSeal = directInternalMutation({
  args: {
    planId: v.string(),
    callerId: v.string(),
    payloadSha256: v.string(),
    itemCount: v.number(),
    itemRootSha256: v.string(),
    assetCount: v.number(),
    assetRootSha256: v.string(),
  },
  returns: stateResult,
  handler: async (ctx, args) => {
    const plan = await getPlan(ctx, args.planId)
    if (plan.callerId !== args.callerId || plan.payloadSha256 !== args.payloadSha256) {
      throw new Error('Portable plan caller or payload mismatch.')
    }
    const existing = await ctx.db
      .query('portableRuns')
      .withIndex('by_plan_id', (query) => query.eq('planId', plan.planId))
      .unique()
    if (existing) return { runId: existing.runId, state: existing.state }
    if (plan.expiresAt <= Date.now()) throw new Error('Portable plan expired.')
    const payload = assertImportPlanPayload(plan.payload)
    if (
      args.itemCount !== payload.itemCount ||
      plan.stagedItemCount !== payload.itemCount ||
      args.itemRootSha256 !== payload.itemRootSha256
    ) {
      throw new Error('Portable plan item root or count mismatch.')
    }
    if (
      args.assetCount !== payload.assetCount ||
      plan.stagedAssetCount !== payload.assetCount ||
      plan.initializedAssetCount !== payload.assetCount ||
      args.assetRootSha256 !== payload.assetRootSha256
    ) {
      throw new Error('Portable asset plan rows are incomplete.')
    }
    const active = await ctx.db
      .query('cmsPolicies')
      .withIndex('by_key', (query) => query.eq('key', 'active'))
      .first()
    if (!active || active.contractSha256 !== payload.targetContractSha256) {
      throw new Error('Portable plan target contract changed before sealing.')
    }
    const now = Date.now()
    const runId = `portable-import:${plan.planId}`
    await ctx.db.insert('portableRuns', {
      runId,
      planId: plan.planId,
      mode: 'import',
      state: 'planned',
      payloadSha256: plan.payloadSha256,
      callerId: plan.callerId,
      deploymentId: payload.deploymentId,
      scope: payload.scope,
      targetContractSha256: payload.targetContractSha256,
      sourceManifestSha256: payload.sourceManifestSha256,
      sourceContractSha256: payload.sourceContractSha256,
      committedItemCount: 0,
      attachedAssetCount: plan.initializedAttachedAssetCount,
      createdAt: now,
      updatedAt: now,
      expiresAt: plan.expiresAt,
    })
    return { runId, state: 'planned' }
  },
})

const readImportSealPageRef = makeFunctionReference<
  'query',
  {
    planId: string
    callerId: string
    payloadSha256: string
    afterItemKey: string | null
  },
  {
    rows: Array<{ itemKey: string; payload: JsonMap }>
    nextItemKey: string | null
  }
>('portability/runs:readImportSealPage')

const readImportAssetSealPageRef = makeFunctionReference<
  'query',
  {
    planId: string
    callerId: string
    payloadSha256: string
    afterAssetKey: string | null
  },
  {
    rows: Array<{ assetKey: string; payload: JsonMap }>
    nextAssetKey: string | null
  }
>('portability/runs:readImportAssetSealPage')

const initializeImportAssetStagePageRef = makeFunctionReference<
  'mutation',
  {
    planId: string
    callerId: string
    payloadSha256: string
    assetKeys: string[]
  },
  { initialized: number; attached: number }
>('portability/runs:initializeImportAssetStagePage')

const commitImportSealRef = makeFunctionReference<
  'mutation',
  {
    planId: string
    callerId: string
    payloadSha256: string
    itemCount: number
    itemRootSha256: string
    assetCount: number
    assetRootSha256: string
  },
  { runId: string; state: string }
>('portability/runs:commitImportSeal')

export const sealImportPlan = callerAction.protected({
  id: 'portability:sealImportPlan',
  args: sealImportPlanArgs.args,
  guard: canManagePortability,
  returns: stateResult,
  handler: async (ctx, args): Promise<{ runId: string; state: string }> => {
    const identity = await ctx.appIdentity()
    const hash = new IncrementalSha256()
    hash.update(new TextEncoder().encode('['))
    let afterItemKey: string | null = null
    let itemCount = 0
    for (;;) {
      const page: {
        rows: Array<{ itemKey: string; payload: JsonMap }>
        nextItemKey: string | null
      } = await ctx.runQuery(readImportSealPageRef, {
        planId: args.planId,
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
        afterItemKey,
      })
      for (const row of page.rows) {
        if (itemCount > 0) hash.update(new TextEncoder().encode(','))
        hash.update(canonicalJsonBytes(row.payload))
        itemCount += 1
      }
      if (page.nextItemKey === null) break
      afterItemKey = page.nextItemKey
    }
    hash.update(new TextEncoder().encode(']'))
    const assetHash = new IncrementalSha256()
    assetHash.update(new TextEncoder().encode('['))
    let afterAssetKey: string | null = null
    let assetCount = 0
    for (;;) {
      const page: {
        rows: Array<{ assetKey: string; payload: JsonMap }>
        nextAssetKey: string | null
      } = await ctx.runQuery(readImportAssetSealPageRef, {
        planId: args.planId,
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
        afterAssetKey,
      })
      for (const row of page.rows) {
        if (assetCount > 0) assetHash.update(new TextEncoder().encode(','))
        assetHash.update(canonicalJsonBytes(row.payload))
        assetCount += 1
      }
      if (page.rows.length > 0) {
        await ctx.runMutation(initializeImportAssetStagePageRef, {
          planId: args.planId,
          callerId: identity.userId,
          payloadSha256: args.payloadSha256,
          assetKeys: page.rows.map((row) => row.assetKey),
        })
      }
      if (page.nextAssetKey === null) break
      afterAssetKey = page.nextAssetKey
    }
    assetHash.update(new TextEncoder().encode(']'))
    return await ctx.runMutation(commitImportSealRef, {
      planId: args.planId,
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
      itemCount,
      itemRootSha256: hash.digestHex(),
      assetCount,
      assetRootSha256: assetHash.digestHex(),
    })
  },
})

export const beginImportApply = callerMutation.protected({
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
    if (run.state === 'applying' || run.state === 'verifying' || run.state === 'complete') {
      return { runId: run.runId, state: run.state }
    }
    requireCurrentRun(run, {
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
      state: 'planned',
    })
    const plan = await getPlan(ctx, run.planId)
    const payload = assertImportPlanPayload(plan.payload)
    if (run.attachedAssetCount !== payload.assetCount) {
      throw new Error('Portable import cannot apply before every asset is attached.')
    }
    await ctx.db.patch(run._id, { state: 'applying', updatedAt: Date.now() })
    return { runId: run.runId, state: 'applying' }
  },
})

export const readImportApplyBatch = directInternalQuery({
  args: {
    runId: v.string(),
    callerId: v.string(),
    payloadSha256: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.runId)
    requireCurrentRun(run, {
      callerId: args.callerId,
      payloadSha256: args.payloadSha256,
      state: 'applying',
    })
    const plan = await getPlan(ctx, run.planId)
    const payload = assertImportPlanPayload(plan.payload)
    const rows = await ctx.db
      .query('portableImportPlanItems')
      .withIndex('by_plan_apply_order', (query) =>
        query.eq('planId', run.planId).gte('applyOrder', run.committedItemCount),
      )
      .take(PORTABLE_IMPORT_LIMITS.appliedItemsPerBatch)
    rows.forEach((row, index) => {
      if (row.applyOrder !== run.committedItemCount + index) {
        throw new Error('Portable import apply order is incomplete.')
      }
    })
    return {
      committedItemCount: run.committedItemCount,
      itemCount: payload.itemCount,
      rows: rows.map((row) => ({
        applyOrder: row.applyOrder,
        itemKey: row.itemKey,
        inputSha256: row.inputSha256,
        payload: row.payload,
        document: row.document,
      })),
    }
  },
})

export const commitImportBatchItem = directInternalMutation({
  args: {
    runId: v.string(),
    callerId: v.string(),
    payloadSha256: v.string(),
    applyOrder: v.number(),
    itemKey: v.string(),
    inputSha256: v.string(),
  },
  returns: v.object({
    runId: v.string(),
    itemKey: v.string(),
    inputSha256: v.string(),
    status: v.literal('committed'),
    effect: v.union(v.literal('created-draft'), v.literal('updated-draft'), v.literal('skipped')),
    resultId: v.string(),
    committedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.runId)
    requireCurrentRun(run, {
      callerId: args.callerId,
      payloadSha256: args.payloadSha256,
      state: 'applying',
    })
    if (args.applyOrder !== run.committedItemCount) {
      throw new Error('Portable import batch item is stale or out of order.')
    }
    const row = await ctx.db
      .query('portableImportPlanItems')
      .withIndex('by_plan_item', (query) =>
        query.eq('planId', run.planId).eq('itemKey', args.itemKey),
      )
      .unique()
    if (!row || row.applyOrder !== args.applyOrder || row.inputSha256 !== args.inputSha256) {
      throw new Error('Portable plan item input mismatch.')
    }
    const planItem = assertImportPlanItemPayload(row.payload)
    const applied = await applyPortableDraft(ctx, {
      documentValue: row.document,
      planItem,
      runId: run.runId,
      appIdentityId: args.callerId,
      now: Date.now(),
    })
    const committedAt = Date.now()
    const result = {
      runId: run.runId,
      itemKey: row.itemKey,
      inputSha256: row.inputSha256,
      status: 'committed' as const,
      effect: applied.effect,
      resultId: applied.resultId,
      committedAt,
    }
    await ctx.db.insert('portableItemReceipts', result)
    await ctx.db.patch(run._id, {
      committedItemCount: run.committedItemCount + 1,
      updatedAt: committedAt,
    })
    return result
  },
})

const readImportApplyBatchRef = makeFunctionReference<
  'query',
  { runId: string; callerId: string; payloadSha256: string },
  {
    committedItemCount: number
    itemCount: number
    rows: Array<{
      applyOrder: number
      itemKey: string
      inputSha256: string
      payload: JsonMap
      document: JsonMap
    }>
  }
>('portability/runs:readImportApplyBatch')

const commitImportBatchItemRef = makeFunctionReference<
  'mutation',
  {
    runId: string
    callerId: string
    payloadSha256: string
    applyOrder: number
    itemKey: string
    inputSha256: string
  },
  unknown
>('portability/runs:commitImportBatchItem')

export const applyImportBatch = callerAction.protected({
  id: 'portability:applyImportBatch',
  args: applyImportBatchArgs.args,
  guard: canManagePortability,
  returns: v.object({ committed: v.number(), complete: v.boolean() }),
  handler: async (ctx, args): Promise<{ committed: number; complete: boolean }> => {
    const identity = await ctx.appIdentity()
    const batch = await ctx.runQuery(readImportApplyBatchRef, {
      runId: args.runId,
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
    })
    for (const row of batch.rows) {
      await ctx.runMutation(commitImportBatchItemRef, {
        runId: args.runId,
        callerId: identity.userId,
        payloadSha256: args.payloadSha256,
        applyOrder: row.applyOrder,
        itemKey: row.itemKey,
        inputSha256: row.inputSha256,
      })
    }
    const committed = batch.committedItemCount + batch.rows.length
    if (batch.rows.length === 0 && committed < batch.itemCount) {
      throw new Error('Portable import batch cannot make progress.')
    }
    return { committed, complete: committed === batch.itemCount }
  },
})

export const beginImportVerification = callerMutation.protected({
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
    if (run.state === 'verifying' || run.state === 'complete') {
      return { runId: run.runId, state: run.state }
    }
    requireCurrentRun(run, {
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
      state: 'applying',
    })
    const plan = await getPlan(ctx, run.planId)
    const payload = assertImportPlanPayload(plan.payload)
    if (run.committedItemCount !== payload.itemCount) {
      throw new Error('Portable import cannot verify before every item is committed.')
    }
    await ctx.db.patch(run._id, { state: 'verifying', updatedAt: Date.now() })
    return { runId: run.runId, state: 'verifying' }
  },
})

export const finalizeImport = callerMutation.protected({
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
    const existing = await ctx.db
      .query('portableImportReceipts')
      .withIndex('by_run', (query) => query.eq('runId', run.runId))
      .unique()
    if (existing) {
      if (run.callerId !== identity.userId || run.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable import receipt caller or payload mismatch.')
      }
      const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...result } = existing
      return result
    }
    requireCurrentRun(run, {
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
      state: 'verifying',
    })
    const plan = await getPlan(ctx, run.planId)
    const payload = assertImportPlanPayload(plan.payload)
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
    await ctx.db.insert('portableImportReceipts', result)
    await ctx.db.patch(run._id, { state: 'complete', updatedAt: completedAt })
    return result
  },
})

async function closeImportStagePage(
  ctx: MutationCtx,
  runId: string,
  cursor: string | null,
): Promise<void> {
  const indexed = ctx.db.query('portableAssetStages').withIndex('by_run_sha256', (query) => {
    const scoped = query.eq('runId', runId)
    return cursor === null ? scoped : scoped.gt('sha256', cursor)
  })
  const fetched = await indexed.take(PORTABLE_STAGE_CLEANUP_PAGE_SIZE + 1)
  const stages = fetched.slice(0, PORTABLE_STAGE_CLEANUP_PAGE_SIZE)
  const now = Date.now()
  for (const stage of stages) {
    if (stage.state === 'cleaned') continue
    if (stage.state === 'attached') {
      if (stage.storageOrigin === null) continue
      if (!stage.storageId || !stage.assetId) continue
      const assetId = ctx.db.normalizeId('assets', stage.assetId)
      const asset = assetId ? await ctx.db.get(assetId) : null
      if (!asset || asset.storageId !== stage.storageId) continue
      const contentReference = await ctx.db
        .query('contentAssetRefs')
        .withIndex('by_asset_source', (query) => query.eq('assetId', stage.assetId!))
        .first()
      if (contentReference) continue
      if (
        await isCmsStorageReferenced(ctx, stage.storageId, {
          assetId: asset._id,
          portableStageId: stage._id,
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
    await ctx.scheduler.runAfter(0, closeImportStagesRef, {
      runId,
      cursor: stages.at(-1)!.sha256,
    })
  }
}

export const closeImportStages = directInternalMutation({
  args: { runId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.runId)
    if (run.state !== 'aborted' && run.state !== 'expired') return null
    await closeImportStagePage(ctx, run.runId, args.cursor)
    return null
  },
})

const cleanupPortableAssetStageRef = makeFunctionReference<
  'action',
  { stageId: string; storageId: string; attempt: number },
  null
>('portability/assets:cleanupPortableAssetStage')

const closeImportStagesRef = makeFunctionReference<
  'mutation',
  { runId: string; cursor: string | null },
  null
>('portability/runs:closeImportStages')

export const abortImport = callerMutation.protected({
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
      await closeImportStagePage(ctx, run.runId, null)
      return { runId: run.runId, state: run.state }
    }
    if (run.state === 'complete' || run.state === 'expired') {
      throw new Error(`Terminal portable run state ${run.state} cannot be aborted.`)
    }
    if (run.expiresAt <= Date.now()) {
      throw new Error('Portable run expired and must be closed as expired.')
    }
    await ctx.db.patch(run._id, { state: 'aborted', updatedAt: Date.now() })
    await closeImportStagePage(ctx, run.runId, null)
    return { runId: run.runId, state: 'aborted' }
  },
})

export const expireImport = callerMutation.protected({
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
      await closeImportStagePage(ctx, run.runId, null)
      return { runId: run.runId, state: run.state }
    }
    if (run.state === 'complete' || run.state === 'aborted') {
      throw new Error(`Terminal portable run state ${run.state} cannot expire.`)
    }
    if (run.expiresAt > Date.now()) throw new Error('Portable run has not expired.')
    await ctx.db.patch(run._id, { state: 'expired', updatedAt: Date.now() })
    await closeImportStagePage(ctx, run.runId, null)
    return { runId: run.runId, state: 'expired' }
  },
})
