/**
 * Append-only revision writer.
 *
 * `entryRevisions` records meaningful events only (publish, unpublish,
 * rollback, archive, checkpoint, route rebuild). Autosaves do NOT append rows here; they
 * live in `entryDrafts` (see drafts.ts).
 *
 * Once written, a revision row is never mutated. `restoreRevision` creates
 * a NEW revision row referencing an old one as `parentRevisionId`. This
 * enforces invariant #4: "Restore never mutates history."
 */

import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import type { MutationCtx } from '../../lib/types.js'

export type EntryRevisionDoc = Doc<'entryRevisions'>

export type RevisionKind =
  | 'publish'
  | 'unpublish'
  | 'rollback'
  | 'archive'
  | 'checkpoint'
  | 'route_rebuild'

export interface RevisionLocaleSnapshot {
  slug: string | null
  path: string
  values: JsonObject
  bodyMdc?: string
  bodyAst?: JsonValue
  searchText?: string
  toc?: JsonValue | null
}

export interface RevisionSnapshot {
  parentEntryId?: Id<'entries'> | null
  orderRank?: string | null
  slug?: string | null
  shared: JsonObject
  locales: Record<string, RevisionLocaleSnapshot | null>
}

export interface AppendRevisionInput {
  entryId: Id<'entries'>
  collectionId: Id<'collections'>
  parentRevisionId: Id<'entryRevisions'> | null
  kind: RevisionKind
  snapshot: RevisionSnapshot
  affectedLocales: string[]
  schemaVersion?: string
  message?: string | null
  appIdentity: string
  now: number
}

/**
 * Insert a new immutable revision row. Returns the new revision id and the
 * row itself.
 *
 * Callers MUST also patch `entries.latestRevisionId` to point at the new
 * row, but that is the caller's responsibility (the caller usually has
 * other entry-level fields to update in the same transaction).
 */
export async function appendRevision(
  ctx: MutationCtx,
  input: AppendRevisionInput,
): Promise<{ revisionId: Id<'entryRevisions'>; revision: EntryRevisionDoc }> {
  const latest = await ctx.db
    .query('entryRevisions')
    .withIndex('by_entry_revisionNumber', (q) => q.eq('entryId', input.entryId))
    .order('desc')
    .first()
  const latestRevisionNumber = latest?.revisionNumber ?? 0
  const revisionNumber = latestRevisionNumber + 1

  const id = await ctx.db.insert('entryRevisions', {
    entryId: input.entryId,
    collectionId: input.collectionId,
    revisionNumber,
    parentRevisionId: input.parentRevisionId,
    kind: input.kind,
    snapshot: {
      parentEntryId: input.snapshot.parentEntryId ?? null,
      orderRank: input.snapshot.orderRank ?? null,
      slug: input.snapshot.slug ?? null,
      shared: input.snapshot.shared,
      locales: input.snapshot.locales,
    },
    affectedLocales: input.affectedLocales,
    ...(input.schemaVersion !== undefined ? { schemaVersion: input.schemaVersion } : {}),
    message: input.message ?? null,
    createdBy: input.appIdentity,
    createdAt: input.now,
  })

  const revision = await ctx.db.get(id)
  if (!revision) {
    // Convex insert returning a missing doc is a system error, not a normal
    // failure mode - throw a clear error rather than silently returning.
    throw new Error(`appendRevision: insert succeeded but row ${id} not found`)
  }

  return { revisionId: id, revision }
}

export async function appendRevisionAndPatchEntry(
  ctx: MutationCtx,
  input: AppendRevisionInput,
  entryPatch: Partial<Doc<'entries'>>,
): Promise<{ revisionId: Id<'entryRevisions'>; revision: EntryRevisionDoc }> {
  const result = await appendRevision(ctx, input)
  await ctx.db.patch(input.entryId, {
    ...entryPatch,
    latestRevisionId: result.revisionId,
  })
  return result
}
