import type { Doc } from '../_generated/dataModel.js'
import { getCollection } from '../lib/collections.js'
import type { MutationCtx } from '../lib/types.js'
import {
  type PhaseWork,
  issueResult,
  mergeResult,
  parseProjectionScanCursor,
  projectionScanPage,
} from './projectionRepairPageSupport.js'
import {
  canonicalLocaleDraftAssetIds,
  canonicalRevisionAssetIds,
  canonicalSharedDraftAssetIds,
  type ProjectionRecordResult,
  repairAssetRefSourceForRow,
  repairDerivedRowsForEntry,
  repairDraftAssetRefsForRow,
  repairRevisionAssetRefsForRow,
  verifyAssetRefSourceForRow,
  verifyDerivedRowsForEntry,
  verifyDraftAssetRefsForRow,
  verifyRevisionAssetRefsForRow,
} from './projections.js'

async function existingCanonicalAssetIds(ctx: MutationCtx, assetIds: string[]): Promise<string[]> {
  const existing: string[] = []
  for (const assetId of [...new Set(assetIds)]) {
    const normalizedId = ctx.db.normalizeId('assets', assetId)
    if (normalizedId && (await ctx.db.get(normalizedId))) existing.push(assetId)
  }
  return existing
}

const ASSET_REF_SOURCE_KINDS = ['draft', 'revision', 'public'] as const
type AssetRefSourceCursor = {
  kind: (typeof ASSET_REF_SOURCE_KINDS)[number]
  sourceId: string
}

function parseAssetRefSourceCursor(cursor: string | null): AssetRefSourceCursor | null {
  if (!cursor) return null
  try {
    const parsed = JSON.parse(cursor) as Partial<AssetRefSourceCursor>
    if (
      !ASSET_REF_SOURCE_KINDS.includes(parsed.kind as (typeof ASSET_REF_SOURCE_KINDS)[number]) ||
      typeof parsed.sourceId !== 'string'
    ) {
      throw new Error('invalid cursor')
    }
    return parsed as AssetRefSourceCursor
  } catch {
    throw new Error('PROJECTION_REPAIR_ASSET_REF_CURSOR_INVALID')
  }
}

async function nextAssetRefSourceRow(
  ctx: MutationCtx,
  cursor: AssetRefSourceCursor | null,
): Promise<Doc<'contentAssetRefs'> | null> {
  const start = cursor ? ASSET_REF_SOURCE_KINDS.indexOf(cursor.kind) : 0
  for (let index = start; index < ASSET_REF_SOURCE_KINDS.length; index += 1) {
    const kind = ASSET_REF_SOURCE_KINDS[index]!
    const row = await ctx.db
      .query('contentAssetRefs')
      .withIndex('by_source', (query) =>
        cursor && cursor.kind === kind
          ? query.eq('sourceKind', kind).gt('sourceId', cursor.sourceId)
          : query.eq('sourceKind', kind),
      )
      .first()
    if (row) return row
  }
  return null
}

async function processAssetRefSourcePage(
  ctx: MutationCtx,
  run: Doc<'projectionRepairRuns'>,
  result: ProjectionRecordResult,
): Promise<PhaseWork> {
  let cursor = parseAssetRefSourceCursor(run.cursor)
  let processed = 0
  while (processed < run.pageSize) {
    const row = await nextAssetRefSourceRow(ctx, cursor)
    if (!row) break
    if (run.phase === 'assetRefs') mergeResult(result, await repairAssetRefSourceForRow(ctx, row))
    else mergeResult(result, issueResult(await verifyAssetRefSourceForRow(ctx, row)))
    cursor = { kind: row.sourceKind, sourceId: row.sourceId }
    processed += 1
  }
  const next = await nextAssetRefSourceRow(ctx, cursor)
  return {
    continueCursor: cursor ? JSON.stringify(cursor) : '',
    isDone: next === null,
    processed,
    result,
  }
}

export async function processCanonicalProjectionRepairPage(
  ctx: MutationCtx,
  run: Doc<'projectionRepairRuns'>,
  result: ProjectionRecordResult,
): Promise<PhaseWork | null> {
  if (run.phase === 'entries' || run.phase === 'verifyEntries') {
    const cursor = parseProjectionScanCursor(run.cursor, 'entries')
    const afterId = cursor ? ctx.db.normalizeId('entries', cursor.id) : null
    if (cursor && !afterId) throw new Error('PROJECTION_REPAIR_SCAN_CURSOR_INVALID')
    const take = run.pageSize + 1
    const sameCreationTime =
      cursor && afterId
        ? await ctx.db
            .query('entries')
            .withIndex('by_creation_time', (query) =>
              query.eq('_creationTime', cursor.creationTime),
            )
            .filter((query) => query.gt(query.field('_id'), afterId))
            .take(take)
        : []
    const later =
      sameCreationTime.length < take
        ? await (cursor
            ? ctx.db
                .query('entries')
                .withIndex('by_creation_time', (query) =>
                  query.gt('_creationTime', cursor.creationTime),
                )
                .take(take - sameCreationTime.length)
            : ctx.db
                .query('entries')
                .withIndex('by_creation_time')
                .take(take - sameCreationTime.length))
        : []
    const page = projectionScanPage([...sameCreationTime, ...later], run.pageSize, 'entries')
    for (const entry of page.page) {
      const collection = await getCollection(ctx, entry.collection)
      if (run.phase === 'entries') {
        mergeResult(result, await repairDerivedRowsForEntry(ctx, entry, collection))
      } else {
        mergeResult(result, issueResult(await verifyDerivedRowsForEntry(ctx, entry, collection)))
      }
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      result,
      ...(run.phase === 'verifyEntries'
        ? {
            referencedAssetIds: await existingCanonicalAssetIds(
              ctx,
              page.page.flatMap(canonicalSharedDraftAssetIds),
            ),
          }
        : {}),
    }
  }

  if (run.phase === 'drafts' || run.phase === 'verifyDrafts') {
    const cursor = parseProjectionScanCursor(run.cursor, 'entryLocaleDrafts')
    const afterId = cursor ? ctx.db.normalizeId('entryLocaleDrafts', cursor.id) : null
    if (cursor && !afterId) throw new Error('PROJECTION_REPAIR_SCAN_CURSOR_INVALID')
    const take = run.pageSize + 1
    const sameCreationTime =
      cursor && afterId
        ? await ctx.db
            .query('entryLocaleDrafts')
            .withIndex('by_creation_time', (query) =>
              query.eq('_creationTime', cursor.creationTime),
            )
            .filter((query) => query.gt(query.field('_id'), afterId))
            .take(take)
        : []
    const later =
      sameCreationTime.length < take
        ? await (cursor
            ? ctx.db
                .query('entryLocaleDrafts')
                .withIndex('by_creation_time', (query) =>
                  query.gt('_creationTime', cursor.creationTime),
                )
                .take(take - sameCreationTime.length)
            : ctx.db
                .query('entryLocaleDrafts')
                .withIndex('by_creation_time')
                .take(take - sameCreationTime.length))
        : []
    const page = projectionScanPage(
      [...sameCreationTime, ...later],
      run.pageSize,
      'entryLocaleDrafts',
    )
    for (const row of page.page) {
      if (run.phase === 'drafts') mergeResult(result, await repairDraftAssetRefsForRow(ctx, row))
      else mergeResult(result, issueResult(await verifyDraftAssetRefsForRow(ctx, row)))
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      result,
      ...(run.phase === 'verifyDrafts'
        ? {
            referencedAssetIds: await existingCanonicalAssetIds(
              ctx,
              page.page.flatMap(canonicalLocaleDraftAssetIds),
            ),
          }
        : {}),
    }
  }

  if (run.phase === 'revisions' || run.phase === 'verifyRevisions') {
    const cursor = parseProjectionScanCursor(run.cursor, 'entryRevisions')
    const afterId = cursor ? ctx.db.normalizeId('entryRevisions', cursor.id) : null
    if (cursor && !afterId) throw new Error('PROJECTION_REPAIR_SCAN_CURSOR_INVALID')
    const take = run.pageSize + 1
    const sameCreationTime =
      cursor && afterId
        ? await ctx.db
            .query('entryRevisions')
            .withIndex('by_creation_time', (query) =>
              query.eq('_creationTime', cursor.creationTime),
            )
            .filter((query) => query.gt(query.field('_id'), afterId))
            .take(take)
        : []
    const later =
      sameCreationTime.length < take
        ? await (cursor
            ? ctx.db
                .query('entryRevisions')
                .withIndex('by_creation_time', (query) =>
                  query.gt('_creationTime', cursor.creationTime),
                )
                .take(take - sameCreationTime.length)
            : ctx.db
                .query('entryRevisions')
                .withIndex('by_creation_time')
                .take(take - sameCreationTime.length))
        : []
    const page = projectionScanPage([...sameCreationTime, ...later], run.pageSize, 'entryRevisions')
    for (const row of page.page) {
      if (run.phase === 'revisions') {
        mergeResult(result, await repairRevisionAssetRefsForRow(ctx, row))
      } else {
        mergeResult(result, issueResult(await verifyRevisionAssetRefsForRow(ctx, row)))
      }
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      result,
      ...(run.phase === 'verifyRevisions'
        ? {
            referencedAssetIds: await existingCanonicalAssetIds(
              ctx,
              page.page.flatMap(canonicalRevisionAssetIds),
            ),
          }
        : {}),
    }
  }

  if (run.phase === 'assetRefs' || run.phase === 'verifyAssetRefs') {
    return await processAssetRefSourcePage(ctx, run, result)
  }
  return null
}
