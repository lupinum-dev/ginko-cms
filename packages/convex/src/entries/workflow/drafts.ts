/**
 * Gate 1 - mutable draft state writer.
 *
 * Per the refactor plan: autosaves never append revisions. They write to
 * `entryDrafts` (one shared row + one row per locale) and bump
 * `entries.draftVersion`. The draftVersion is the per-entry monotonic
 * concurrency token; saveEntryDraft rejects (409) when the caller's
 * `expectedDraftVersion` doesn't match the current one.
 *
 * Invariants enforced here:
 *   #6  locale isolation - editing locale A never touches locale B's draft row
 *   #7  draft concurrency - draftVersion is the only token a draft save uses
 *   #15 asset purge protection (via writes to contentAssetRefs by callers
 *       of this module - see entries/workflow/assetRefs.ts)
 */

import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { isEqualJsonValue } from '../../lib/data.js'
import type { MutationCtx } from '../../lib/types.js'

export type EntryDraftDoc = Doc<'entryDrafts'>

export interface SharedDraftPatch {
  parentEntryId?: Id<'entries'> | null
  orderRank?: string | null
  slug?: string | null
  shared?: JsonObject
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

interface ApplyDraftPatchResult {
  entry: Doc<'entries'>
  draftVersion: number
  /** Locales whose row was updated (or created) in this call. */
  affectedLocales: string[]
  /** True iff the shared row was updated. */
  sharedUpdated: boolean
}

/**
 * Atomically apply a draft patch:
 *  1. Look up the entry, fail if missing.
 *  2. Compare expectedDraftVersion to entries.draftVersion - reject if drift.
 *  3. Upsert the shared draft row (locale=null) if patch.shared is present.
 *  4. Upsert each locale draft row (locale=<code>) for every locale in
 *     patch.locales.
 *  5. Bump entries.draftVersion.
 *
 * The locale isolation invariant (#6) is enforced because we only touch the
 * specific (entryId, locale) rows the patch names. No locale row is rewritten
 * unless the caller targeted it.
 */
export async function applyDraftPatch(
  ctx: MutationCtx,
  input: ApplyDraftPatchInput,
): Promise<ApplyDraftPatchResult> {
  const entry = await ctx.db.get(input.entryId)
  if (!entry) throw new EntryNotFoundError(input.entryId)

  if (entry.draftVersion !== input.expectedDraftVersion) {
    throw new DraftConcurrencyError(input.expectedDraftVersion, entry.draftVersion)
  }

  const existingRows = await readDraftRows(ctx, input.entryId)
  let sharedUpdated = false
  if (input.patch.shared && sharedDraftChanged(existingRows.shared, input.patch.shared)) {
    await upsertSharedDraft(ctx, {
      entryId: input.entryId,
      patch: input.patch.shared,
      appIdentity: input.appIdentity,
      now: input.now,
    })
    sharedUpdated = true
  }

  const affectedLocales: string[] = []
  for (const [locale, localePatch] of Object.entries(input.patch.locales ?? {})) {
    if (!localeDraftChanged(existingRows.byLocale[locale] ?? null, localePatch)) {
      continue
    }
    await upsertLocaleDraft(ctx, {
      entryId: input.entryId,
      locale,
      patch: localePatch,
      appIdentity: input.appIdentity,
      now: input.now,
    })
    affectedLocales.push(locale)
  }

  if (!sharedUpdated && affectedLocales.length === 0) {
    return {
      entry,
      draftVersion: entry.draftVersion,
      affectedLocales: [],
      sharedUpdated: false,
    }
  }

  const nextDirtyLocales = await resolveDirtyLocales(ctx, {
    entryId: input.entryId,
    currentDirtyLocales: entry.dirtyLocales ?? [],
    sharedUpdated,
    affectedLocales,
  })
  const nextDraftVersion = entry.draftVersion + 1
  await ctx.db.patch(input.entryId, {
    draftVersion: nextDraftVersion,
    dirtyLocales: nextDirtyLocales,
    updatedBy: input.appIdentity,
    updatedAt: input.now,
  })

  const refreshed = await ctx.db.get(input.entryId)
  if (!refreshed) throw new EntryNotFoundError(input.entryId)

  return {
    entry: refreshed,
    draftVersion: nextDraftVersion,
    affectedLocales,
    sharedUpdated,
  }
}

async function upsertSharedDraft(
  ctx: MutationCtx,
  args: {
    entryId: Id<'entries'>
    patch: SharedDraftPatch
    appIdentity: string
    now: number
  },
): Promise<void> {
  const existing = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entryId).eq('locale', null))
    .first()

  if (!existing) {
    await ctx.db.insert('entryDrafts', {
      entryId: args.entryId,
      locale: null,
      baseRevisionId: null,
      ...(args.patch.parentEntryId !== undefined
        ? { parentEntryId: args.patch.parentEntryId }
        : {}),
      ...(args.patch.orderRank !== undefined ? { orderRank: args.patch.orderRank } : {}),
      ...(args.patch.slug !== undefined ? { slug: args.patch.slug } : {}),
      ...(args.patch.shared !== undefined ? { shared: args.patch.shared } : {}),
      updatedBy: args.appIdentity,
      updatedAt: args.now,
    })
    return
  }

  const updates: Partial<EntryDraftDoc> = {
    updatedBy: args.appIdentity,
    updatedAt: args.now,
  }
  if (args.patch.parentEntryId !== undefined) updates.parentEntryId = args.patch.parentEntryId
  if (args.patch.orderRank !== undefined) updates.orderRank = args.patch.orderRank
  if (args.patch.slug !== undefined) updates.slug = args.patch.slug
  if (args.patch.shared !== undefined) updates.shared = args.patch.shared
  await ctx.db.patch(existing._id, updates)
}

async function upsertLocaleDraft(
  ctx: MutationCtx,
  args: {
    entryId: Id<'entries'>
    locale: string
    patch: LocaleDraftPatch
    appIdentity: string
    now: number
  },
): Promise<void> {
  const existing = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entryId).eq('locale', args.locale))
    .first()

  if (!existing) {
    await ctx.db.insert('entryDrafts', {
      entryId: args.entryId,
      locale: args.locale,
      baseRevisionId: null,
      ...(args.patch.slug !== undefined ? { localeSlug: args.patch.slug } : {}),
      ...(args.patch.values !== undefined ? { values: args.patch.values } : {}),
      ...(args.patch.bodyMdc !== undefined ? { bodyMdc: args.patch.bodyMdc } : {}),
      updatedBy: args.appIdentity,
      updatedAt: args.now,
    })
    return
  }

  const updates: Partial<EntryDraftDoc> = {
    updatedBy: args.appIdentity,
    updatedAt: args.now,
  }
  if (args.patch.slug !== undefined) updates.localeSlug = args.patch.slug
  if (args.patch.values !== undefined) updates.values = args.patch.values
  if (args.patch.bodyMdc !== undefined) updates.bodyMdc = args.patch.bodyMdc
  await ctx.db.patch(existing._id, updates)
}

function sharedDraftChanged(existing: EntryDraftDoc | null, patch: SharedDraftPatch): boolean {
  if (!existing) return true
  if (patch.parentEntryId !== undefined && existing.parentEntryId !== patch.parentEntryId) {
    return true
  }
  if (patch.orderRank !== undefined && (existing.orderRank ?? null) !== (patch.orderRank ?? null)) {
    return true
  }
  if (patch.slug !== undefined && (existing.slug ?? null) !== (patch.slug ?? null)) {
    return true
  }
  if (patch.shared !== undefined && !isEqualJsonValue(existing.shared ?? {}, patch.shared)) {
    return true
  }
  return false
}

function localeDraftChanged(existing: EntryDraftDoc | null, patch: LocaleDraftPatch): boolean {
  if (!existing) return true
  if (patch.slug !== undefined && (existing.localeSlug ?? null) !== (patch.slug ?? null)) {
    return true
  }
  if (patch.values !== undefined && !isEqualJsonValue(existing.values ?? {}, patch.values)) {
    return true
  }
  if (patch.bodyMdc !== undefined && (existing.bodyMdc ?? null) !== (patch.bodyMdc ?? null)) {
    return true
  }
  return false
}

async function resolveDirtyLocales(
  ctx: MutationCtx,
  args: {
    entryId: Id<'entries'>
    currentDirtyLocales: string[]
    sharedUpdated: boolean
    affectedLocales: string[]
  },
): Promise<string[]> {
  const dirtyLocales = new Set(args.currentDirtyLocales)
  for (const locale of args.affectedLocales) {
    dirtyLocales.add(locale)
  }

  if (args.sharedUpdated) {
    const rows = await ctx.db
      .query('entryDrafts')
      .withIndex('by_entry', (q) => q.eq('entryId', args.entryId))
      .collect()
    for (const row of rows) {
      if (row.locale !== null) {
        dirtyLocales.add(row.locale)
      }
    }
  }

  return [...dirtyLocales].sort()
}

/**
 * Read all draft rows for an entry, returning the shared row (if any) and a
 * map of locale -> locale row. Used by `previewPublish` and `publishEntry`
 * to assemble a snapshot from the current draft state.
 */
export async function readDraftRows(
  ctx: { db: MutationCtx['db'] | { query: MutationCtx['db']['query'] } },
  entryId: Id<'entries'>,
): Promise<{
  shared: EntryDraftDoc | null
  byLocale: Record<string, EntryDraftDoc>
}> {
  const rows = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', entryId))
    .collect()
  let shared: EntryDraftDoc | null = null
  const byLocale: Record<string, EntryDraftDoc> = {}
  for (const row of rows) {
    if (row.locale === null) {
      shared = row
    } else {
      byLocale[row.locale] = row
    }
  }
  return { shared, byLocale }
}
