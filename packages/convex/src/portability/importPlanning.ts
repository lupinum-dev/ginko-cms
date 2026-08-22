import {
  appendImportPlanAssets as appendImportPlanAssetsArgs,
  appendImportPlanItems as appendImportPlanItemsArgs,
  createImportPlan as createImportPlanArgs,
  PORTABLE_IMPORT_LIMITS,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { portableSharedDraftState } from '@lupinum/ginko-cms-contract/shared/placementGraph.js'
import {
  canonicalJsonBytes,
  hashCanonicalJson,
  validatePortableDocument,
} from '@lupinum/ginko-content/portability'
import { v } from 'convex/values'

import { canManagePortability } from '../auth/checks.js'
import { callerMutation } from '../functions.js'
import { getCollection } from '../lib/collections.js'
import { assertMdcBodyWithinLimit } from '../lib/contentLimits.js'
import { readInstalledCmsContract } from '../lib/installedContract.js'
import { createPortableRootHashState } from './durableHash.js'
import { getImportRunByPlan as getRunByPlan } from './importModel.js'
import {
  assertImportPlanAssetPayload,
  assertImportPlanItemPayload,
  assertImportPlanPayload,
  assertSha256,
  PORTABLE_PLAN_PAGE_LIMIT,
  PORTABLE_RUN_TTL_MS,
} from './model.js'
import { hashPortableDocument } from './portableJson.js'

export function defineCreateImportPlan() {
  return callerMutation.protected({
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
      const installed = await readInstalledCmsContract(ctx)
      if (
        !installed ||
        installed.record.contentHash !== payload.targetContentHash ||
        installed.record.transitionState !== 'ready'
      ) {
        throw new Error('Portable plan target content hash does not match the installed contract.')
      }
      for (const collectionSlug of payload.scope.collections) {
        const collection = await getCollection(ctx, collectionSlug)
        if (!collection)
          throw new Error(`Portable plan collection "${collectionSlug}" is not installed.`)
      }
      const existing = await ctx.db
        .query('portableRuns')
        .withIndex('by_plan_id', (query) => query.eq('planId', args.planId))
        .unique()
      if (existing) {
        if (
          existing.mode !== 'import' ||
          existing.callerId !== identity.userId ||
          existing.payloadSha256 !== args.payloadSha256
        ) {
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
      await ctx.db.insert('portableRuns', {
        runId: `portable-import:${args.planId}`,
        planId: args.planId,
        mode: 'import',
        state: 'staging',
        payload: args.payload,
        payloadSha256: args.payloadSha256,
        callerId: identity.userId,
        deploymentId: payload.deploymentId,
        scope: payload.scope,
        targetContentHash: payload.targetContentHash,
        sourceManifestSha256: payload.sourceManifestSha256,
        sourceContentHash: payload.sourceContentHash,
        stagedItemCount: 0,
        stagedAssetCount: 0,
        stagedLocales: [],
        workPhase: null,
        workCursor: null,
        workGeneration: 0,
        workToken: null,
        workLeaseExpiresAt: null,
        workAttempts: 0,
        workNextAttemptAt: null,
        workLastError: null,
        workDeadLetteredAt: null,
        sealItemCount: 0,
        sealItemHash: createPortableRootHashState(),
        sealAssetCount: 0,
        sealAssetHash: createPortableRootHashState(),
        committedItemCount: 0,
        attachedAssetCount: 0,
        completedAt: null,
        createdAt,
        updatedAt: createdAt,
        expiresAt,
      })
      return { planId: args.planId, payloadSha256: args.payloadSha256, expiresAt }
    },
  })
}

export function defineAppendImportPlanItems() {
  return callerMutation.protected({
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
      const plan = await getRunByPlan(ctx, args.planId)
      if (plan.callerId !== identity.userId || plan.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable plan caller or payload mismatch.')
      }
      if (plan.expiresAt <= Date.now()) throw new Error('Portable plan expired.')
      if (plan.state !== 'staging') throw new Error('Sealed portable plans are immutable.')

      const payload = assertImportPlanPayload(plan.payload)
      const installed = await readInstalledCmsContract(ctx)
      if (
        !installed ||
        installed.record.transitionState !== 'ready' ||
        installed.record.contentHash !== payload.targetContentHash
      ) {
        throw new Error(
          'Portable plan target content hash no longer matches the installed contract.',
        )
      }
      const contract = installed.content
      const seen = new Set<string>()
      const seenApplyOrders = new Set<number>()
      const stagedLocales = new Set(plan.stagedLocales)
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
          .query('portableItems')
          .withIndex('by_run_item', (query) =>
            query.eq('runId', plan.runId).eq('itemKey', item.itemKey),
          )
          .unique()
        if (existing) {
          if (
            existing.inputSha256 !== item.inputSha256 ||
            existing.index !== item.applyOrder ||
            (await hashCanonicalJson(existing.document)) !==
              (await hashCanonicalJson(item.document))
          ) {
            throw new Error('Portable item key input mismatch.')
          }
          continue
        }
        const orderConflict = await ctx.db
          .query('portableItems')
          .withIndex('by_run_index', (query) =>
            query.eq('runId', plan.runId).eq('index', item.applyOrder),
          )
          .unique()
        if (orderConflict) throw new Error('Portable plan apply order is duplicated.')
        if (canonicalJsonBytes(item.document).length > PORTABLE_IMPORT_LIMITS.documentBytes) {
          throw new Error('Portable import document exceeds 256 KiB.')
        }
        const document = validatePortableDocument(item.document, contract)
        assertMdcBodyWithinLimit(document.body?.source ?? '', {
          locale: document.locale,
          field: 'bodyMdc',
        })
        if (
          document.collection !== itemPayload.identity.collection ||
          document.canonicalKey !== itemPayload.identity.canonicalKey ||
          document.locale !== itemPayload.identity.locale ||
          (await hashPortableDocument(document)) !== itemPayload.documentSha256
        ) {
          throw new Error('Portable plan document does not match its immutable item payload.')
        }
        if (
          (await hashCanonicalJson(portableSharedDraftState(document))) !== itemPayload.sharedSha256
        ) {
          throw new Error('Portable plan shared state does not match its immutable item payload.')
        }
        stagedLocales.add(document.locale)
        if (stagedLocales.size > PORTABLE_IMPORT_LIMITS.locales) {
          throw new Error(`Portable import locale count exceeds ${PORTABLE_IMPORT_LIMITS.locales}.`)
        }
        await ctx.db.insert('portableItems', {
          mode: 'import',
          runId: plan.runId,
          index: item.applyOrder,
          itemKey: item.itemKey,
          inputSha256: item.inputSha256,
          payload: item.payload,
          document: item.document,
          collection: document.collection,
          canonicalKey: document.canonicalKey,
          locale: document.locale,
          revisionId: null,
          state: 'staged',
          effect: null,
          resultId: null,
          committedAt: null,
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
        })
      }
      return { accepted: args.items.length }
    },
  })
}

export function defineAppendImportPlanAssets() {
  return callerMutation.protected({
    id: 'portability:appendImportPlanAssets',
    args: appendImportPlanAssetsArgs.args,
    guard: canManagePortability,
    returns: v.object({ accepted: v.number() }),
    handler: async (ctx, args) => {
      const identity = await ctx.appIdentity()
      if (args.assets.length === 0 || args.assets.length > PORTABLE_PLAN_PAGE_LIMIT) {
        throw new Error(`Portable plan asset pages contain 1-${PORTABLE_PLAN_PAGE_LIMIT} rows.`)
      }
      const plan = await getRunByPlan(ctx, args.planId)
      if (plan.callerId !== identity.userId || plan.payloadSha256 !== args.payloadSha256) {
        throw new Error('Portable plan caller or payload mismatch.')
      }
      if (plan.expiresAt <= Date.now()) throw new Error('Portable plan expired.')
      if (plan.state !== 'staging') throw new Error('Sealed portable plans are immutable.')

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
          .query('portableAssets')
          .withIndex('by_run_sha256', (query) =>
            query.eq('runId', plan.runId).eq('sha256', asset.assetKey),
          )
          .unique()
        if (existing) {
          if (existing.inputSha256 !== asset.inputSha256) {
            throw new Error('Portable asset key input mismatch.')
          }
          continue
        }
        const now = Date.now()
        await ctx.db.insert('portableAssets', {
          mode: 'import',
          runId: plan.runId,
          holdId: null,
          callerId: plan.callerId,
          sha256: asset.assetKey,
          inputSha256: asset.inputSha256,
          payload: asset.payload,
          byteLength: payload.bytes,
          mediaType: payload.mediaType,
          state: 'staged',
          storageId: null,
          assetId: null,
          attemptTokenHash: null,
          attemptGeneration: 0,
          leaseExpiresAt: null,
          storageOrigin: null,
          originalFilename: payload.originalFilename,
          expiresAt: plan.expiresAt,
          downloadTokenHash: null,
          downloadGeneration: 0,
          downloadAttempts: 0,
          downloadExpiresAt: null,
          createdAt: now,
          updatedAt: now,
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
}
