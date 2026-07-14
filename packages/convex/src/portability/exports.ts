import {
  abortExportRun as abortExportRunArgs,
  beginPortableAssetDownload as beginPortableAssetDownloadArgs,
  captureExportPage as captureExportPageArgs,
  claimPortableAssetDownload as claimPortableAssetDownloadArgs,
  completeExportRun as completeExportRunArgs,
  createExportRun as createExportRunArgs,
  expireExportRun as expireExportRunArgs,
  readExportDocuments as readExportDocumentsArgs,
  readExportAssets as readExportAssetsArgs,
  sealExportRun as sealExportRunArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  type ResolvedContentContractV1,
} from '@lupinum/ginko-content/cms-contract'
import {
  canonicalJsonBytes,
  collectPortableAssetReferences,
  collectPortableMdcAssetReferences,
  hashCanonicalJson,
  type PortableAssetReferenceV1,
  type PortableDocumentV1,
} from '@lupinum/ginko-content/portability'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { internalMutation } from '../_generated/server.js'
import { canManagePortability } from '../auth/checks.js'
import { callerMutation, callerQuery } from '../functions.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { portablePublishedDocument } from './items.js'
import {
  assertSha256,
  PORTABLE_ASSET_LIMIT,
  PORTABLE_DOCUMENT_LIMIT,
  PORTABLE_ROW_BYTE_LIMIT,
  PORTABLE_RUN_TTL_MS,
} from './model.js'

const CAPTURE_PAGE_SIZE = 100
const EXPORT_LEASE_MS = 60_000
const DOWNLOAD_CAPABILITY_MS = 60_000
const MAX_ACTIVE_EXPORTS = 100
const CLEANUP_PAGE_SIZE = 100
const expireExportRunInternalRef = makeFunctionReference<
  'mutation',
  { runId: string; expiresAt: number },
  null
>('portability/exports:expireExportRunInternal')
const cleanupExportRowsRef = makeFunctionReference<
  'mutation',
  { runId: string },
  { deleted: number; complete: boolean }
>('portability/exports:cleanupExportRows')
const expireExportLeaseInternalRef = makeFunctionReference<
  'mutation',
  { runId: string; leaseGeneration: number; leaseExpiresAt: number },
  null
>('portability/exports:expireExportLeaseInternal')

type ExportRun = Extract<Doc<'portableRuns'>, { mode: 'export' }>
type CallerCtx = QueryOrMutationCtx & {
  appIdentity: () => Promise<{ userId: string }>
}

function exportRun(run: Doc<'portableRuns'> | null): ExportRun {
  if (!run || run.mode !== 'export') throw new Error('Portable export run not found.')
  return run
}

async function getExportRun(ctx: QueryOrMutationCtx, runId: string): Promise<ExportRun> {
  return exportRun(
    await ctx.db
      .query('portableRuns')
      .withIndex('by_run_id', (query) => query.eq('runId', runId))
      .unique(),
  )
}

async function requireOwnedExport(ctx: CallerCtx, runId: string): Promise<ExportRun> {
  const identity = await ctx.appIdentity()
  const run = await getExportRun(ctx, runId)
  if (run.callerId !== identity.userId)
    throw new Error('Portable export belongs to another caller.')
  return run
}

function requireCaptureLease(
  run: ExportRun,
  args: { leaseTokenHash: string; leaseGeneration: number },
  now = Date.now(),
) {
  assertSha256(args.leaseTokenHash, 'leaseTokenHash')
  if (run.state !== 'capturing') {
    throw new Error(`Portable export state is ${run.state}, expected capturing.`)
  }
  if (run.leaseTokenHash !== args.leaseTokenHash || run.leaseGeneration !== args.leaseGeneration) {
    throw new Error('Portable export lease token or generation is stale.')
  }
  if (run.expiresAt <= now || run.leaseExpiresAt === null || run.leaseExpiresAt <= now) {
    throw new Error('Portable export capture lease expired; restart the export.')
  }
}

async function scheduleLeaseExpiry(
  ctx: MutationCtx,
  runId: string,
  leaseGeneration: number,
  leaseExpiresAt: number,
) {
  await ctx.scheduler.runAt(leaseExpiresAt, expireExportLeaseInternalRef, {
    runId,
    leaseGeneration,
    leaseExpiresAt,
  })
}

export const createExportRun = callerMutation.protected({
  id: 'portability:createExportRun',
  args: createExportRunArgs.args,
  guard: canManagePortability,
  returns: v.object({
    runId: v.string(),
    state: v.literal('capturing'),
    payloadSha256: v.string(),
    leaseGeneration: v.number(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.appIdentity()
    assertSha256(args.sourceContractSha256, 'sourceContractSha256')
    assertSha256(args.leaseTokenHash, 'leaseTokenHash')
    if (
      !args.runId ||
      !args.deploymentId ||
      args.scope.collections.length === 0 ||
      args.scope.collections.length > 100 ||
      args.scope.collections.some(
        (slug, index) => !slug || (index > 0 && args.scope.collections[index - 1]! >= slug),
      )
    ) {
      throw new Error('Portable export scope is invalid.')
    }
    const policy = await ctx.db
      .query('cmsPolicies')
      .withIndex('by_key', (query) => query.eq('key', 'active'))
      .unique()
    if (!policy || policy.contractSha256 !== args.sourceContractSha256) {
      throw new Error('Portable export source contract does not match the installed contract.')
    }
    const contract = assertResolvedContentContract(policy.contract)
    for (const slug of args.scope.collections) {
      if (!contract.collections[slug]) {
        throw new Error(`Portable export collection "${slug}" is absent from the contract.`)
      }
      const collection = await ctx.db
        .query('collections')
        .withIndex('by_slug', (query) => query.eq('slug', slug))
        .unique()
      if (!collection) throw new Error(`Portable export collection "${slug}" is not installed.`)
    }
    const payload = {
      format: 'ginko-cms-portability-export',
      version: 1,
      deploymentId: args.deploymentId,
      scope: args.scope,
      sourceContractSha256: args.sourceContractSha256,
    } as const
    const payloadSha256 = await hashCanonicalJson(payload)
    const existing = await ctx.db
      .query('portableRuns')
      .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
      .unique()
    if (existing) {
      const run = exportRun(existing)
      if (
        run.callerId !== identity.userId ||
        run.payloadSha256 !== payloadSha256 ||
        run.leaseTokenHash !== args.leaseTokenHash ||
        run.state !== 'capturing'
      ) {
        throw new Error('Portable export run ID conflict.')
      }
      return {
        runId: run.runId,
        state: run.state,
        payloadSha256: run.payloadSha256,
        leaseGeneration: run.leaseGeneration,
        expiresAt: run.expiresAt,
      }
    }
    const now = Date.now()
    const active = await ctx.db
      .query('portableRuns')
      .withIndex('by_mode_state', (query) => query.eq('mode', 'export').eq('state', 'capturing'))
      .take(MAX_ACTIVE_EXPORTS + 1)
    const liveActive = active.filter(
      (candidate) =>
        candidate.mode === 'export' &&
        candidate.leaseExpiresAt !== null &&
        candidate.leaseExpiresAt > now,
    )
    if (liveActive.length >= MAX_ACTIVE_EXPORTS) {
      throw new Error('Too many active portable export captures; retry later.')
    }
    const requested = new Set<string>(args.scope.collections)
    if (
      liveActive.some((candidate) =>
        candidate.scope.collections.some((slug) => requested.has(slug)),
      )
    ) {
      throw new Error('A portable export is already capturing part of this scope; retry later.')
    }
    const previous = await ctx.db
      .query('portableRuns')
      .withIndex('by_mode_created_at', (query) => query.eq('mode', 'export'))
      .order('desc')
      .first()
    const leaseGeneration = previous?.mode === 'export' ? previous.leaseGeneration + 1 : 1
    const expiresAt = now + PORTABLE_RUN_TTL_MS
    await ctx.db.insert('portableRuns', {
      runId: args.runId,
      planId: null,
      mode: 'export',
      state: 'capturing',
      payloadSha256,
      callerId: identity.userId,
      deploymentId: args.deploymentId,
      scope: args.scope,
      sourceContractSha256: args.sourceContractSha256,
      sourceContract: policy.contract as JsonMap,
      documentCount: 0,
      assetCount: 0,
      capturePosition: {
        collectionIndex: 0,
        localeIndex: 0,
        orderKey: null,
        entryId: null,
      },
      captureComplete: false,
      leaseTokenHash: args.leaseTokenHash,
      leaseGeneration,
      leaseExpiresAt: now + EXPORT_LEASE_MS,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    })
    await ctx.scheduler.runAfter(PORTABLE_RUN_TTL_MS, expireExportRunInternalRef, {
      runId: args.runId,
      expiresAt,
    })
    await scheduleLeaseExpiry(ctx, args.runId, leaseGeneration, now + EXPORT_LEASE_MS)
    return {
      runId: args.runId,
      state: 'capturing',
      payloadSha256,
      leaseGeneration,
      expiresAt,
    }
  },
})

export const captureExportPage = callerMutation.protected({
  id: 'portability:captureExportPage',
  args: captureExportPageArgs.args,
  guard: canManagePortability,
  returns: v.object({ captured: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await requireOwnedExport(ctx, args.runId)
    const now = Date.now()
    requireCaptureLease(run, args, now)
    if (run.captureComplete) return { captured: 0, complete: true }
    const contract = assertResolvedContentContract(run.sourceContract)
    const position = run.capturePosition
    const collectionSlug = run.scope.collections[position.collectionIndex]
    if (!collectionSlug) {
      const leaseExpiresAt = now + EXPORT_LEASE_MS
      await ctx.db.patch(run._id, {
        captureComplete: true,
        leaseExpiresAt,
        updatedAt: now,
      })
      await scheduleLeaseExpiry(ctx, run.runId, run.leaseGeneration, leaseExpiresAt)
      return { captured: 0, complete: true }
    }
    const collection = await ctx.db
      .query('collections')
      .withIndex('by_slug', (query) => query.eq('slug', collectionSlug))
      .unique()
    if (!collection) throw new Error('Portable export collection disappeared during capture.')
    const locale = collection.locales[position.localeIndex]
    if (!locale) {
      const complete = position.collectionIndex + 1 >= run.scope.collections.length
      const leaseExpiresAt = now + EXPORT_LEASE_MS
      await ctx.db.patch(run._id, {
        capturePosition: {
          collectionIndex: position.collectionIndex + 1,
          localeIndex: 0,
          orderKey: null,
          entryId: null,
        },
        captureComplete: complete,
        leaseExpiresAt,
        updatedAt: now,
      })
      await scheduleLeaseExpiry(ctx, run.runId, run.leaseGeneration, leaseExpiresAt)
      return { captured: 0, complete }
    }
    const ordered = ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_orderKey_entry', (query) =>
        query.eq('collectionId', collection._id).eq('locale', locale),
      )
    const fetched = await (position.orderKey !== null && position.entryId !== null
      ? ordered
          .filter((query) =>
            query.or(
              query.gt(query.field('orderKey'), position.orderKey!),
              query.and(
                query.eq(query.field('orderKey'), position.orderKey!),
                query.gt(query.field('entryId'), position.entryId!),
              ),
            ),
          )
          .take(CAPTURE_PAGE_SIZE + 1)
      : ordered.take(CAPTURE_PAGE_SIZE + 1))
    const page = fetched.slice(0, CAPTURE_PAGE_SIZE)
    let documentCount = run.documentCount
    let assetCount = run.assetCount
    for (const row of page) {
      if (documentCount >= PORTABLE_DOCUMENT_LIMIT) {
        throw new Error('Portable export exceeds the document limit.')
      }
      const entry = await ctx.db.get(row.entryId)
      if (!entry) throw new Error('Portable export entry disappeared during capture.')
      const canonicalKey = entry.stableId ?? entry.baseSlug
      const document = await portablePublishedDocument(ctx, {
        revisionId: row.revisionId,
        collection: collectionSlug,
        canonicalKey,
        locale,
        contract,
      })
      const documentSha256 = await hashCanonicalJson(document as unknown as JsonMap)
      if (canonicalJsonBytes(document as unknown as JsonMap).length > PORTABLE_ROW_BYTE_LIMIT) {
        throw new Error('Portable export document exceeds the 256 KiB roster row limit.')
      }
      const duplicate = await ctx.db
        .query('portableExportRoster')
        .withIndex('by_run_identity', (query) =>
          query
            .eq('runId', run.runId)
            .eq('collection', collectionSlug)
            .eq('canonicalKey', canonicalKey)
            .eq('locale', locale),
        )
        .unique()
      if (duplicate) throw new Error('Portable export roster identity is duplicated.')
      await ctx.db.insert('portableExportRoster', {
        runId: run.runId,
        index: documentCount,
        collection: collectionSlug,
        canonicalKey,
        locale,
        revisionId: row.revisionId,
        document: document as unknown as JsonMap,
        documentSha256,
      })
      documentCount += 1
      assetCount = await holdDocumentAssets(ctx, run, contract, document, assetCount)
    }
    const hasMore = fetched.length > CAPTURE_PAGE_SIZE
    const last = page.at(-1)
    const nextLocaleIndex = hasMore ? position.localeIndex : position.localeIndex + 1
    const nextCollectionIndex = position.collectionIndex
    const captureComplete =
      !hasMore &&
      nextLocaleIndex >= collection.locales.length &&
      nextCollectionIndex + 1 >= run.scope.collections.length
    const leaseExpiresAt = now + EXPORT_LEASE_MS
    await ctx.db.patch(run._id, {
      documentCount,
      assetCount,
      capturePosition:
        hasMore && last
          ? {
              collectionIndex: position.collectionIndex,
              localeIndex: position.localeIndex,
              orderKey: last.orderKey,
              entryId: last.entryId,
            }
          : nextLocaleIndex < collection.locales.length
            ? {
                collectionIndex: position.collectionIndex,
                localeIndex: nextLocaleIndex,
                orderKey: null,
                entryId: null,
              }
            : {
                collectionIndex: position.collectionIndex + 1,
                localeIndex: 0,
                orderKey: null,
                entryId: null,
              },
      captureComplete,
      leaseExpiresAt,
      updatedAt: now,
    })
    await scheduleLeaseExpiry(ctx, run.runId, run.leaseGeneration, leaseExpiresAt)
    return { captured: page.length, complete: captureComplete }
  },
})

async function holdDocumentAssets(
  ctx: MutationCtx,
  run: ExportRun,
  contract: ResolvedContentContractV1,
  document: PortableDocumentV1,
  currentCount: number,
) {
  const collection = contract.collections[document.collection]!
  const references: PortableAssetReferenceV1[] = collectPortableAssetReferences(collection.fields, {
    ...document.shared,
    ...document.localized,
  })
  if (document.body) {
    for (const reference of await collectPortableMdcAssetReferences(
      document.body.source,
      collection.componentPolicy,
    )) {
      references.push({
        kind: 'local',
        path: reference.path,
        sha256: reference.sha256,
        bytes: 0,
        mediaType: reference.mediaType,
        originalFilename: null,
      })
    }
  }
  let count = currentCount
  for (const reference of references) {
    if (reference.kind !== 'local') continue
    const existing = await ctx.db
      .query('portableExportAssets')
      .withIndex('by_run_sha256', (query) =>
        query.eq('runId', run.runId).eq('sha256', reference.sha256),
      )
      .unique()
    if (existing) continue
    if (count >= PORTABLE_ASSET_LIMIT) throw new Error('Portable export exceeds the asset limit.')
    const candidates = await ctx.db
      .query('assets')
      .withIndex('by_sha256', (query) => query.eq('sha256', reference.sha256))
      .take(101)
    if (candidates.length > 100)
      throw new Error('Portable asset identity is unexpectedly ambiguous.')
    const asset = candidates.find(
      (candidate) =>
        candidate.deletedAt == null &&
        candidate.size === (reference.bytes || candidate.size) &&
        candidate.mimeType === reference.mediaType,
    )
    if (!asset) throw new Error('Portable export asset is unavailable or corrupt.')
    await ctx.db.insert('portableExportAssets', {
      holdId: await hashCanonicalJson({ runId: run.runId, sha256: asset.sha256 }),
      runId: run.runId,
      sha256: asset.sha256,
      storageId: asset.storageId,
      bytes: asset.size,
      mediaType: asset.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
      originalFilename: asset.filename,
      expiresAt: run.expiresAt,
      downloadTokenHash: null,
      downloadGeneration: 0,
      downloadAttempts: 0,
      downloadExpiresAt: null,
    })
    count += 1
  }
  return count
}

export const sealExportRun = callerMutation.protected({
  id: 'portability:sealExportRun',
  args: sealExportRunArgs.args,
  guard: canManagePortability,
  returns: v.object({
    state: v.literal('ready'),
    documentCount: v.number(),
    assetCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await requireOwnedExport(ctx, args.runId)
    requireCaptureLease(run, args)
    if (!run.captureComplete) throw new Error('Portable export capture is not complete.')
    if (run.documentCount > 0) {
      const last = await ctx.db
        .query('portableExportRoster')
        .withIndex('by_run_index', (query) =>
          query.eq('runId', run.runId).eq('index', run.documentCount - 1),
        )
        .unique()
      if (!last) throw new Error('Portable export roster count is incomplete.')
    }
    await ctx.db.patch(run._id, {
      state: 'ready',
      leaseTokenHash: null,
      leaseExpiresAt: null,
      updatedAt: Date.now(),
    })
    return { state: 'ready', documentCount: run.documentCount, assetCount: run.assetCount }
  },
})

export const readExportDocuments = callerQuery.protected({
  id: 'portability:readExportDocuments',
  args: readExportDocumentsArgs.args,
  guard: canManagePortability,
  returns: v.object({
    documents: v.array(
      v.object({
        document: jsonObjectValidator,
        documentSha256: v.string(),
      }),
    ),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const run = await requireOwnedExport(ctx, args.runId)
    if (run.state !== 'ready' && run.state !== 'complete') {
      throw new Error('Portable export roster is not sealed.')
    }
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > CAPTURE_PAGE_SIZE) {
      throw new Error(`Portable export document pages contain 1-${CAPTURE_PAGE_SIZE} rows.`)
    }
    const after = parseRosterCursor(args.cursor)
    const ordered = ctx.db
      .query('portableExportRoster')
      .withIndex('by_run_index', (query) => query.eq('runId', run.runId))
    const fetched = await (after === null
      ? ordered.take(args.limit + 1)
      : ordered.filter((query) => query.gt(query.field('index'), after)).take(args.limit + 1))
    const rows = fetched.slice(0, args.limit)
    const documents = []
    for (const row of rows) {
      const document = row.document
      if ((await hashCanonicalJson(document as unknown as JsonMap)) !== row.documentSha256) {
        throw new Error('Portable export document no longer matches its sealed roster hash.')
      }
      documents.push({
        document,
        documentSha256: row.documentSha256,
      })
    }
    return {
      documents,
      cursor:
        fetched.length > args.limit && rows.length > 0
          ? String(rows[rows.length - 1]!.index)
          : null,
    }
  },
})

export const readExportAssets = callerQuery.protected({
  id: 'portability:readExportAssets',
  args: readExportAssetsArgs.args,
  guard: canManagePortability,
  returns: v.object({
    assets: v.array(
      v.object({
        holdId: v.string(),
        sha256: v.string(),
        bytes: v.number(),
        mediaType: v.string(),
        originalFilename: v.string(),
      }),
    ),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const run = await requireOwnedExport(ctx, args.runId)
    if (run.state !== 'ready' && run.state !== 'complete') {
      throw new Error('Portable export asset roster is not sealed.')
    }
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > CAPTURE_PAGE_SIZE) {
      throw new Error(`Portable export asset pages contain 1-${CAPTURE_PAGE_SIZE} rows.`)
    }
    if (args.cursor !== null) assertSha256(args.cursor, 'asset cursor')
    const ordered = ctx.db
      .query('portableExportAssets')
      .withIndex('by_run_sha256', (query) => query.eq('runId', run.runId))
    const fetched = await (args.cursor === null
      ? ordered.take(args.limit + 1)
      : ordered
          .filter((query) => query.gt(query.field('sha256'), args.cursor!))
          .take(args.limit + 1))
    const rows = fetched.slice(0, args.limit)
    return {
      assets: rows.map((row) => ({
        holdId: row.holdId,
        sha256: row.sha256,
        bytes: row.bytes,
        mediaType: row.mediaType,
        originalFilename: row.originalFilename,
      })),
      cursor: fetched.length > args.limit && rows.length > 0 ? rows[rows.length - 1]!.sha256 : null,
    }
  },
})

export const beginPortableAssetDownload = callerMutation.protected({
  id: 'portability:beginPortableAssetDownload',
  args: beginPortableAssetDownloadArgs.args,
  guard: canManagePortability,
  returns: v.object({
    state: v.literal('attempt'),
    downloadGeneration: v.number(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await requireOwnedExport(ctx, args.runId)
    assertSha256(args.downloadTokenHash, 'downloadTokenHash')
    if (run.state !== 'ready' || run.expiresAt <= Date.now()) {
      throw new Error('Portable export is not ready for asset download.')
    }
    const hold = await ctx.db
      .query('portableExportAssets')
      .withIndex('by_hold_id', (query) => query.eq('holdId', args.holdId))
      .unique()
    if (!hold || hold.runId !== run.runId || hold.expiresAt <= Date.now()) {
      throw new Error('Portable export asset hold is unavailable.')
    }
    const now = Date.now()
    const downloadGeneration = hold.downloadGeneration + 1
    const expiresAt = now + DOWNLOAD_CAPABILITY_MS
    await ctx.db.patch(hold._id, {
      downloadTokenHash: args.downloadTokenHash,
      downloadGeneration,
      downloadAttempts: 0,
      downloadExpiresAt: expiresAt,
    })
    return { state: 'attempt', downloadGeneration, expiresAt }
  },
})

export const claimPortableAssetDownload = callerMutation.protected({
  id: 'portability:claimPortableAssetDownload',
  args: claimPortableAssetDownloadArgs.args,
  guard: canManagePortability,
  returns: v.object({
    storageUrl: v.string(),
    sha256: v.string(),
    bytes: v.number(),
    mediaType: v.string(),
    attempt: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await requireOwnedExport(ctx, args.runId)
    assertSha256(args.downloadTokenHash, 'downloadTokenHash')
    if (run.state !== 'ready' || run.expiresAt <= Date.now()) {
      throw new Error('Portable export is not ready for asset download.')
    }
    const hold = await ctx.db
      .query('portableExportAssets')
      .withIndex('by_hold_id', (query) => query.eq('holdId', args.holdId))
      .unique()
    if (
      !hold ||
      hold.runId !== run.runId ||
      hold.downloadTokenHash !== args.downloadTokenHash ||
      hold.downloadGeneration !== args.downloadGeneration ||
      hold.downloadExpiresAt === null ||
      hold.downloadExpiresAt <= Date.now()
    ) {
      throw new Error('Portable export asset download capability is invalid or expired.')
    }
    if (hold.downloadAttempts >= 3) {
      throw new Error('Portable export asset download attempts are exhausted.')
    }
    const storageUrl = await ctx.storage.getUrl(hold.storageId)
    if (!storageUrl) throw new Error('Portable export asset storage object is unavailable.')
    const attempt = hold.downloadAttempts + 1
    await ctx.db.patch(hold._id, { downloadAttempts: attempt })
    return {
      storageUrl,
      sha256: hold.sha256,
      bytes: hold.bytes,
      mediaType: hold.mediaType,
      attempt,
    }
  },
})

function parseRosterCursor(value: string | null) {
  if (value === null) return null
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new Error('Portable export cursor is invalid.')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error('Portable export cursor is invalid.')
  return parsed
}

export const completeExportRun = callerMutation.protected({
  id: 'portability:completeExportRun',
  args: completeExportRunArgs.args,
  guard: canManagePortability,
  returns: v.object({
    state: v.literal('complete'),
    manifestSha256: v.string(),
    documentCount: v.number(),
    assetCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await requireOwnedExport(ctx, args.runId)
    assertSha256(args.manifestSha256, 'manifestSha256')
    const existing = await ctx.db
      .query('portableExportReceipts')
      .withIndex('by_run', (query) => query.eq('runId', run.runId))
      .unique()
    if (existing) {
      if (
        existing.manifestSha256 !== args.manifestSha256 ||
        existing.documentCount !== args.documentCount ||
        existing.assetCount !== args.assetCount
      ) {
        throw new Error('Portable export completion conflicts with its existing receipt.')
      }
      return {
        state: 'complete',
        manifestSha256: args.manifestSha256,
        documentCount: args.documentCount,
        assetCount: args.assetCount,
      }
    }
    if (run.state !== 'ready') throw new Error('Portable export is not ready for completion.')
    if (args.documentCount !== run.documentCount || args.assetCount !== run.assetCount) {
      throw new Error('Portable export completion counts do not match the sealed roster.')
    }
    await ctx.db.insert('portableExportReceipts', {
      runId: run.runId,
      manifestSha256: args.manifestSha256,
      documentCount: args.documentCount,
      assetCount: args.assetCount,
      completedAt: Date.now(),
    })
    await ctx.db.patch(run._id, { state: 'complete', updatedAt: Date.now() })
    await ctx.scheduler.runAfter(0, cleanupExportRowsRef, { runId: run.runId })
    return {
      state: 'complete',
      manifestSha256: args.manifestSha256,
      documentCount: args.documentCount,
      assetCount: args.assetCount,
    }
  },
})

export const abortExportRun = callerMutation.protected({
  id: 'portability:abortExportRun',
  args: abortExportRunArgs.args,
  guard: canManagePortability,
  returns: v.object({ state: v.literal('aborted') }),
  handler: async (ctx, args) => {
    const run = await requireOwnedExport(ctx, args.runId)
    if (run.state === 'complete' || run.state === 'expired') {
      throw new Error(`Terminal portable export state ${run.state} cannot be aborted.`)
    }
    if (run.state !== 'aborted') {
      await ctx.db.patch(run._id, {
        state: 'aborted',
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: Date.now(),
      })
    }
    await ctx.scheduler.runAfter(0, cleanupExportRowsRef, { runId: run.runId })
    return { state: 'aborted' }
  },
})

export const expireExportRun = callerMutation.protected({
  id: 'portability:expireExportRun',
  args: expireExportRunArgs.args,
  guard: canManagePortability,
  returns: v.object({ state: v.literal('expired') }),
  handler: async (ctx, args) => {
    const run = await requireOwnedExport(ctx, args.runId)
    if (run.state === 'complete' || run.state === 'aborted') {
      throw new Error(`Terminal portable export state ${run.state} cannot expire.`)
    }
    if (run.expiresAt > Date.now()) throw new Error('Portable export has not reached its deadline.')
    if (run.state !== 'expired') {
      await ctx.db.patch(run._id, {
        state: 'expired',
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: Date.now(),
      })
    }
    await ctx.scheduler.runAfter(0, cleanupExportRowsRef, { runId: run.runId })
    return { state: 'expired' }
  },
})

export const expireExportLeaseInternal = internalMutation({
  args: {
    runId: v.string(),
    leaseGeneration: v.number(),
    leaseExpiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('portableRuns')
      .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
      .unique()
    if (
      row?.mode !== 'export' ||
      row.state !== 'capturing' ||
      row.leaseGeneration !== args.leaseGeneration ||
      row.leaseExpiresAt !== args.leaseExpiresAt ||
      row.leaseExpiresAt > Date.now()
    ) {
      return null
    }
    await ctx.db.patch(row._id, {
      state: 'expired',
      leaseTokenHash: null,
      leaseExpiresAt: null,
      updatedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, cleanupExportRowsRef, { runId: row.runId })
    return null
  },
})

export const expireExportRunInternal = internalMutation({
  args: { runId: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('portableRuns')
      .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
      .unique()
    if (
      row?.mode !== 'export' ||
      row.expiresAt !== args.expiresAt ||
      row.expiresAt > Date.now() ||
      row.state === 'complete' ||
      row.state === 'aborted' ||
      row.state === 'expired'
    ) {
      return null
    }
    await ctx.db.patch(row._id, {
      state: 'expired',
      leaseTokenHash: null,
      leaseExpiresAt: null,
      updatedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, cleanupExportRowsRef, { runId: row.runId })
    return null
  },
})

export const cleanupExportRows = internalMutation({
  args: { runId: v.string() },
  returns: v.object({ deleted: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query('portableRuns')
      .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
      .unique()
    if (
      run?.mode !== 'export' ||
      (run.state !== 'complete' && run.state !== 'aborted' && run.state !== 'expired')
    ) {
      return { deleted: 0, complete: true }
    }
    const roster = await ctx.db
      .query('portableExportRoster')
      .withIndex('by_run_index', (query) => query.eq('runId', run.runId))
      .take(CLEANUP_PAGE_SIZE)
    for (const row of roster) await ctx.db.delete(row._id)
    const remaining = CLEANUP_PAGE_SIZE - roster.length
    const assets =
      remaining > 0
        ? await ctx.db
            .query('portableExportAssets')
            .withIndex('by_run', (query) => query.eq('runId', run.runId))
            .take(remaining)
        : []
    for (const row of assets) await ctx.db.delete(row._id)
    const deleted = roster.length + assets.length
    const complete = deleted < CLEANUP_PAGE_SIZE
    if (!complete) await ctx.scheduler.runAfter(0, cleanupExportRowsRef, { runId: run.runId })
    return { deleted, complete }
  },
})
