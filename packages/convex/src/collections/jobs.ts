import { v } from 'convex/values'

import { internal } from '../_generated/api.js'
import type { Doc, Id } from '../_generated/dataModel.js'
import { internalAction, internalMutation, internalQuery } from '../_generated/server.js'
import { getCollectionOrThrow } from '../lib/collections.js'
import { asCollectionId, toStringId } from '../lib/ids.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { recomputeEntryDerivedState } from './sync.js'

const COLLECTION_REINDEX_BATCH_SIZE = 50
const internalJobsApi = internal

type CollectionJobPhase = 'draft' | 'published' | 'archived'
type CreatedAtCursor = {
  v: 1
  kind: 'entriesByCreatedAt'
  createdAt: number
  baseSlug: string
}

async function getCollectionReindexJob(ctx: QueryOrMutationCtx, collectionId: Id<'collections'>) {
  return await ctx.db
    .query('collectionReindexJobs')
    .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
    .first()
}

async function getCollectionReindexTarget(
  ctx: QueryOrMutationCtx,
  collectionId: Id<'collections'>,
): Promise<{ collection: Doc<'collections'>; job: Doc<'collectionReindexJobs'> } | null> {
  const job = await getCollectionReindexJob(ctx, collectionId)
  if (!job) return null

  const collection = await ctx.db.get(collectionId)
  return collection ? { collection, job } : null
}

async function scheduleReindexWorker(ctx: MutationCtx, collectionId: Id<'collections'>) {
  await ctx.scheduler.runAfter(0, internalJobsApi.collections.jobs.runCollectionReindexJob, {
    collectionId: toStringId(collectionId),
  })
}

export async function scheduleCollectionReindex(
  ctx: MutationCtx,
  collectionId: Id<'collections'>,
  appIdentityId: string,
) {
  const existing = await getCollectionReindexJob(ctx, collectionId)
  if (existing) return

  const now = Date.now()
  await ctx.db.insert('collectionReindexJobs', {
    collectionId,
    phase: 'draft',
    cursor: null,
    requestedBy: appIdentityId,
    requestedAt: now,
    updatedAt: now,
  })
  await scheduleReindexWorker(ctx, collectionId)
}

function nextReindexPhase(phase: CollectionJobPhase) {
  if (phase === 'draft') return 'published'
  if (phase === 'published') return 'archived'
  return null
}

function encodeCreatedAtCursor(entry: Pick<Doc<'entries'>, 'createdAt' | 'baseSlug'>) {
  return JSON.stringify({
    v: 1,
    kind: 'entriesByCreatedAt',
    createdAt: entry.createdAt,
    baseSlug: entry.baseSlug,
  } satisfies CreatedAtCursor)
}

function parseCreatedAtCursor(cursor: string | null) {
  if (!cursor) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(cursor)
  } catch {
    throw new Error('Cursor no longer points to an entry')
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as CreatedAtCursor).v !== 1 ||
    (parsed as CreatedAtCursor).kind !== 'entriesByCreatedAt' ||
    typeof (parsed as CreatedAtCursor).createdAt !== 'number' ||
    !Number.isFinite((parsed as CreatedAtCursor).createdAt) ||
    typeof (parsed as CreatedAtCursor).baseSlug !== 'string'
  ) {
    throw new Error('Cursor no longer points to an entry')
  }
  return parsed as CreatedAtCursor
}

async function readCollectionReindexRows(
  ctx: QueryOrMutationCtx,
  args: {
    collectionId: Id<'collections'>
    phase: CollectionJobPhase
    cursor: CreatedAtCursor | null
    limit: number
  },
) {
  if (!args.cursor) {
    return await ctx.db
      .query('entries')
      .withIndex('by_collection_status_createdAt_slug', (q) =>
        q.eq('collectionId', args.collectionId).eq('status', args.phase),
      )
      .order('asc')
      .take(args.limit)
  }

  const sameCreatedAt = await ctx.db
    .query('entries')
    .withIndex('by_collection_status_createdAt_slug', (q) =>
      q
        .eq('collectionId', args.collectionId)
        .eq('status', args.phase)
        .eq('createdAt', args.cursor!.createdAt)
        .gt('baseSlug', args.cursor!.baseSlug),
    )
    .order('asc')
    .take(args.limit)
  if (sameCreatedAt.length >= args.limit) return sameCreatedAt

  const newer = await ctx.db
    .query('entries')
    .withIndex('by_collection_status_createdAt_slug', (q) =>
      q
        .eq('collectionId', args.collectionId)
        .eq('status', args.phase)
        .gt('createdAt', args.cursor!.createdAt),
    )
    .order('asc')
    .take(args.limit - sameCreatedAt.length)
  return [...sameCreatedAt, ...newer]
}

export const getCollectionReindexPage = internalQuery({
  args: {
    collectionId: v.string(),
    phase: v.union(v.literal('draft'), v.literal('published'), v.literal('archived')),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.union(
    v.null(),
    v.object({
      collectionSlug: v.string(),
      entryIds: v.array(v.string()),
      continueCursor: v.union(v.string(), v.null()),
      isDone: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const collectionId = asCollectionId(args.collectionId)
    const target = await getCollectionReindexTarget(ctx, collectionId)
    if (!target) return null

    const cursor = parseCreatedAtCursor(args.cursor)
    const rows = await readCollectionReindexRows(ctx, {
      collectionId,
      phase: args.phase,
      cursor,
      limit: COLLECTION_REINDEX_BATCH_SIZE + 1,
    })
    const isDone = rows.length <= COLLECTION_REINDEX_BATCH_SIZE
    const page = isDone ? rows : rows.slice(0, COLLECTION_REINDEX_BATCH_SIZE)

    return {
      collectionSlug: target.collection.slug,
      entryIds: page.map((entry) => toStringId(entry._id)),
      continueCursor:
        isDone || page.length === 0 ? null : encodeCreatedAtCursor(page[page.length - 1]!),
      isDone,
    }
  },
})

export const applyCollectionReindexPage = internalMutation({
  args: {
    collectionId: v.string(),
    phase: v.union(v.literal('draft'), v.literal('published'), v.literal('archived')),
    cursor: v.union(v.string(), v.null()),
    nextCursor: v.union(v.string(), v.null()),
    entryIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const collectionId = asCollectionId(args.collectionId)
    const job = await getCollectionReindexJob(ctx, collectionId)
    const target = job ? await getCollectionReindexTarget(ctx, collectionId) : null
    if (!target) {
      if (!job) return null
      await ctx.db.delete(job._id)
      return null
    }

    const hydratedCollection = await getCollectionOrThrow(ctx, target.collection.slug)
    for (const entryId of args.entryIds) {
      const entry = await ctx.db.get(entryId as Id<'entries'>)
      if (!entry || entry.collectionId !== collectionId) continue
      await recomputeEntryDerivedState(ctx, hydratedCollection, entry)
    }

    await ctx.db.patch(target.job._id, {
      phase: args.phase,
      cursor: args.nextCursor,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const finishCollectionReindex = internalMutation({
  args: {
    collectionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const collectionId = asCollectionId(args.collectionId)
    const job = await getCollectionReindexJob(ctx, collectionId)
    if (job) {
      await ctx.db.delete(job._id)
    }
    return null
  },
})

export const runCollectionReindexJob = internalAction({
  args: {
    collectionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let phase: CollectionJobPhase | null = 'draft'
    let cursor: string | null = null
    type ReindexPage = {
      collectionSlug: string
      entryIds: string[]
      continueCursor: string | null
      isDone: boolean
    }

    while (phase) {
      while (true) {
        const page = (await ctx.runQuery(
          internalJobsApi.collections.jobs.getCollectionReindexPage,
          { collectionId: args.collectionId, phase, cursor },
        )) as ReindexPage | null
        if (!page) {
          await ctx.runMutation(internalJobsApi.collections.jobs.finishCollectionReindex, {
            collectionId: args.collectionId,
          })
          return null
        }

        await ctx.runMutation(internalJobsApi.collections.jobs.applyCollectionReindexPage, {
          collectionId: args.collectionId,
          phase,
          cursor,
          nextCursor: page.continueCursor,
          entryIds: page.entryIds,
        })

        if (page.isDone) break
        cursor = page.continueCursor
      }

      phase = nextReindexPhase(phase)
      cursor = null
    }

    await ctx.runMutation(internalJobsApi.collections.jobs.finishCollectionReindex, {
      collectionId: args.collectionId,
    })
    return null
  },
})
