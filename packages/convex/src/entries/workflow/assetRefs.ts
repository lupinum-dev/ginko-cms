/**
 * contentAssetRefs writer.
 *
 * This is the single asset-reference read model. It covers asset references in three
 * sources via a discriminator:
 *   - 'draft'    - assets referenced by entries/entryLocaleDrafts
 *   - 'revision' - assets referenced by entryRevisions snapshots
 *   - 'public'   - assets referenced by publicEntries rows
 *
 * Draft-only references are included so purge protection does not depend on
 * whether content has been published or checkpointed.
 */

import type { CmsField, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Id } from '../../_generated/dataModel.js'
import type { MutationCtx } from '../../lib/types.js'
import { invalidateAssetReferenceProof } from '../assetReferenceProof.js'

export type AssetRefSourceKind = 'draft' | 'revision' | 'public'
export type AssetRefWriteMode = 'canonical' | 'repair'

export interface AssetRef {
  assetId: string
  fieldPath: string
  locale: string | null
}

export type AssetRefSourceFence =
  | { kind: 'draftVersion'; version: number }
  | { kind: 'revision'; revisionId: Id<'entryRevisions'>; contentHash: string }
  | { kind: 'publicRevision'; revisionId: Id<'entryRevisions'> }

type AssetRefSourceInput = {
  sourceId: string
  entryId: Id<'entries'>
  collection: string
  refs: AssetRef[]
}

export type ReplaceAssetRefsInput = AssetRefSourceInput &
  (
    | {
        sourceKind: 'draft'
        sourceFence: Extract<AssetRefSourceFence, { kind: 'draftVersion' }>
      }
    | {
        sourceKind: 'revision'
        sourceFence: Extract<AssetRefSourceFence, { kind: 'revision' }>
      }
    | {
        sourceKind: 'public'
        sourceFence: Extract<AssetRefSourceFence, { kind: 'publicRevision' }>
      }
  )

async function deleteAssetRefRowsForSource(
  ctx: MutationCtx,
  input: { sourceKind: AssetRefSourceKind; sourceId: string },
): Promise<void> {
  const existing = await ctx.db
    .query('contentAssetRefs')
    .withIndex('by_source', (q) =>
      q.eq('sourceKind', input.sourceKind).eq('sourceId', input.sourceId),
    )
    .collect()
  for (const row of existing) await ctx.db.delete(row._id)
}

export async function deleteAssetRefsForSource(
  ctx: MutationCtx,
  input: { sourceKind: AssetRefSourceKind; sourceId: string },
  mode: AssetRefWriteMode,
): Promise<void> {
  await deleteAssetRefRowsForSource(ctx, input)
  if (mode === 'canonical') await invalidateAssetReferenceProof(ctx)
}

/**
 * Replace every contentAssetRefs row for one (sourceKind, sourceId) with
 * the new set. Atomic - all old rows for this source are deleted first,
 * then new rows inserted, in a single mutation.
 */
export async function replaceAssetRefs(
  ctx: MutationCtx,
  input: ReplaceAssetRefsInput,
  mode: AssetRefWriteMode,
): Promise<void> {
  await deleteAssetRefRowsForSource(ctx, input)
  const refs = uniqueAssetRefs(input.refs).sort((left, right) =>
    [left.assetId, left.fieldPath, left.locale ?? '']
      .join('\u0000')
      .localeCompare([right.assetId, right.fieldPath, right.locale ?? ''].join('\u0000')),
  )
  for (const ref of refs) {
    await ctx.db.insert('contentAssetRefs', {
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      sourceFence: input.sourceFence,
      assetId: ref.assetId,
      fieldPath: ref.fieldPath,
      locale: ref.locale,
      entryId: input.entryId,
      collection: input.collection,
    })
  }
  if (mode === 'canonical') await invalidateAssetReferenceProof(ctx)
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

/** Extract only schema-declared image fields for public URL resolution. */
export function extractPublicFieldAssetRefs(
  values: JsonValue | null | undefined,
  fields: CmsField[],
  options: { fieldPathPrefix: string; locale: string | null },
): AssetRef[] {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return []
  const out: AssetRef[] = []
  const visitFields = (record: Record<string, JsonValue>, schema: CmsField[], prefix: string) => {
    for (const field of schema) {
      const value = record[field.key]
      const path = `${prefix}.${field.key}`
      if (field.type === 'image' && typeof value === 'string' && looksLikeAssetId(value)) {
        out.push({ assetId: value, fieldPath: path, locale: options.locale })
      } else if (field.type === 'images' && Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'string' && looksLikeAssetId(item)) {
            out.push({ assetId: item, fieldPath: `${path}[${index}]`, locale: options.locale })
          }
        })
      } else if (field.fields?.length && value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              visitFields(item as Record<string, JsonValue>, field.fields!, `${path}[${index}]`)
            }
          })
        } else {
          visitFields(value as Record<string, JsonValue>, field.fields, path)
        }
      }
    }
  }
  visitFields(values as Record<string, JsonValue>, fields, options.fieldPathPrefix)
  return out
}

/** Extract only image source properties from the parsed public body tree. */
export function extractPublicBodyAssetRefs(
  bodyAst: JsonValue | null | undefined,
  options: { locale: string | null },
): AssetRef[] {
  const out: AssetRef[] = []
  const visit = (value: JsonValue, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}[${index}]`))
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, JsonValue>
    const tag = typeof record.tag === 'string' ? record.tag.toLowerCase() : ''
    const props = record.props
    if (
      ['img', 'image', 'proseimg'].includes(tag) &&
      props &&
      typeof props === 'object' &&
      !Array.isArray(props)
    ) {
      const src = (props as Record<string, JsonValue>).src
      if (typeof src === 'string' && looksLikeAssetId(src)) {
        out.push({ assetId: src, fieldPath: `${path}.props.src`, locale: options.locale })
      }
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== 'props') visit(child, `${path}.${key}`)
    }
  }
  if (bodyAst !== undefined && bodyAst !== null) visit(bodyAst, 'bodyAst')
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
