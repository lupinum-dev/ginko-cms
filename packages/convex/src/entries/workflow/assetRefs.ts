/**
 * contentAssetRefs writer.
 *
 * This is the single asset-reference read model. It covers asset references in three
 * sources via a discriminator:
 *   - 'draft'    - assets referenced by entryDrafts rows
 *   - 'revision' - assets referenced by entryRevisions snapshots
 *   - 'public'   - assets referenced by publicEntries rows
 *
 * Draft-only references are included so purge protection does not depend on
 * whether content has been published or checkpointed.
 */

import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Id } from '../../_generated/dataModel.js'
import type { MutationCtx } from '../../lib/types.js'

export type AssetRefSourceKind = 'draft' | 'revision' | 'public'

export interface AssetRef {
  assetId: string
  fieldPath: string
  locale: string | null
}

export interface ReplaceAssetRefsInput {
  sourceKind: AssetRefSourceKind
  sourceId: string
  entryId: Id<'entries'>
  collectionId: Id<'collections'>
  refs: AssetRef[]
  now: number
}

/**
 * Replace every contentAssetRefs row for one (sourceKind, sourceId) with
 * the new set. Atomic - all old rows for this source are deleted first,
 * then new rows inserted, in a single mutation.
 */
export async function replaceAssetRefs(
  ctx: MutationCtx,
  input: ReplaceAssetRefsInput,
): Promise<void> {
  const existing = await ctx.db
    .query('contentAssetRefs')
    .withIndex('by_source', (q) =>
      q.eq('sourceKind', input.sourceKind).eq('sourceId', input.sourceId),
    )
    .collect()
  for (const row of existing) {
    await ctx.db.delete(row._id)
  }
  for (const ref of input.refs) {
    await ctx.db.insert('contentAssetRefs', {
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      assetId: ref.assetId,
      fieldPath: ref.fieldPath,
      locale: ref.locale,
      entryId: input.entryId,
      collectionId: input.collectionId,
      updatedAt: input.now,
    })
  }
}

export async function deleteEntryAssetRefsBySourceKind(
  ctx: MutationCtx,
  args: { entryId: Id<'entries'>; sourceKind: AssetRefSourceKind },
): Promise<void> {
  const rows = await ctx.db
    .query('contentAssetRefs')
    .withIndex('by_entry', (q) => q.eq('entryId', args.entryId))
    .collect()
  for (const row of rows) {
    if (row.sourceKind === args.sourceKind) {
      await ctx.db.delete(row._id)
    }
  }
}

/**
 * Detect every asset reference in a JSON payload. Walks the tree looking
 * for any string value that matches the asset-id pattern.
 *
 * This is recursive. Draft saves use it for structured field values; publish
 * uses it for both structured field values and the parsed body AST.
 */
export function extractAssetRefsFromValues(
  values: JsonValue | null | undefined,
  options: { fieldPathPrefix?: string; locale: string | null },
): AssetRef[] {
  const out: AssetRef[] = []
  walkValue(values, options.fieldPathPrefix ?? '', options.locale, out)
  return out
}

/**
 * Detect asset ids in raw body text. Draft saves cannot parse MDC inside a
 * mutation, but purge protection still needs draft-only body references. This
 * catches storage-id style references in markdown image URLs and MDC props.
 */
export function extractAssetRefsFromText(
  text: string | null | undefined,
  options: { fieldPath: string; locale: string | null },
): AssetRef[] {
  if (!text) return []
  const refs: AssetRef[] = []
  for (const match of text.matchAll(STORAGE_REF_GLOBAL_PATTERN)) {
    if (!looksLikeAssetId(match[0])) continue
    refs.push({
      assetId: match[0],
      fieldPath: options.fieldPath,
      locale: options.locale,
    })
  }
  return refs
}

export function uniqueAssetRefs(refs: AssetRef[]): AssetRef[] {
  const seen = new Set<string>()
  const out: AssetRef[] = []
  for (const ref of refs) {
    const key = `${ref.assetId}\u0000${ref.fieldPath}\u0000${ref.locale ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

function walkValue(
  value: JsonValue | null | undefined,
  fieldPath: string,
  locale: string | null,
  out: AssetRef[],
): void {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    if (looksLikeAssetId(value)) {
      out.push({ assetId: value, fieldPath, locale })
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      walkValue(child as JsonValue, `${fieldPath}[${index}]`, locale, out)
    })
    return
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, JsonValue>
    for (const [key, child] of Object.entries(obj)) {
      const nextPath = fieldPath ? `${fieldPath}.${key}` : key
      walkValue(child, nextPath, locale, out)
    }
  }
}

/**
 * Convex asset ids are storage ids that look like base32 strings of fixed
 * length. We use a pattern check rather than a precise validation - the
 * goal is to find references for purge-protection, not to validate.
 */
const LONG_ASSET_ID_PATTERN = /^[a-z0-9]{20,40}$/i
const STORAGE_REF_PATTERN = /^[a-z0-9]+;[a-z_]+$/i
const STORAGE_REF_GLOBAL_PATTERN = /[a-z0-9]{20,40}|[a-z0-9]+;[a-z_]+/gi

function looksLikeAssetId(value: string): boolean {
  if (LONG_ASSET_ID_PATTERN.test(value)) return true
  if (!STORAGE_REF_PATTERN.test(value)) return false
  return value.endsWith(';assets') || value.endsWith(';_storage')
}
