/**
 * Canonical draft writer.
 *
 * Shared values and placement live on `entries`; locale-specific values live
 * on `entryLocaleDrafts`. `entries.draftVersion` is the single optimistic
 * concurrency token for an editor save. Published state is never touched by
 * this module.
 */

import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { isEqualJsonValue } from '../../lib/data.js'
import type { MutationCtx, QueryOrMutationCtx } from '../../lib/types.js'

export type EntryDraftDoc = Doc<'entryLocaleDrafts'> & {
  /** Derived read alias while callers move to the canonical `slug` name. */
  localeSlug: string | null
}

export type SharedDraftView = Pick<
  Doc<'entries'>,
  | '_id'
  | 'parentEntryId'
  | 'orderRank'
  | 'slug'
  | 'shared'
  | 'nodeKind'
  | 'sharedVersion'
  | 'updatedBy'
  | 'updatedAt'
>

export interface SharedDraftPatch {
  parentEntryId?: Id<'entries'> | null
  orderRank?: string | null
  slug?: string | null
  shared?: JsonObject
  nodeKind?: 'page' | 'folder' | 'group' | 'section' | null
}

export interface LocaleDraftPatch {
  slug?: string | null
  values?: JsonObject
  bodyMdc?: string | null
}

export interface SaveDraftPatch {
  shared?: SharedDraftPatch
  locales?: Record<string, LocaleDraftPatch>
}

export class DraftConcurrencyError extends Error {
  constructor(
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(
      `Draft save rejected: expectedDraftVersion=${expected} but entries.draftVersion=${actual}`,
    )
    this.name = 'DraftConcurrencyError'
  }
}

export class EntryNotFoundError extends Error {
  constructor(public readonly entryId: Id<'entries'>) {
    super(`Entry not found: ${entryId}`)
    this.name = 'EntryNotFoundError'
  }
}

interface ApplyDraftPatchInput {
  entryId: Id<'entries'>
  expectedDraftVersion: number
  patch: SaveDraftPatch
  appIdentity: string
  now: number
}

export interface ApplyDraftPatchResult {
  entry: Doc<'entries'>
  draftVersion: number
  affectedLocales: string[]
  sharedUpdated: boolean
}

export async function applyDraftPatch(
  ctx: MutationCtx,
  input: ApplyDraftPatchInput,
): Promise<ApplyDraftPatchResult> {
  const entry = await ctx.db.get(input.entryId)
  if (!entry) throw new EntryNotFoundError(input.entryId)
  if (entry.draftVersion !== input.expectedDraftVersion) {
    throw new DraftConcurrencyError(input.expectedDraftVersion, entry.draftVersion)
  }

  const sharedUpdated = Boolean(input.patch.shared && sharedDraftChanged(entry, input.patch.shared))
  const localeRows = await readLocaleDraftRows(ctx, input.entryId)
  const affectedLocales = Object.entries(input.patch.locales ?? {})
    .filter(([locale, patch]) => localeDraftChanged(localeRows[locale] ?? null, patch))
    .map(([locale]) => locale)

  if (!sharedUpdated && affectedLocales.length === 0) {
    return { entry, draftVersion: entry.draftVersion, affectedLocales: [], sharedUpdated: false }
  }

  if (sharedUpdated) {
    const patch = input.patch.shared!
    await ctx.db.patch(input.entryId, {
      ...(patch.parentEntryId !== undefined ? { parentEntryId: patch.parentEntryId ?? null } : {}),
      ...(patch.orderRank !== undefined ? { orderRank: patch.orderRank ?? '' } : {}),
      ...(patch.slug !== undefined ? { slug: patch.slug ?? entry.slug } : {}),
      ...(patch.shared !== undefined ? { shared: patch.shared } : {}),
      ...(patch.nodeKind !== undefined ? { nodeKind: patch.nodeKind } : {}),
      sharedVersion: entry.sharedVersion + 1,
    })
  }

  for (const locale of affectedLocales) {
    await upsertLocaleDraft(ctx, {
      entryId: input.entryId,
      locale,
      patch: input.patch.locales![locale]!,
      existing: localeRows[locale] ?? null,
      appIdentity: input.appIdentity,
      now: input.now,
    })
  }

  const nextDraftVersion = entry.draftVersion + 1
  await ctx.db.patch(input.entryId, {
    draftVersion: nextDraftVersion,
    updatedBy: input.appIdentity,
    updatedAt: input.now,
  })
  const refreshed = await ctx.db.get(input.entryId)
  if (!refreshed) throw new EntryNotFoundError(input.entryId)
  return { entry: refreshed, draftVersion: nextDraftVersion, affectedLocales, sharedUpdated }
}

async function upsertLocaleDraft(
  ctx: MutationCtx,
  args: {
    entryId: Id<'entries'>
    locale: string
    patch: LocaleDraftPatch
    existing: Doc<'entryLocaleDrafts'> | null
    appIdentity: string
    now: number
  },
): Promise<void> {
  const payload = {
    entryId: args.entryId,
    locale: args.locale,
    slug: args.patch.slug !== undefined ? args.patch.slug : (args.existing?.slug ?? null),
    values: args.patch.values ?? args.existing?.values ?? {},
    bodyMdc: args.patch.bodyMdc ?? args.existing?.bodyMdc ?? '',
    version: (args.existing?.version ?? 0) + 1,
    updatedBy: args.appIdentity,
    updatedAt: args.now,
  }
  if (args.existing) await ctx.db.replace(args.existing._id, payload)
  else await ctx.db.insert('entryLocaleDrafts', payload)
}

function sharedDraftChanged(entry: Doc<'entries'>, patch: SharedDraftPatch): boolean {
  if (patch.parentEntryId !== undefined && entry.parentEntryId !== (patch.parentEntryId ?? null)) {
    return true
  }
  if (patch.orderRank !== undefined && entry.orderRank !== (patch.orderRank ?? '')) return true
  if (patch.slug !== undefined && entry.slug !== (patch.slug ?? entry.slug)) return true
  if (patch.shared !== undefined && !isEqualJsonValue(entry.shared, patch.shared)) return true
  if (patch.nodeKind !== undefined && entry.nodeKind !== patch.nodeKind) return true
  return false
}

function localeDraftChanged(
  existing: Doc<'entryLocaleDrafts'> | null,
  patch: LocaleDraftPatch,
): boolean {
  if (!existing) return true
  if (patch.slug !== undefined && existing.slug !== patch.slug) return true
  if (patch.values !== undefined && !isEqualJsonValue(existing.values, patch.values)) return true
  if (patch.bodyMdc !== undefined && existing.bodyMdc !== (patch.bodyMdc ?? '')) return true
  return false
}

function asLocaleView(row: Doc<'entryLocaleDrafts'>): EntryDraftDoc {
  return { ...row, localeSlug: row.slug }
}

async function readLocaleDraftRows(
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
): Promise<Record<string, Doc<'entryLocaleDrafts'>>> {
  const rows = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', entryId))
    .collect()
  return Object.fromEntries(rows.map((row) => [row.locale, row]))
}

export async function readDraftRows(
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
): Promise<{ shared: SharedDraftView | null; byLocale: Record<string, EntryDraftDoc> }> {
  const [entry, localeRows] = await Promise.all([
    ctx.db.get(entryId),
    ctx.db
      .query('entryLocaleDrafts')
      .withIndex('by_entry', (q) => q.eq('entryId', entryId))
      .collect(),
  ])
  const byLocale = Object.fromEntries(localeRows.map((row) => [row.locale, asLocaleView(row)]))
  return { shared: entry, byLocale }
}

export async function readDraftPlacementRows(
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
  locales: Iterable<string>,
): Promise<{ shared: SharedDraftView | null; byLocale: Record<string, EntryDraftDoc> }> {
  const localeCodes = [...new Set(locales)]
  const [entry, ...rows] = await Promise.all([
    ctx.db.get(entryId),
    ...localeCodes.map((locale) =>
      ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId).eq('locale', locale))
        .unique(),
    ),
  ])
  const byLocale: Record<string, EntryDraftDoc> = {}
  localeCodes.forEach((locale, index) => {
    const row = rows[index]
    if (row) byLocale[locale] = asLocaleView(row)
  })
  return { shared: entry, byLocale }
}
