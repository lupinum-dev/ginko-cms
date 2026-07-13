import { normalizeFields } from '@lupinum/ginko-cms-contract/shared/fields/normalize.js'

import type { Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import type { CmsCollection, CmsField, ReadCtx, SlugMode } from './types.js'

export const MAX_EXACT_COLLECTION_ENTRY_COUNT = 1000

export type CollectionEntryCountSnapshot = {
  count: number
  exact: boolean
}

export function getSlugMode(collection: CmsCollection): SlugMode {
  return collection.routing.slugMode ?? 'shared'
}

export function getCollectionMode(collection: CmsCollection): 'route' | 'none' {
  return collection.routing.mode ?? 'route'
}

export function isRouteBackedCollection(collection: CmsCollection): boolean {
  return getCollectionMode(collection) === 'route'
}

export function getCollectionDefaultLocale(
  collection: Pick<CmsCollection, 'locales' | 'settings'>,
  fallback = 'en',
): string {
  const settings = collection.settings
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const configured = settings.defaultLocale
    if (typeof configured === 'string' && collection.locales.includes(configured)) return configured
  }
  return collection.locales[0] ?? fallback
}

export function assertCollectionSupportsLocale(
  collection: Pick<CmsCollection, 'slug' | 'locales'>,
  locale: string,
): void {
  if (collection.locales.includes(locale)) return
  throwCmsError(
    'UNSUPPORTED_LOCALE',
    `Locale "${locale}" is not supported by collection "${collection.slug}".`,
    { collection: collection.slug, locale, supportedLocales: collection.locales },
  )
}

export function isLocalizedSlugMode(collection: CmsCollection): boolean {
  const slugMode = getSlugMode(collection)
  return slugMode === 'localized' || slugMode === 'localizedStable'
}

export function needsStableId(collection: CmsCollection): boolean {
  const slugMode = getSlugMode(collection)
  return slugMode === 'stable' || slugMode === 'localizedStable'
}

export async function getCollectionOrThrow(ctx: ReadCtx, slug: string): Promise<CmsCollection> {
  const collection = await getCollection(ctx, slug)

  if (!collection) {
    throwCmsError('COLLECTION_NOT_FOUND', `Collection "${slug}" does not exist`, { slug })
  }

  return collection
}

export async function getCollection(ctx: ReadCtx, slug: string): Promise<CmsCollection | null> {
  const collection = await ctx.db
    .query('collections')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .first()

  if (!collection) return null

  return {
    ...collection,
    fields: normalizeFields(collection.fields as Array<Partial<CmsField>>),
    routing: {
      mode: collection.routing.mode ?? 'route',
      pathPrefix: collection.routing.pathPrefix,
      slugMode: collection.routing.slugMode ?? 'shared',
      rootSlug: collection.routing.rootSlug ?? null,
      singleton: collection.routing.singleton ?? false,
    },
  }
}

export async function collectionHasEntries(
  ctx: ReadCtx,
  collectionId: Id<'collections'>,
): Promise<boolean> {
  const entry = await ctx.db
    .query('entries')
    .withIndex('by_collection_status', (q) => q.eq('collectionId', collectionId))
    .first()
  return !!entry
}

export async function collectionEntryCountSnapshot(
  ctx: ReadCtx,
  collectionId: Id<'collections'>,
): Promise<CollectionEntryCountSnapshot> {
  const entries = await ctx.db
    .query('entries')
    .withIndex('by_collection_status', (q) => q.eq('collectionId', collectionId))
    .take(MAX_EXACT_COLLECTION_ENTRY_COUNT + 1)
  if (entries.length > MAX_EXACT_COLLECTION_ENTRY_COUNT) {
    return { count: MAX_EXACT_COLLECTION_ENTRY_COUNT, exact: false }
  }
  return { count: entries.length, exact: true }
}
