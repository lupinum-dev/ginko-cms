// Slug uniqueness enforcement and recursive path recomputation.
// Distinct from ../lib/paths.ts which handles path assembly, stable IDs, and
// ancestor resolution. These two modules are complementary: paths.ts computes
// what a path should be; this module ensures slugs are unique and propagates
// path updates through the entry tree.
import type { Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import { toStringId } from '../lib/ids.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'

export async function ensureSharedSlugUnique(
  ctx: QueryOrMutationCtx,
  collectionId: Id<'collections'>,
  baseSlug: string,
  excludeEntryId?: Id<'entries'>,
) {
  const existing = await ctx.db
    .query('entries')
    .withIndex('by_collection_slug', (q) =>
      q.eq('collectionId', collectionId).eq('baseSlug', baseSlug),
    )
    .collect()

  const conflict = existing.find((entry: EntryDoc) => entry._id !== excludeEntryId)
  if (conflict) {
    throwCmsError('ENTRY_SLUG_CONFLICT', `Slug "${baseSlug}" already exists in this collection`, {
      baseSlug,
      collectionId: toStringId(collectionId),
    })
  }
}
