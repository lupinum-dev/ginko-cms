import type { Doc } from '../../_generated/dataModel.js'
import { isRouteBackedCollection, needsStableId } from '../../lib/collections.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../../lib/paths.js'
import type { CmsCollection } from '../../lib/types.js'
import { validatePublicPath, type PublicTreePathOptions } from './publicTree.js'

export function publicSegment(
  collection: CmsCollection,
  entry: Doc<'entries'>,
  slug: string,
): string {
  if (!isRouteBackedCollection(collection)) {
    const path = validatePublicPath(`/${entry.stableId}`)
    // Data-only projections need a stored index segment, but never expose it as
    // a route. Preserve simple stable IDs and use the immutable entry ID when a
    // portable canonical key contains path separators or another unsafe value.
    return path.ok && path.segments.length === 1 && path.segments[0] === entry.stableId
      ? entry.stableId
      : String(entry._id)
  }
  return needsStableId(collection) ? `${slug}-${entry.stableId}` : slug
}

export function publicTreeOptions(
  collection: CmsCollection,
  locale: string,
): PublicTreePathOptions {
  return {
    pathPrefix: pathPrefixForLocale(collection, locale),
    rootSlug: rootSlugForLocale(collection, locale),
  }
}
