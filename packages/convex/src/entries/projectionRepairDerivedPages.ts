import type { Doc } from '../_generated/dataModel.js'
import type { MutationCtx } from '../lib/types.js'
import {
  type PhaseWork,
  issueResult,
  mergeResult,
  parseProjectionScanCursor,
  projectionScanPage,
} from './projectionRepairPageSupport.js'
import type { ProjectionRecordResult } from './projections.js'
import {
  repairDraftSearchRow,
  repairPublicProjectionRow,
  repairPublicSearchRow,
  verifyDraftSearchRow,
  verifyPublicProjectionRow,
  verifyPublicSearchRow,
} from './projections.js'

async function readDraftSearchPage(ctx: MutationCtx, run: Doc<'projectionRepairRuns'>) {
  const cursor = parseProjectionScanCursor(run.cursor, 'draftSearchEntries')
  const afterId = cursor ? ctx.db.normalizeId('draftSearchEntries', cursor.id) : null
  if (cursor && !afterId) throw new Error('PROJECTION_REPAIR_SCAN_CURSOR_INVALID')
  const take = run.pageSize + 1
  const sameCreationTime =
    cursor && afterId
      ? await ctx.db
          .query('draftSearchEntries')
          .withIndex('by_creation_time', (query) => query.eq('_creationTime', cursor.creationTime))
          .filter((query) => query.gt(query.field('_id'), afterId))
          .take(take)
      : []
  const later =
    sameCreationTime.length < take
      ? await (cursor
          ? ctx.db
              .query('draftSearchEntries')
              .withIndex('by_creation_time', (query) =>
                query.gt('_creationTime', cursor.creationTime),
              )
              .take(take - sameCreationTime.length)
          : ctx.db
              .query('draftSearchEntries')
              .withIndex('by_creation_time')
              .take(take - sameCreationTime.length))
      : []
  return projectionScanPage([...sameCreationTime, ...later], run.pageSize, 'draftSearchEntries')
}

async function readPublicPage(ctx: MutationCtx, run: Doc<'projectionRepairRuns'>) {
  const cursor = parseProjectionScanCursor(run.cursor, 'publicEntries')
  const afterId = cursor ? ctx.db.normalizeId('publicEntries', cursor.id) : null
  if (cursor && !afterId) throw new Error('PROJECTION_REPAIR_SCAN_CURSOR_INVALID')
  const take = run.pageSize + 1
  const sameCreationTime =
    cursor && afterId
      ? await ctx.db
          .query('publicEntries')
          .withIndex('by_creation_time', (query) => query.eq('_creationTime', cursor.creationTime))
          .filter((query) => query.gt(query.field('_id'), afterId))
          .take(take)
      : []
  const later =
    sameCreationTime.length < take
      ? await (cursor
          ? ctx.db
              .query('publicEntries')
              .withIndex('by_creation_time', (query) =>
                query.gt('_creationTime', cursor.creationTime),
              )
              .take(take - sameCreationTime.length)
          : ctx.db
              .query('publicEntries')
              .withIndex('by_creation_time')
              .take(take - sameCreationTime.length))
      : []
  return projectionScanPage([...sameCreationTime, ...later], run.pageSize, 'publicEntries')
}

async function readPublicSearchPage(ctx: MutationCtx, run: Doc<'projectionRepairRuns'>) {
  const cursor = parseProjectionScanCursor(run.cursor, 'publicSearchEntries')
  const afterId = cursor ? ctx.db.normalizeId('publicSearchEntries', cursor.id) : null
  if (cursor && !afterId) throw new Error('PROJECTION_REPAIR_SCAN_CURSOR_INVALID')
  const take = run.pageSize + 1
  const sameCreationTime =
    cursor && afterId
      ? await ctx.db
          .query('publicSearchEntries')
          .withIndex('by_creation_time', (query) => query.eq('_creationTime', cursor.creationTime))
          .filter((query) => query.gt(query.field('_id'), afterId))
          .take(take)
      : []
  const later =
    sameCreationTime.length < take
      ? await (cursor
          ? ctx.db
              .query('publicSearchEntries')
              .withIndex('by_creation_time', (query) =>
                query.gt('_creationTime', cursor.creationTime),
              )
              .take(take - sameCreationTime.length)
          : ctx.db
              .query('publicSearchEntries')
              .withIndex('by_creation_time')
              .take(take - sameCreationTime.length))
      : []
  return projectionScanPage([...sameCreationTime, ...later], run.pageSize, 'publicSearchEntries')
}

export async function processDerivedProjectionRepairPage(
  ctx: MutationCtx,
  run: Doc<'projectionRepairRuns'>,
  result: ProjectionRecordResult,
): Promise<PhaseWork | null> {
  if (run.phase === 'draftSearchRows' || run.phase === 'verifyDraftSearchRows') {
    const page = await readDraftSearchPage(ctx, run)
    for (const row of page.page) {
      if (run.phase === 'draftSearchRows') mergeResult(result, await repairDraftSearchRow(ctx, row))
      else mergeResult(result, issueResult(await verifyDraftSearchRow(ctx, row)))
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      result,
    }
  }

  if (run.phase === 'publicRows' || run.phase === 'verifyPublicRows') {
    const page = await readPublicPage(ctx, run)
    for (const row of page.page) {
      if (run.phase === 'publicRows') mergeResult(result, await repairPublicProjectionRow(ctx, row))
      else mergeResult(result, issueResult(await verifyPublicProjectionRow(ctx, row)))
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      result,
    }
  }

  if (run.phase === 'publicSearchRows' || run.phase === 'verifyPublicSearchRows') {
    const page = await readPublicSearchPage(ctx, run)
    for (const row of page.page) {
      if (run.phase === 'publicSearchRows') {
        mergeResult(result, await repairPublicSearchRow(ctx, row))
      } else {
        mergeResult(result, issueResult(await verifyPublicSearchRow(ctx, row)))
      }
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      result,
    }
  }
  return null
}
