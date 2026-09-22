/** Field-level compare-and-set for a shared working version.
 *
 * Objects and arrays inside a field (including a rich-text body) are atomic.
 * This intentionally does not claim character-level collaborative editing.
 */
import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import { isEqualJsonValue } from '../../lib/data.js'
import type { MutationCtx } from '../../lib/types.js'
import { readDraftRows, type SaveDraftPatch } from './drafts.js'

function assertSameKeys(before: object, after: object, path: string): void {
  const left = Object.keys(before).sort()
  const right = Object.keys(after).sort()
  if (!isEqualJsonValue(left, right)) {
    throwCmsError('ENTRY_DRAFT_BASE_INVALID', 'Every edited value needs its original value.', {
      path,
    })
  }
}

function mergeValues(
  before: JsonObject,
  after: JsonObject,
  current: JsonObject,
  path: string,
  conflicts: string[],
): JsonObject | undefined {
  const result = new Map(Object.entries(current))
  let changed = false
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const had = Object.hasOwn(before, key)
    const has = Object.hasOwn(after, key)
    if (had === has && isEqualJsonValue(before[key], after[key])) continue
    if (had !== Object.hasOwn(current, key) || !isEqualJsonValue(before[key], current[key])) {
      conflicts.push(`${path}.${key}`)
      continue
    }
    if (has) result.set(key, after[key]!)
    else result.delete(key)
    changed = true
  }
  return changed ? Object.fromEntries(result) : undefined
}

function scalarChanged(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  current: JsonValue | undefined,
  path: string,
  conflicts: string[],
): boolean {
  if (isEqualJsonValue(before, after)) return false
  if (!isEqualJsonValue(before, current)) conflicts.push(path)
  return true
}

export async function mergeDraftPatch(
  ctx: MutationCtx,
  entry: Doc<'entries'>,
  before: SaveDraftPatch,
  after: SaveDraftPatch,
  localeDraftIds: Record<string, string>,
): Promise<SaveDraftPatch> {
  assertSameKeys(before, after, 'patch')
  assertSameKeys(localeDraftIds, after.locales ?? {}, 'localeDraftIds')
  const conflicts: string[] = []
  const patch: SaveDraftPatch = {}
  if (before.shared && after.shared) {
    assertSameKeys(before.shared, after.shared, 'shared')
    const original = before.shared
    const proposed = after.shared
    const shared: NonNullable<SaveDraftPatch['shared']> = {}
    if (original.shared && proposed.shared) {
      const values = mergeValues(
        original.shared,
        proposed.shared,
        entry.shared,
        'shared.fields',
        conflicts,
      )
      if (values) shared.shared = values
    }
    if (scalarChanged(original.slug, proposed.slug, entry.slug, 'shared.slug', conflicts)) {
      shared.slug = proposed.slug
    }
    if (
      scalarChanged(
        original.parentEntryId,
        proposed.parentEntryId,
        entry.parentEntryId,
        'shared.parentEntryId',
        conflicts,
      )
    ) {
      shared.parentEntryId = proposed.parentEntryId
    }
    if (
      scalarChanged(
        original.orderRank,
        proposed.orderRank,
        entry.orderRank,
        'shared.orderRank',
        conflicts,
      )
    ) {
      shared.orderRank = proposed.orderRank
    }
    if (
      scalarChanged(
        original.nodeKind,
        proposed.nodeKind,
        entry.nodeKind,
        'shared.nodeKind',
        conflicts,
      )
    ) {
      shared.nodeKind = proposed.nodeKind
    }
    if (Object.keys(shared).length) patch.shared = shared
  }
  if (before.locales && after.locales) {
    assertSameKeys(before.locales, after.locales, 'locales')
    const rows = await readDraftRows(ctx, entry._id)
    const locales: NonNullable<SaveDraftPatch['locales']> = {}
    for (const [locale, proposed] of Object.entries(after.locales)) {
      const original = before.locales[locale]!
      assertSameKeys(original, proposed, `locales.${locale}`)
      const current = rows.byLocale[locale]
      if (!current) {
        throwCmsError(
          'ENTRY_LOCALE_DRAFT_MISSING',
          'Create this language version before editing it.',
          { locale },
        )
      }
      if (localeDraftIds[locale] !== String(current._id)) {
        throwCmsError(
          'ENTRY_DRAFT_LOCALE_REPLACED',
          'This language version was replaced. Review the current version before saving your preserved changes.',
          { locale },
        )
      }
      const localized: NonNullable<SaveDraftPatch['locales']>[string] = {}
      if (original.values && proposed.values) {
        const values = mergeValues(
          original.values,
          proposed.values,
          current.values,
          `locales.${locale}.fields`,
          conflicts,
        )
        if (values) localized.values = values
      }
      if (
        scalarChanged(
          original.slug,
          proposed.slug,
          current.slug,
          `locales.${locale}.slug`,
          conflicts,
        )
      ) {
        localized.slug = proposed.slug
      }
      if (
        scalarChanged(
          original.bodyMdc,
          proposed.bodyMdc,
          current.bodyMdc,
          `locales.${locale}.bodyMdc`,
          conflicts,
        )
      ) {
        localized.bodyMdc = proposed.bodyMdc
      }
      if (Object.keys(localized).length) locales[locale] = localized
    }
    if (Object.keys(locales).length) patch.locales = locales
  }
  if (conflicts.length) {
    throwCmsError(
      'ENTRY_DRAFT_FIELD_CONFLICT',
      'Someone else changed the same content. Your changes have not been discarded.',
      {
        conflicts,
        actualDraftVersion: entry.draftVersion,
      },
    )
  }
  return patch
}
