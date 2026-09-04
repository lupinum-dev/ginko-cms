import {
  getDraftVsPublishedDiff as getDraftVsPublishedDiffArgs,
  getVersionDiff as getVersionDiffArgs,
  getVersionSnapshot as getVersionSnapshotArgs,
  listVersions as listVersionsArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  draftVsPublishedDiffValidator,
  versionDiffValidator,
  versionListResultValidator,
  versionSnapshotPreviewValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'

import type { Id } from '../_generated/dataModel.js'
import { canRead } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerQuery } from '../functions.js'
import { isEqualJsonValue } from '../lib/data.js'
import { toStringId } from '../lib/ids.js'
import type { HandlerQueryCtx } from '../lib/types.js'
import type { EntryRevisionDoc } from './context.js'
import { getCollectionForEntry, getEntryOrThrow } from './context.js'
import { createSnapshotFromState, flattenRevisionSnapshot, flattenSnapshot } from './versioning.js'
import { computeDraftPath } from './workflow/draftPlacement.js'

const VERSION_DEFAULT_LIMIT = 25
const VERSION_MAX_LIMIT = 100

type VersionCursor = {
  v: 1
  kind: 'entryVersions'
  entryId: string
  revisionNumber: number
  creationTime: number
}

function parseVersionCursor(value: string | null | undefined, entryId: string) {
  if (!value) return null
  let parsed: Partial<VersionCursor>
  try {
    parsed = JSON.parse(value) as Partial<VersionCursor>
  } catch {
    throwCmsError('INVALID_CURSOR', 'Version cursor is invalid.', { cursor: value })
  }
  if (
    parsed.v !== 1 ||
    parsed.kind !== 'entryVersions' ||
    parsed.entryId !== entryId ||
    typeof parsed.revisionNumber !== 'number' ||
    !Number.isFinite(parsed.revisionNumber) ||
    typeof parsed.creationTime !== 'number' ||
    !Number.isFinite(parsed.creationTime)
  ) {
    throwCmsError('INVALID_CURSOR', 'Version cursor is invalid.', { cursor: value })
  }
  return parsed as VersionCursor
}

async function readVersionPage(
  ctx: HandlerQueryCtx,
  entryId: Id<'entries'>,
  cursor: VersionCursor | null,
  take: number,
) {
  if (!cursor) {
    return await ctx.db
      .query('entryRevisions')
      .withIndex('by_entry_revisionNumber', (query) => query.eq('entryId', entryId))
      .order('desc')
      .take(take)
  }
  const sameTimestamp = await ctx.db
    .query('entryRevisions')
    .withIndex('by_entry_revisionNumber', (query) =>
      query
        .eq('entryId', entryId)
        .eq('revisionNumber', cursor.revisionNumber)
        .lt('_creationTime', cursor.creationTime),
    )
    .order('desc')
    .take(take)
  if (sameTimestamp.length >= take) return sameTimestamp
  const older = await ctx.db
    .query('entryRevisions')
    .withIndex('by_entry_revisionNumber', (query) =>
      query.eq('entryId', entryId).lt('revisionNumber', cursor.revisionNumber),
    )
    .order('desc')
    .take(take - sameTimestamp.length)
  return [...sameTimestamp, ...older]
}

function mapVersionDisplayAction(action: string) {
  switch (action) {
    case 'archive':
      return 'archived' as const
    case 'checkpoint':
      return 'checkpoint' as const
    case 'restore':
      return 'restoredDraft' as const
    case 'rollback':
      return 'restoredPublished' as const
    case 'route_rebuild':
      return 'routeUpdated' as const
    case 'unpublish':
      return 'unpublished' as const
    case 'publish':
    default:
      return 'published' as const
  }
}

export const listVersions = callerQuery.protected({
  id: 'editor:listVersions',
  args: listVersionsArgs.args,
  guard: canRead,
  returns: versionListResultValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const entry = await getEntryOrThrow(ctx, args.entryId)
    const limit = Math.max(
      1,
      Math.min(args.paginationOpts.numItems ?? VERSION_DEFAULT_LIMIT, VERSION_MAX_LIMIT),
    )
    const cursor = parseVersionCursor(args.paginationOpts.cursor, args.entryId)
    const rows = await readVersionPage(ctx, entry._id, cursor, limit + 1)
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    const isDone = rows.length <= limit
    const publicRevisionIds = new Set(
      entry.activePublications.map((publication) => String(publication.revisionId)),
    )
    return {
      page: page.map((revision) => ({
        _id: toStringId(revision._id),
        version: revision.revisionNumber,
        action: revision.kind,
        displayAction: mapVersionDisplayAction(revision.kind),
        publishedLocales: revision.affectedLocales,
        message: revision.message ?? null,
        createdBy: revision.createdBy,
        createdAt: revision.createdAt,
        isCurrentPublished: publicRevisionIds.has(String(revision._id)),
      })),
      isDone,
      continueCursor:
        isDone || !last
          ? ''
          : JSON.stringify({
              v: 1,
              kind: 'entryVersions',
              entryId: args.entryId,
              revisionNumber: last.revisionNumber,
              creationTime: last._creationTime,
            } satisfies VersionCursor),
    }
  },
})

export const getVersionDiff = callerQuery.protected({
  id: 'editor:getVersionDiff',
  args: getVersionDiffArgs.args,
  guard: canRead,
  returns: versionDiffValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const leftId = ctx.db.normalizeId('entryRevisions', args.leftVersionId)
    const rightId = ctx.db.normalizeId('entryRevisions', args.rightVersionId)
    const left = leftId ? await ctx.db.get(leftId) : null
    const right = rightId ? await ctx.db.get(rightId) : null
    if (!left || !right) throw new Error('Version not found')
    if (left.entryId !== right.entryId) {
      throwCmsError('ENTRY_VERSION_MISMATCH', 'Versions must belong to the same entry', {
        leftVersionId: args.leftVersionId,
        rightVersionId: args.rightVersionId,
      })
    }
    const leftFlat = flattenRevisionSnapshot(left.snapshots)
    const rightFlat = flattenRevisionSnapshot(right.snapshots)
    const keys = Array.from(new Set([...Object.keys(leftFlat), ...Object.keys(rightFlat)])).sort()
    return {
      leftVersionId: toStringId(left._id),
      rightVersionId: toStringId(right._id),
      changes: keys
        .filter((key) => !isEqualJsonValue(leftFlat[key], rightFlat[key]))
        .map((key) => ({
          field: key,
          left: leftFlat[key] ?? null,
          right: rightFlat[key] ?? null,
        })),
    }
  },
})

async function extractLocaleFromRevision(
  ctx: HandlerQueryCtx,
  revision: EntryRevisionDoc,
  locale?: string,
) {
  const localeKey = locale ?? Object.keys(revision.snapshots).sort()[0]
  if (!localeKey) return null
  const localeData = revision.snapshots[localeKey]
  if (!localeData) return null
  const entry = await getEntryOrThrow(ctx, toStringId(revision.entryId))
  const collection = await getCollectionForEntry(ctx, entry)
  const path = await computeDraftPath(ctx, {
    collection,
    entry,
    parentEntryId: localeData.parentEntryId,
    slug: localeData.slug,
    locale: localeKey,
  })
  return {
    slug: localeData.slug,
    path,
    values: localeData.values as Record<string, unknown>,
  }
}

export const getVersionSnapshot = callerQuery.protected({
  id: 'editor:getVersionSnapshot',
  args: getVersionSnapshotArgs.args,
  guard: canRead,
  returns: versionSnapshotPreviewValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const revisionId = ctx.db.normalizeId('entryRevisions', args.versionId)
    const revision = revisionId ? await ctx.db.get(revisionId) : null
    if (!revision) throw new Error('Version not found')
    const locale = await extractLocaleFromRevision(ctx, revision, args.locale)
    const selectedSnapshot =
      (args.locale ? revision.snapshots[args.locale] : undefined) ??
      revision.snapshots[Object.keys(revision.snapshots).sort()[0] ?? ''] ??
      null
    return {
      _id: toStringId(revision._id),
      version: revision.revisionNumber,
      action: revision.kind,
      message: revision.message ?? null,
      createdAt: revision.createdAt,
      snapshot: {
        baseSlug: selectedSnapshot?.slug ?? '',
        shared: (selectedSnapshot?.shared as Record<string, unknown>) ?? {},
        locale,
      },
    }
  },
})

export async function getDraftVsPublishedDiffPreview(
  ctx: HandlerQueryCtx,
  args: { entryId: string },
) {
  const entry = await getEntryOrThrow(ctx, args.entryId)
  const collection = await getCollectionForEntry(ctx, entry)
  const draftSnapshot = await createSnapshotFromState(ctx, entry, collection, 'draft')
  const publishedSnapshot = await createSnapshotFromState(ctx, entry, collection, 'published')
  const draftFlat = flattenSnapshot(draftSnapshot)
  const publishedFlat = flattenSnapshot(publishedSnapshot)
  const keys = Array.from(
    new Set([...Object.keys(draftFlat), ...Object.keys(publishedFlat)]),
  ).sort()
  return {
    changes: keys
      .filter((key) => !isEqualJsonValue(publishedFlat[key], draftFlat[key]))
      .map((key) => ({
        field: key,
        left: publishedFlat[key] ?? null,
        right: draftFlat[key] ?? null,
      })),
  }
}

export const getDraftVsPublishedDiff = callerQuery.protected({
  id: 'editor:getDraftVsPublishedDiff',
  args: getDraftVsPublishedDiffArgs.args,
  guard: canRead,
  returns: draftVsPublishedDiffValidator,
  handler: async (ctx: HandlerQueryCtx, args) => getDraftVsPublishedDiffPreview(ctx, args),
})
