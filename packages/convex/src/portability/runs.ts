import {
  abortImport as abortImportArgs,
  appendImportPlanItems as appendImportPlanItemsArgs,
  applyImportItem as applyImportItemArgs,
  beginImportApply as beginImportApplyArgs,
  beginImportVerification as beginImportVerificationArgs,
  createImportPlan as createImportPlanArgs,
  expireImport as expireImportArgs,
  finalizeImport as finalizeImportArgs,
  inspectPortableDrafts as inspectPortableDraftsArgs,
  sealImportPlan as sealImportPlanArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  canonicalJsonBytes,
  hashCanonicalJson,
  IncrementalSha256,
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
import type { MutationCtx } from '../lib/types.js'
import { applyPortableDraft, portableDraftSha256 } from './items.js'
import {
  assertImportPlanItemPayload,
  assertImportPlanPayload,
  assertSha256,
  PORTABLE_PLAN_PAGE_LIMIT,
  PORTABLE_RUN_TTL_MS,
} from './model.js'

const stateResult = v.object({ runId: v.string(), state: v.string() })

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

async function getPlan(ctx: MutationCtx, planId: string): Promise<Doc<'portablePlans'>> {
  const plan = await ctx.db
    .query('portablePlans')
    .withIndex('by_plan_id', (query) => query.eq('planId', planId))
    .unique()
  if (!plan) throw new Error('Portable plan not found.')
  return plan
}

async function getRun(ctx: MutationCtx, runId: string): Promise<Doc<'portableRuns'>> {
  const run = await ctx.db
    .query('portableRuns')
    .withIndex('by_run_id', (query) => query.eq('runId', runId))
    .unique()
  if (!run) throw new Error('Portable run not found.')
  return run
}

function requireCurrentRun(
  run: Doc<'portableRuns'>,
  args: { callerId: string; payloadSha256: string; state: Doc<'portableRuns'>['state'] },
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
    if (args.items.length === 0 || args.items.length > PORTABLE_PLAN_PAGE_LIMIT) {
      throw new Error(`Portable plan item pages contain 1-${PORTABLE_PLAN_PAGE_LIMIT} rows.`)
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
    const seen = new Set<string>()
    let inserted = 0
    for (const item of args.items) {
      if (seen.has(item.itemKey))
        throw new Error('Portable plan page contains a duplicate item key.')
      seen.add(item.itemKey)
      const payload = assertImportPlanItemPayload(item.payload)
      if ((await hashCanonicalJson(payload.identity)) !== item.itemKey) {
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
        if (existing.inputSha256 !== item.inputSha256) {
          throw new Error('Portable item key input mismatch.')
        }
        continue
      }
      await ctx.db.insert('portableImportPlanItems', {
        planId: plan.planId,
        itemKey: item.itemKey,
        inputSha256: item.inputSha256,
        payload: item.payload,
      })
      inserted += 1
    }
    if (plan.stagedItemCount + inserted > payload.itemCount) {
      throw new Error('Portable plan has more item rows than its immutable payload.')
    }
    if (inserted > 0) {
      await ctx.db.patch(plan._id, { stagedItemCount: plan.stagedItemCount + inserted })
    }
    return { accepted: args.items.length }
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

export const commitImportSeal = directInternalMutation({
  args: {
    planId: v.string(),
    callerId: v.string(),
    payloadSha256: v.string(),
    itemCount: v.number(),
    itemRootSha256: v.string(),
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
      payload.assetCount !== 0 ||
      plan.stagedAssetCount !== 0 ||
      (await hashCanonicalJson([])) !== payload.assetRootSha256
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
      attachedAssetCount: 0,
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

const commitImportSealRef = makeFunctionReference<
  'mutation',
  {
    planId: string
    callerId: string
    payloadSha256: string
    itemCount: number
    itemRootSha256: string
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
    return await ctx.runMutation(commitImportSealRef, {
      planId: args.planId,
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
      itemCount,
      itemRootSha256: hash.digestHex(),
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
    await ctx.db.patch(run._id, { state: 'applying', updatedAt: Date.now() })
    return { runId: run.runId, state: 'applying' }
  },
})

export const applyImportItem = callerMutation.protected({
  id: 'portability:applyImportItem',
  args: applyImportItemArgs.args,
  guard: canManagePortability,
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
    const identity = await ctx.appIdentity()
    const run = await getRun(ctx, args.runId)
    requireCurrentRun(run, {
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
      state: 'applying',
    })
    const receipt = await ctx.db
      .query('portableItemReceipts')
      .withIndex('by_run_item', (query) => query.eq('runId', run.runId).eq('itemKey', args.itemKey))
      .unique()
    if (receipt) {
      if (receipt.inputSha256 !== args.inputSha256) {
        throw new Error('Portable receipt input mismatch.')
      }
      const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...result } = receipt
      return result
    }
    const row = await ctx.db
      .query('portableImportPlanItems')
      .withIndex('by_plan_item', (query) =>
        query.eq('planId', run.planId).eq('itemKey', args.itemKey),
      )
      .unique()
    if (!row || row.inputSha256 !== args.inputSha256) {
      throw new Error('Portable plan item input mismatch.')
    }
    const planItem = assertImportPlanItemPayload(row.payload)
    const applied = await applyPortableDraft(ctx, {
      documentValue: args.document,
      planItem,
      appIdentityId: identity.userId,
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
    if (run.state === 'aborted') return { runId: run.runId, state: run.state }
    if (run.state === 'complete' || run.state === 'expired') {
      throw new Error(`Terminal portable run state ${run.state} cannot be aborted.`)
    }
    if (run.expiresAt <= Date.now()) {
      throw new Error('Portable run expired and must be closed as expired.')
    }
    await ctx.db.patch(run._id, { state: 'aborted', updatedAt: Date.now() })
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
    if (run.state === 'expired') return { runId: run.runId, state: run.state }
    if (run.state === 'complete' || run.state === 'aborted') {
      throw new Error(`Terminal portable run state ${run.state} cannot expire.`)
    }
    if (run.expiresAt > Date.now()) throw new Error('Portable run has not expired.')
    await ctx.db.patch(run._id, { state: 'expired', updatedAt: Date.now() })
    return { runId: run.runId, state: 'expired' }
  },
})
