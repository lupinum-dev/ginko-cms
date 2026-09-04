import type { Doc, Id } from '../../../_generated/dataModel.js'
import type { QueryOrMutationCtx } from '../../../lib/types.js'
import {
  MAX_PUBLIC_TREE_DEPTH,
  PublicTreeInvariantError,
  type PublicTreePathOptions,
} from './model.js'
import { publicPathFromTreeSegments } from './pathResolution.js'

async function readPublicRow(
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
  locale: string,
): Promise<Doc<'publicEntries'> | null> {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entryId).eq('locale', locale))
    .take(2)
  if (rows.length > 1) {
    throw new PublicTreeInvariantError(
      'duplicate-entry-locale',
      `Entry ${entryId} has more than one ${locale} public row.`,
    )
  }
  return rows[0] ?? null
}

/** Resolve a bounded route page while reading each shared ancestor at most once. */
export async function publicPathsForEntries(
  ctx: QueryOrMutationCtx,
  rows: Array<Doc<'publicEntries'>>,
  options?: PublicTreePathOptions,
): Promise<Map<string, string | null>> {
  const rowsByEntryId = new Map<string, Doc<'publicEntries'> | null>(
    rows.map((row) => [String(row.entryId), row]),
  )
  const readRow = async (entryId: Id<'entries'>, locale: string) => {
    const key = String(entryId)
    if (rowsByEntryId.has(key)) return rowsByEntryId.get(key) ?? null
    const row = await readPublicRow(ctx, entryId, locale)
    rowsByEntryId.set(key, row)
    return row
  }

  const paths = new Map<string, string | null>()
  for (const leaf of rows) {
    const reverseChain: Doc<'publicEntries'>[] = []
    const seen = new Set<string>()
    let current: Doc<'publicEntries'> | null = leaf
    let reachable = true
    while (current) {
      const currentId = String(current.entryId)
      if (
        current.collection !== leaf.collection ||
        current.locale !== leaf.locale ||
        seen.has(currentId) ||
        reverseChain.length >= MAX_PUBLIC_TREE_DEPTH
      ) {
        reachable = false
        break
      }
      seen.add(currentId)
      reverseChain.push(current)
      if (current.parentEntryId === null) break
      current = await readRow(current.parentEntryId, leaf.locale)
      if (!current) reachable = false
    }
    paths.set(
      String(leaf.entryId),
      reachable
        ? publicPathFromTreeSegments(
            reverseChain.reverse().map((row) => row.slug),
            options,
          )
        : null,
    )
  }
  return paths
}
