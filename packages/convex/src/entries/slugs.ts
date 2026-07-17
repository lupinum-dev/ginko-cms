// Slug uniqueness enforcement and recursive path recomputation.
// Distinct from ../lib/paths.ts which handles path assembly, stable IDs, and
// ancestor resolution. These two modules are complementary: paths.ts computes
// what a path should be; this module ensures slugs are unique and propagates
// path updates through the entry tree.
import type { Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'

export async function ensureSharedSlugUnique(
  ctx: QueryOrMutationCtx,
  collection: string,
  slug: string,
  excludeEntryId?: Id<'entries'>,
) {
  const existing = await ctx.db
    .query('entries')
    .withIndex('by_collection_slug', (q) =>
      q.eq('collection', collection).eq('slug', slug),
    )
    .collect()

  const conflict = existing.find((entry: EntryDoc) => entry._id !== excludeEntryId)
  if (conflict) {
    throwCmsError('ENTRY_SLUG_CONFLICT', `Slug "${slug}" already exists in this collection`, {
      slug,
      collection,
    })
  }
}
