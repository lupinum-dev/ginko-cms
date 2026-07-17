/** Immutable editorial and publication history. */

import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import type { MutationCtx } from '../../lib/types.js'

export type EntryRevisionDoc = Doc<'entryRevisions'>
export type RevisionKind = EntryRevisionDoc['kind']

/** A complete locale publication/draft snapshot. */
export interface RevisionLocaleSnapshot {
  shared: JsonObject
  values: JsonObject
  bodyMdc: string
  bodyAst?: JsonValue
  searchText?: string
  toc?: JsonValue | null
  slug: string
  parentEntryId: Id<'entries'> | null
  orderRank: string
  sharedVersion: number
  localeVersion: number
}

export type RevisionSnapshots = Record<string, RevisionLocaleSnapshot>

export interface AppendRevisionInput {
  entryId: Id<'entries'>
  collection: string
  parentRevisionId: Id<'entryRevisions'> | null
  kind: RevisionKind
  snapshots: RevisionSnapshots
  affectedLocales: string[]
  contentHash: string
  operationId: string
  message?: string | null
  appIdentity: string
  now: number
}

function assertCompleteSnapshots(input: AppendRevisionInput): void {
  for (const locale of input.affectedLocales) {
    const snapshot = input.snapshots[locale]
    if (!snapshot) throw new Error(`Revision snapshot is missing affected locale "${locale}"`)
    if (!snapshot.slug) throw new Error(`Revision snapshot has an empty slug for locale "${locale}"`)
  }
}

export async function appendRevision(
  ctx: MutationCtx,
  input: AppendRevisionInput,
): Promise<{ revisionId: Id<'entryRevisions'>; revision: EntryRevisionDoc }> {
  assertCompleteSnapshots(input)
  const latest = await ctx.db
    .query('entryRevisions')
    .withIndex('by_entry_revisionNumber', (q) => q.eq('entryId', input.entryId))
    .order('desc')
    .first()
  const revisionNumber = (latest?.revisionNumber ?? 0) + 1
  const revisionId = await ctx.db.insert('entryRevisions', {
    entryId: input.entryId,
    collection: input.collection,
    revisionNumber,
    operationId: input.operationId,
    parentRevisionId: input.parentRevisionId,
    kind: input.kind,
    snapshots: input.snapshots,
    affectedLocales: [...new Set(input.affectedLocales)].sort(),
    contentHash: input.contentHash,
    message: input.message ?? null,
    createdBy: input.appIdentity,
    createdAt: input.now,
  })
  const revision = await ctx.db.get(revisionId)
  if (!revision) throw new Error(`Revision insert succeeded but ${revisionId} was not readable`)
  return { revisionId, revision }
}

export async function appendRevisionAndPatchEntry(
  ctx: MutationCtx,
  input: AppendRevisionInput,
  entryPatch: Partial<Doc<'entries'>>,
): Promise<{ revisionId: Id<'entryRevisions'>; revision: EntryRevisionDoc }> {
  const result = await appendRevision(ctx, input)
  await ctx.db.patch(input.entryId, {
    ...entryPatch,
    latestEditorialRevisionId: result.revisionId,
  })
  return result
}

export function revisionSnapshotForLocale(
  revision: EntryRevisionDoc,
  locale: string,
): RevisionLocaleSnapshot | null {
  return revision.snapshots[locale] ?? null
}
