import { makeFunctionReference, paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel.js'
import type { ActionCtx } from '../_generated/server.js'
import { canManageAssetRecovery } from '../auth/checks.js'
import type { MutationCtx, QueryCtx } from '../lib/types.js'
import {
  blockedPreview,
  buildPreview,
  defineCmsOperation,
  operationEffect,
  operationIssue,
  previewResultValidator,
} from '../operationHelpers.js'
import { isStorageClaimedByAnotherOwner } from './storageOwnership.js'

const MAX_ASSET_CLEANUP_ATTEMPTS = 5

const cleanupAssetStorageRef = makeFunctionReference<
  'action',
  {
    taskId: Id<'assetCleanupTasks'>
    storageId: Id<'_storage'>
    generation: number
    attempt: number
  },
  null
>('assets:cleanupAssetStorage')
const canDeleteAssetCleanupStorageRef = makeFunctionReference<
  'query',
  {
    taskId: Id<'assetCleanupTasks'>
    storageId: Id<'_storage'>
    generation: number
    attempt: number
  },
  boolean
>('assets:canDeleteAssetCleanupStorage')
const finishAssetStorageCleanupRef = makeFunctionReference<
  'mutation',
  { taskId: Id<'assetCleanupTasks'>; generation: number; attempt: number },
  null
>('assets:finishAssetStorageCleanup')
const failAssetStorageCleanupRef = makeFunctionReference<
  'mutation',
  { taskId: Id<'assetCleanupTasks'>; generation: number; attempt: number; error: string },
  'retrying' | 'terminal-failure' | 'stale'
>('assets:failAssetStorageCleanup')

function safeCleanupError(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/\b(Bearer\s+)[\w.~+/=-]{8,}/giu, '$1[redacted]')
    .replace(/\b(?:mcp|cms|ba)_[\w.~+/=-]{6,}\b/giu, '[redacted]')
    .replace(/\b(password|secret|token)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]')
    .slice(0, 2_000)
}

export const terminalAssetCleanupPageValidator = v.object({
  page: v.array(
    v.object({
      taskId: v.string(),
      storageId: v.string(),
      uploadSessionId: v.union(v.string(), v.null()),
      generation: v.number(),
      attempts: v.number(),
      lastError: v.union(v.string(), v.null()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export const terminalAssetCleanupArgs = {
  paginationOpts: v.optional(paginationOptsValidator),
}

type TerminalCleanupCursor = {
  updatedAt: number
  storageId: string
}

function parseTerminalCleanupCursor(cursor: string | null): TerminalCleanupCursor | null {
  if (cursor === null) return null
  try {
    const parsed: unknown = JSON.parse(cursor)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('updatedAt' in parsed) ||
      !Number.isSafeInteger(parsed.updatedAt) ||
      !('storageId' in parsed) ||
      typeof parsed.storageId !== 'string' ||
      parsed.storageId.length === 0
    ) {
      throw new Error('invalid cursor shape')
    }
    return { updatedAt: parsed.updatedAt as number, storageId: parsed.storageId }
  } catch {
    throw new Error('Asset cleanup inventory cursor is invalid. Restart from the first page.')
  }
}

function terminalCleanupCursor(row: { updatedAt: number; storageId: Id<'_storage'> }): string {
  return JSON.stringify({ updatedAt: row.updatedAt, storageId: String(row.storageId) })
}

export async function listTerminalAssetCleanupTasksHandler(
  ctx: QueryCtx,
  args: { paginationOpts?: { cursor: string | null; numItems: number } },
) {
  const paginationOpts = args.paginationOpts ?? { cursor: null, numItems: 50 }
  if (
    !Number.isSafeInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > 100
  ) {
    throw new Error('Asset cleanup inventory page size must be from 1 through 100.')
  }
  const cursor = parseTerminalCleanupCursor(paginationOpts.cursor)
  const requested = paginationOpts.numItems
  const rows = cursor
    ? await ctx.db
        .query('assetCleanupTasks')
        .withIndex('by_status_updatedAt_storage', (query) =>
          query.eq('status', 'terminal-failure').gte('updatedAt', cursor.updatedAt),
        )
        .order('asc')
        .filter((query) =>
          query.or(
            query.gt(query.field('updatedAt'), cursor.updatedAt),
            query.and(
              query.eq(query.field('updatedAt'), cursor.updatedAt),
              query.gt(query.field('storageId'), cursor.storageId),
            ),
          ),
        )
        .take(requested + 1)
    : await ctx.db
        .query('assetCleanupTasks')
        .withIndex('by_status_updatedAt_storage', (query) => query.eq('status', 'terminal-failure'))
        .order('asc')
        .take(requested + 1)
  const page = rows.slice(0, requested)
  const isDone = rows.length <= requested
  return {
    page: page.map((task) => ({
      taskId: String(task._id),
      storageId: String(task.storageId),
      uploadSessionId: task.uploadSessionId ? String(task.uploadSessionId) : null,
      generation: task.generation,
      attempts: task.attempts,
      lastError: task.lastError,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    })),
    isDone,
    continueCursor: page.length > 0 ? terminalCleanupCursor(page[page.length - 1]!) : '',
  }
}

export const retryAssetCleanupResultValidator = v.object({
  taskId: v.string(),
  generation: v.number(),
})

export const retryAssetCleanupOperation = defineCmsOperation({
  id: 'ginko-cms.retry-asset-cleanup',
  kind: 'destructive',
  executeFunctionRef: 'assets:retryAssetCleanupOperationExecute',
  args: {
    taskId: v.string(),
    expectedGeneration: v.number(),
  },
  guard: canManageAssetRecovery,
  returns: retryAssetCleanupResultValidator,
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const taskId = ctx.db.normalizeId('assetCleanupTasks', args.taskId)
    return { task: taskId ? await ctx.db.get(taskId) : null }
  },
  preview: async (_ctx, args, { task }) => {
    if (!task) {
      return blockedPreview({
        summary: 'Asset cleanup task not found.',
        blockers: [
          operationIssue({
            code: 'asset-cleanup-task-not-found',
            message: 'The terminal asset cleanup task no longer exists.',
          }),
        ],
        confirm: { operationId: 'ginko-cms.retry-asset-cleanup', args },
      })
    }
    if (task.generation !== args.expectedGeneration) {
      return blockedPreview({
        summary: 'Asset cleanup task changed.',
        blockers: [
          operationIssue({
            code: 'asset-cleanup-generation-stale',
            message: 'Refresh terminal cleanup inventory before retrying this task.',
          }),
        ],
        details: { taskId: args.taskId, generation: task.generation },
        confirm: { operationId: 'ginko-cms.retry-asset-cleanup', args },
        version: { generation: task.generation, status: task.status, updatedAt: task.updatedAt },
      })
    }
    if (task.status !== 'terminal-failure') {
      return blockedPreview({
        summary: 'Asset cleanup task is not terminal.',
        blockers: [
          operationIssue({
            code: 'asset-cleanup-not-terminal',
            message: 'Only terminal cleanup failures can be resumed manually.',
          }),
        ],
        details: { taskId: args.taskId, status: task.status },
        confirm: { operationId: 'ginko-cms.retry-asset-cleanup', args },
        version: { generation: task.generation, status: task.status, updatedAt: task.updatedAt },
      })
    }
    return buildPreview({
      summary: 'Will resume one terminal asset-storage cleanup.',
      warnings: [
        operationIssue({
          code: 'asset-cleanup-byte-delete',
          message: 'The worker will delete the unclaimed storage bytes when ownership is clear.',
        }),
      ],
      effects: [
        operationEffect({ kind: 'assets', summary: 'Terminal cleanup tasks resumed', count: 1 }),
      ],
      details: {
        taskId: args.taskId,
        generation: task.generation,
        attempts: task.attempts,
        lastError: task.lastError,
      },
      confirm: {
        operationId: 'ginko-cms.retry-asset-cleanup',
        args,
        effect: { taskId: args.taskId, generation: task.generation },
      },
      version: { generation: task.generation, status: task.status, updatedAt: task.updatedAt },
    })
  },
  handler: async (ctx, _args, { task }) => {
    if (!task) throw new Error('Asset cleanup task disappeared before retry.')
    const generation = task.generation + 1
    const now = Date.now()
    await ctx.db.patch(task._id, {
      status: 'cleanup-required',
      generation,
      attempts: 0,
      lastError: null,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, cleanupAssetStorageRef, {
      taskId: task._id,
      storageId: task.storageId,
      generation,
      attempt: 1,
    })
    return { taskId: String(task._id), generation }
  },
})

export async function canDeleteAssetCleanupStorageHandler(
  ctx: QueryCtx,
  args: {
    taskId: Id<'assetCleanupTasks'>
    storageId: Id<'_storage'>
    generation: number
    attempt: number
  },
) {
  const task = await ctx.db.get(args.taskId)
  if (
    !task ||
    task.storageId !== args.storageId ||
    task.status !== 'cleanup-required' ||
    task.generation !== args.generation ||
    task.attempts + 1 !== args.attempt
  ) {
    return false
  }
  return !(await isStorageClaimedByAnotherOwner(ctx, args.storageId, {
    uploadSessionId: task.uploadSessionId,
    cleanupTaskId: task._id,
  }))
}

export async function finishAssetStorageCleanupHandler(
  ctx: MutationCtx,
  args: { taskId: Id<'assetCleanupTasks'>; generation: number; attempt: number },
) {
  const task = await ctx.db.get(args.taskId)
  if (
    !task ||
    task.status !== 'cleanup-required' ||
    task.generation !== args.generation ||
    task.attempts + 1 !== args.attempt
  ) {
    return null
  }
  if (task.uploadSessionId && (await ctx.db.get(task.uploadSessionId))) {
    await ctx.db.delete(task.uploadSessionId)
  }
  await ctx.db.delete(task._id)
  return null
}

export async function failAssetStorageCleanupHandler(
  ctx: MutationCtx,
  args: {
    taskId: Id<'assetCleanupTasks'>
    generation: number
    attempt: number
    error: string
  },
) {
  const task = await ctx.db.get(args.taskId)
  if (
    !task ||
    task.status !== 'cleanup-required' ||
    task.generation !== args.generation ||
    task.attempts + 1 !== args.attempt
  ) {
    return 'stale' as const
  }
  const terminal = args.attempt >= MAX_ASSET_CLEANUP_ATTEMPTS
  await ctx.db.patch(task._id, {
    attempts: args.attempt,
    status: terminal ? 'terminal-failure' : 'cleanup-required',
    lastError: safeCleanupError(args.error),
    updatedAt: Date.now(),
  })
  return terminal ? ('terminal-failure' as const) : ('retrying' as const)
}

export async function cleanupAssetStorageHandler(
  ctx: ActionCtx,
  args: {
    taskId: Id<'assetCleanupTasks'>
    storageId: Id<'_storage'>
    generation: number
    attempt: number
  },
) {
  try {
    const canDelete = await ctx.runQuery(canDeleteAssetCleanupStorageRef, args)
    if (canDelete) await ctx.storage.delete(args.storageId)
    await ctx.runMutation(finishAssetStorageCleanupRef, {
      taskId: args.taskId,
      generation: args.generation,
      attempt: args.attempt,
    })
  } catch (error) {
    const result = await ctx.runMutation(failAssetStorageCleanupRef, {
      taskId: args.taskId,
      generation: args.generation,
      attempt: args.attempt,
      error: safeCleanupError(error),
    })
    if (result === 'retrying') {
      await ctx.scheduler.runAfter(1_000 * 2 ** (args.attempt - 1), cleanupAssetStorageRef, {
        ...args,
        attempt: args.attempt + 1,
      })
    }
  }
  return null
}
