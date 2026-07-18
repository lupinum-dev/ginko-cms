import {
  beginPortableAssetDownload as beginPortableAssetDownloadArgs,
  captureExportPage as captureExportPageArgs,
  claimPortableAssetDownload as claimPortableAssetDownloadArgs,
  createExportRun as createExportRunArgs,
  readExportAssets as readExportAssetsArgs,
  readExportDocuments as readExportDocumentsArgs,
  sealExportRun as sealExportRunArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  type ResolvedContentContractV1,
} from '@lupinum/ginko-content/cms-contract'
import {
  collectPortableAssetReferences,
  collectPortableMdcAssetReferences,
  hashCanonicalJson,
  type PortableAssetReferenceV1,
  type PortableDocumentV1,
} from '@lupinum/ginko-content/portability'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation } from '../_generated/server.js'
import { canManagePortability } from '../auth/checks.js'
import { callerMutation, callerQuery } from '../functions.js'
import { getCollection } from '../lib/collections.js'
import {
  assertCmsContractWriteToken,
  cmsContractWriteTokenValidator,
} from '../lib/installedContract.js'
import type { MutationCtx } from '../lib/types.js'
import {
  defineAbortExportRun,
  defineCompleteExportRun,
  defineEnsureExportCleanupWork,
  defineExpireExportCleanupLease,
  defineExpireExportLeaseInternal,
  defineExpireExportRun,
  defineExpireExportRunInternal,
  defineProcessExportCleanupPage,
  defineRecordExportCleanupFailure,
  defineRunExportCleanupPage,
} from './exportCleanup.js'
import { requireExportRun as exportRun, requireOwnedExport, type ExportRun } from './exportModel.js'
import {
  assertCurrentExportPreflight,
  type CreateExportRunResult,
  createExportRunResultValidator,
  EXPORT_PAGE_SIZE,
  readPublishedExportPage,
} from './exportPreflight.js'
import { portablePublishedDocument } from './items.js'
import {
  assertSha256,
  PORTABLE_ASSET_LIMIT,
  PORTABLE_DOCUMENT_LIMIT,
  PORTABLE_ROW_BYTE_LIMIT,
  PORTABLE_RUN_TTL_MS,
} from './model.js'
import { encodePortableDocument } from './portableJson.js'

const EXPORT_LEASE_MS = 60_000

const DOWNLOAD_CAPABILITY_MS = 60_000

const MAX_ACTIVE_EXPORTS = 100

const expireExportRunInternalRef = makeFunctionReference<
  'mutation',
  { runId: string; expiresAt: number },
  null
>('portability/exports:expireExportRunInternal')

const expireExportLeaseInternalRef = makeFunctionReference<
  'mutation',
  { runId: string; leaseGeneration: number; leaseExpiresAt: number },
  null
>('portability/exports:expireExportLeaseInternal')

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

export const createExportRunInternal = internalMutation({
  args: {
    ...createExportRunArgs.args,
    callerId: v.string(),
    preflightToken: v.string(),
    contractWriteToken: cmsContractWriteTokenValidator,
  },
  returns: createExportRunResultValidator,
  handler: async (ctx, args): Promise<CreateExportRunResult> => {
    await assertCmsContractWriteToken(ctx, args.contractWriteToken)
    assertSha256(args.leaseTokenHash, 'leaseTokenHash')
    if (!args.runId || !args.deploymentId) {
      throw new Error('Portable export scope is invalid.')
    }
    const { installed, preflight } = await assertCurrentExportPreflight(
      ctx,
      args,
      args.preflightToken,
    )
    const payload = {
      format: 'ginko-cms-portability-export',
      version: 1,
      deploymentId: args.deploymentId,
      scope: args.scope,
      sourceContentHash: args.sourceContentHash,
      preflight: {
        documentCount: preflight.documentCount,
        assetSha256s: preflight.assetSha256s,
        generations: preflight.generations,
      },
    } as const
    const payloadSha256 = await hashCanonicalJson(payload)
    const existing = await ctx.db
      .query('portableRuns')
      .withIndex('by_run_id', (query) => query.eq('runId', args.runId))
      .unique()
    if (existing) {
      const run = exportRun(existing)
      if (
        run.callerId !== args.callerId ||
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
        preflight: {
          documentCount: preflight.documentCount,
          assetCount: preflight.assetSha256s.length,
        },
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
      callerId: args.callerId,
      deploymentId: args.deploymentId,
      scope: args.scope,
      sourceContentHash: args.sourceContentHash,
      sourceContract: installed.record.content as JsonMap,
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
      workPhase: null,
      workCursor: null,
      workGeneration: 0,
      workToken: null,
      workLeaseExpiresAt: null,
      workAttempts: 0,
      workNextAttemptAt: null,
      workLastError: null,
      workDeadLetteredAt: null,
      manifestSha256: null,
      completedAt: null,
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
      preflight: {
        documentCount: preflight.documentCount,
        assetCount: preflight.assetSha256s.length,
      },
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
    const collection = await getCollection(ctx, collectionSlug)
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
    const fetched = await readPublishedExportPage(
      ctx,
      { collection: collection.slug, locale },
      { orderKey: position.orderKey, entryId: position.entryId },
    )
    const page = fetched.slice(0, EXPORT_PAGE_SIZE)
    let documentCount = run.documentCount
    let assetCount = run.assetCount
    if (documentCount + page.length > PORTABLE_DOCUMENT_LIMIT) {
      throw new Error('Portable export exceeds the document limit.')
    }
    const prepared = await Promise.all(
      page.map(async (row) => {
        const entry = await ctx.db.get(row.entryId)
        if (!entry) throw new Error('Portable export entry disappeared during capture.')
        const canonicalKey = entry.stableId
        const document = await portablePublishedDocument(ctx, {
          revisionId: row.revisionId,
          collection: collectionSlug,
          canonicalKey,
          locale,
          contract,
        })
        const encodedDocument = await encodePortableDocument(document)
        const documentSha256 = encodedDocument.sha256
        if (encodedDocument.bytes.length > PORTABLE_ROW_BYTE_LIMIT) {
          throw new Error('Portable export document exceeds the 256 KiB roster row limit.')
        }
        return {
          row,
          canonicalKey,
          document,
          documentJson: encodedDocument.json,
          documentSha256,
        }
      }),
    )
    const duplicates = await Promise.all(
      prepared.map(
        async ({ canonicalKey }) =>
          await ctx.db
            .query('portableItems')
            .withIndex('by_run_identity', (query) =>
              query
                .eq('runId', run.runId)
                .eq('collection', collectionSlug)
                .eq('canonicalKey', canonicalKey)
                .eq('locale', locale),
            )
            .unique(),
      ),
    )
    if (duplicates.some(Boolean)) {
      throw new Error('Portable export roster identity is duplicated.')
    }
    await Promise.all(
      prepared.map(
        async ({ row, canonicalKey, documentJson, documentSha256 }, index) =>
          await ctx.db.insert('portableItems', {
            mode: 'export',
            runId: run.runId,
            index: documentCount + index,
            itemKey: await hashCanonicalJson({
              collection: collectionSlug,
              canonicalKey,
              locale,
            }),
            inputSha256: documentSha256,
            payload: documentJson,
            collection: collectionSlug,
            canonicalKey,
            locale,
            revisionId: row.revisionId,
            document: documentJson,
            state: 'captured',
            effect: null,
            resultId: null,
            committedAt: null,
          }),
      ),
    )
    documentCount += prepared.length
    for (const { document } of prepared) {
      assetCount = await holdDocumentAssets(ctx, run, contract, document, assetCount)
    }
    const hasMore = fetched.length > EXPORT_PAGE_SIZE
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
      .query('portableAssets')
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
    const now = Date.now()
    await ctx.db.insert('portableAssets', {
      mode: 'export',
      holdId: await hashCanonicalJson({ runId: run.runId, sha256: asset.sha256 }),
      runId: run.runId,
      callerId: null,
      sha256: asset.sha256,
      inputSha256: null,
      payload: {},
      storageId: asset.storageId,
      byteLength: asset.size,
      mediaType: asset.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
      state: 'held',
      assetId: null,
      attemptTokenHash: null,
      attemptGeneration: 0,
      leaseExpiresAt: null,
      storageOrigin: null,
      originalFilename: asset.filename,
      expiresAt: run.expiresAt,
      downloadTokenHash: null,
      downloadGeneration: 0,
      downloadAttempts: 0,
      downloadExpiresAt: null,
      createdAt: now,
      updatedAt: now,
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
        .query('portableItems')
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
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > EXPORT_PAGE_SIZE) {
      throw new Error(`Portable export document pages contain 1-${EXPORT_PAGE_SIZE} rows.`)
    }
    const after = parseRosterCursor(args.cursor)
    const fetched = await ctx.db
      .query('portableItems')
      .withIndex('by_run_index', (query) =>
        after === null
          ? query.eq('runId', run.runId)
          : query.eq('runId', run.runId).gt('index', after),
      )
      .take(args.limit + 1)
    const rows = fetched.slice(0, args.limit)
    const documents = []
    for (const row of rows) {
      const document = row.document
      if ((await hashCanonicalJson(document)) !== row.inputSha256) {
        throw new Error('Portable export document no longer matches its sealed roster hash.')
      }
      documents.push({
        document,
        documentSha256: row.inputSha256,
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
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > EXPORT_PAGE_SIZE) {
      throw new Error(`Portable export asset pages contain 1-${EXPORT_PAGE_SIZE} rows.`)
    }
    if (args.cursor !== null) assertSha256(args.cursor, 'asset cursor')
    const fetched = await ctx.db
      .query('portableAssets')
      .withIndex('by_run_sha256', (query) =>
        args.cursor === null
          ? query.eq('runId', run.runId)
          : query.eq('runId', run.runId).gt('sha256', args.cursor),
      )
      .take(args.limit + 1)
    const rows = fetched.slice(0, args.limit)
    return {
      assets: rows.map((row) => ({
        holdId: row.holdId!,
        sha256: row.sha256,
        bytes: row.byteLength,
        mediaType: row.mediaType,
        originalFilename: row.originalFilename!,
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
      .query('portableAssets')
      .withIndex('by_hold_id', (query) => query.eq('holdId', args.holdId))
      .unique()
    if (
      !hold ||
      hold.mode !== 'export' ||
      hold.runId !== run.runId ||
      hold.expiresAt <= Date.now()
    ) {
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
      .query('portableAssets')
      .withIndex('by_hold_id', (query) => query.eq('holdId', args.holdId))
      .unique()
    if (
      !hold ||
      hold.mode !== 'export' ||
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
      bytes: hold.byteLength,
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

export const completeExportRun = defineCompleteExportRun()
export const abortExportRun = defineAbortExportRun()
export const expireExportRun = defineExpireExportRun()
export const expireExportLeaseInternal = defineExpireExportLeaseInternal()
export const expireExportRunInternal = defineExpireExportRunInternal()
export const ensureExportCleanupWork = defineEnsureExportCleanupWork()
export const processExportCleanupPage = defineProcessExportCleanupPage()
export const runExportCleanupPage = defineRunExportCleanupPage()
export const recordExportCleanupFailure = defineRecordExportCleanupFailure()
export const expireExportCleanupLease = defineExpireExportCleanupLease()
