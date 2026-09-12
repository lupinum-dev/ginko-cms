import type { Doc } from '../_generated/dataModel.js'
import { deleteAssetRefsForSource } from '../entries/workflow/assetRefs.js'
import { refreshDraftAssetRefsForSave } from '../entries/workflow/commands.js'
import { readDraftRows } from '../entries/workflow/drafts.js'
import {
  deleteDraftSearchEntry,
  refreshDraftSearchEntriesForEntry,
} from '../entries/workflow/draftSearch.js'
import { isEqualJsonValue } from '../lib/data.js'
import type { CmsCollection, MutationCtx } from '../lib/types.js'
import { asTransitionEntryId, type TransitionOutput } from './model.js'

export async function applyTransitionOutput(
  ctx: MutationCtx,
  args: {
    entry: Doc<'entries'>
    output: TransitionOutput
    collection: CmsCollection
    actor: string
    now: number
  },
): Promise<void> {
  const drafts = await readDraftRows(ctx, args.entry._id)
  const parentEntryId =
    args.output.parentEntryId === null ? null : asTransitionEntryId(ctx, args.output.parentEntryId)
  const sharedUpdated =
    args.entry.slug !== args.output.slug ||
    args.entry.parentEntryId !== parentEntryId ||
    args.entry.orderRank !== args.output.orderRank ||
    args.entry.nodeKind !== args.output.nodeKind ||
    !isEqualJsonValue(args.entry.shared, args.output.shared)
  const upsertedLocales = new Set<string>()
  const removedLocales = new Set<string>()
  const allLocales = new Set([...Object.keys(drafts.byLocale), ...Object.keys(args.output.locales)])

  for (const locale of allLocales) {
    const existing = drafts.byLocale[locale]
    const desired = args.output.locales[locale]
    if (!desired) {
      if (existing) {
        await ctx.db.delete(existing._id)
        await deleteAssetRefsForSource(
          ctx,
          { sourceKind: 'draft', sourceId: `${args.entry._id}:${locale}` },
          'canonical',
        )
        await deleteDraftSearchEntry(ctx, args.entry._id, locale)
        removedLocales.add(locale)
      }
      continue
    }
    const changed =
      !existing ||
      existing.slug !== desired.slug ||
      existing.bodyMdc !== desired.bodyMdc ||
      !isEqualJsonValue(existing.values, desired.values)
    if (!changed) continue
    const payload = {
      entryId: args.entry._id,
      locale,
      slug: desired.slug,
      values: desired.values,
      bodyMdc: desired.bodyMdc,
      version: (existing?.version ?? 0) + 1,
      updatedBy: args.actor,
      updatedAt: args.now,
    }
    if (existing) await ctx.db.replace(existing._id, payload)
    else await ctx.db.insert('entryLocaleDrafts', payload)
    upsertedLocales.add(locale)
  }

  if (!sharedUpdated && upsertedLocales.size === 0 && removedLocales.size === 0) return
  await ctx.db.patch(args.entry._id, {
    ...(sharedUpdated
      ? {
          slug: args.output.slug,
          parentEntryId,
          orderRank: args.output.orderRank,
          nodeKind: args.output.nodeKind,
          shared: args.output.shared,
          sharedVersion: args.entry.sharedVersion + 1,
        }
      : {}),
    draftVersion: args.entry.draftVersion + 1,
    updatedBy: args.actor,
    updatedAt: args.now,
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: args.entry._id,
    collection: args.entry.collection,
    sharedUpdated,
    affectedLocales: [...upsertedLocales],
  })
  await refreshDraftSearchEntriesForEntry(ctx, args.entry._id, args.collection)
  for (const locale of removedLocales) {
    await deleteDraftSearchEntry(ctx, args.entry._id, locale)
  }
}
