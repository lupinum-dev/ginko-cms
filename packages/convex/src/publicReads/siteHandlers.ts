import type {
  singleton as singletonArgs,
  siteData as siteDataArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/public.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import type { ObjectType } from 'convex/values'

import { publicPathForEntry } from '../entries/workflow/publicTree.js'
import {
  assertCollectionSupportsLocale,
  getCollection,
  isRouteBackedCollection,
} from '../lib/collections.js'
import { getLocaleChain } from '../lib/locale.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { QueryCtx } from '../lib/types.js'
import { toGinkoSingletonResult, toGinkoSiteDataResult } from '../publicReadAdapter.js'
import {
  getTranslationsForEntry,
  mapPublicPageEntryAtKnownPath,
  routingLocalesForCollection,
} from './entries.js'
import { validatePublicTextArgs } from './validation.js'

type SingletonArgs = ObjectType<typeof singletonArgs.args>
type SiteDataArgs = ObjectType<typeof siteDataArgs.args>

export async function singletonHandler(ctx: QueryCtx, args: SingletonArgs) {
  validatePublicTextArgs(args)
  const requestedLocale = args.locale ?? 'default'
  const collection = await getCollection(ctx, args.name)
  if (!args.locale) {
    return toGinkoSingletonResult({
      name: args.name,
      requestedLocale,
      entry: null,
      failure: 'missing_locale',
    })
  }
  const locale = args.locale
  if (!collection) {
    return toGinkoSingletonResult({
      name: args.name,
      requestedLocale,
      entry: null,
      failure: 'unknown_collection',
    })
  }
  if (!collection.routing.singleton) {
    return toGinkoSingletonResult({
      name: args.name,
      requestedLocale,
      entry: null,
      failure: 'not_singleton',
    })
  }
  if (!isRouteBackedCollection(collection)) {
    return toGinkoSingletonResult({
      name: args.name,
      requestedLocale,
      entry: null,
      failure: 'mode_mismatch',
    })
  }
  assertCollectionSupportsLocale(collection, locale)

  const row = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_orderKey', (query) =>
      query.eq('collection', collection.slug).eq('locale', locale),
    )
    .first()
  const path = row
    ? await publicPathForEntry(ctx, row, {
        pathPrefix: pathPrefixForLocale(collection, locale),
        rootSlug: rootSlugForLocale(collection, locale),
      })
    : null
  const routingLocales = path ? await routingLocalesForCollection(ctx, collection) : []

  return toGinkoSingletonResult({
    name: args.name,
    requestedLocale: locale,
    entry:
      row && path
        ? await mapPublicPageEntryAtKnownPath(ctx, row, path, routingLocales, collection)
        : null,
    translations:
      row && path ? await getTranslationsForEntry(ctx, collection.slug, row.entryId) : [],
    failure: row && path ? null : 'no_published_entry',
  })
}

export async function siteDataHandler(ctx: QueryCtx, args: SiteDataArgs) {
  validatePublicTextArgs(args)
  const row = await ctx.db
    .query('siteData')
    .withIndex('by_key', (query) => query.eq('key', args.key))
    .first()
  const requestedLocale = args.locale ?? 'default'
  if (!row || row.visibility !== 'public') {
    return toGinkoSiteDataResult({
      key: args.key,
      requestedLocale,
      data: null,
    })
  }
  if (!row.localized || !args.locale) {
    return toGinkoSiteDataResult({
      key: args.key,
      requestedLocale,
      data: row.data ?? null,
    })
  }
  const { chain } = await getLocaleChain(ctx, args.locale)
  const localizedData = row.data as JsonMap | undefined
  for (const locale of chain) {
    const value = localizedData?.[locale]
    if (value !== undefined) {
      return toGinkoSiteDataResult({
        key: args.key,
        requestedLocale: args.locale,
        resolvedLocale: locale,
        data: value,
        fallbacks: locale === args.locale ? [] : [{ path: args.key, from: locale }],
      })
    }
  }
  return toGinkoSiteDataResult({
    key: args.key,
    requestedLocale: args.locale,
    data: null,
  })
}
