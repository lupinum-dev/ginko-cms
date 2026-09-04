import type {
  page as pageArgs,
  routeMeta as routeMetaArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/public.js'
import type { ObjectType } from 'convex/values'

import { getActivePublicPageByStableId } from '../entries/projections.js'
import { resolvePublicRoute } from '../entries/workflow/publicTree.js'
import { throwCmsError } from '../errors.js'
import {
  assertCollectionSupportsLocale,
  getCollection,
  getCollectionDefaultLocale,
  needsStableId,
} from '../lib/collections.js'
import { parseStableIdFromPath, pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { QueryCtx } from '../lib/types.js'
import { toGinkoPageResult, type PublicTranslationSummary } from '../publicReadAdapter.js'
import { getTranslationsForEntry, mapPublicEntry, type PublicEntryRow } from './entries.js'
import {
  assertPageLookup,
  assertRouteBackedCollection,
  resolvePublicLocaleChain,
  validatePublicTextArgs,
  type CollectionDoc,
} from './validation.js'

type PageArgs = ObjectType<typeof pageArgs.args>
type RouteMetaArgs = ObjectType<typeof routeMetaArgs.args>

async function resolvePublicPage(
  ctx: QueryCtx,
  args: {
    collection: CollectionDoc
    locale: string
    path?: string
    ref?: string
    fallback?: boolean | string[]
  },
) {
  const chain = args.ref ? await resolvePublicLocaleChain(ctx, args) : [args.locale]
  let requestedPath = args.path ?? args.ref ?? ''
  let projected: PublicEntryRow | null = null
  let translations: PublicTranslationSummary[] = []
  let redirectTo: string | null = null

  for (const locale of chain) {
    if (args.ref) {
      projected = await getActivePublicPageByStableId(ctx, args.collection.slug, locale, args.ref)
      if (projected) {
        translations = await getTranslationsForEntry(ctx, args.collection.slug, projected.entryId)
        break
      }
      continue
    }

    if (!args.path) {
      return throwCmsError('INVALID_QUERY', 'A public page lookup requires path or ref.')
    }
    requestedPath = args.path
    const route = await resolvePublicRoute(ctx, {
      collection: args.collection.slug,
      locale,
      path: args.path,
      options: {
        pathPrefix: pathPrefixForLocale(args.collection, locale),
        rootSlug: rootSlugForLocale(args.collection, locale),
      },
    })
    if (route.kind === 'entry') {
      projected = route.row
    } else if (route.kind === 'redirect') {
      projected = route.target.row
      redirectTo = route.targetPath
    }
    if (projected) {
      translations = await getTranslationsForEntry(ctx, args.collection.slug, projected.entryId)
      break
    }

    if (!needsStableId(args.collection)) continue
    const stableId = parseStableIdFromPath(args.path)
    if (stableId) {
      projected = await getActivePublicPageByStableId(ctx, args.collection.slug, locale, stableId)
    }
    if (projected) {
      translations = await getTranslationsForEntry(ctx, args.collection.slug, projected.entryId)
      break
    }
  }

  return { requestedPath, projected, translations, redirectTo }
}

export async function pageHandler(ctx: QueryCtx, args: PageArgs) {
  validatePublicTextArgs(args)
  assertPageLookup(args)
  const collection = await getCollection(ctx, args.collection)
  if (!collection) {
    return toGinkoPageResult({
      collection: args.collection,
      requestedLocale: args.locale,
      requestedPath: args.path ?? args.ref ?? '',
      result: { page: null, redirectTo: null },
    })
  }
  assertRouteBackedCollection(collection)
  assertCollectionSupportsLocale(collection, args.locale)

  const { requestedPath, projected, translations, redirectTo } = await resolvePublicPage(ctx, {
    collection,
    locale: args.locale,
    path: args.path,
    ref: args.ref,
    fallback: args.fallback,
  })
  if (!projected) {
    return toGinkoPageResult({
      collection: args.collection,
      requestedLocale: args.locale,
      requestedPath,
      result: { page: null, redirectTo: null },
      defaultLocale: getCollectionDefaultLocale(collection),
    })
  }

  const mapped = await mapPublicEntry(ctx, projected, collection)
  return toGinkoPageResult({
    collection: args.collection,
    requestedLocale: args.locale,
    requestedPath,
    result: {
      page: mapped,
      redirectTo: redirectTo ?? (args.ref || mapped.path === requestedPath ? null : mapped.path),
    },
    translations,
    defaultLocale: getCollectionDefaultLocale(collection),
  })
}

export async function routeMetaHandler(ctx: QueryCtx, args: RouteMetaArgs) {
  validatePublicTextArgs(args)
  assertPageLookup(args)
  const collection = await getCollection(ctx, args.collection)
  if (!collection) {
    return toGinkoPageResult({
      collection: args.collection,
      requestedLocale: args.locale,
      requestedPath: args.path ?? args.ref ?? '',
      result: { page: null, redirectTo: null },
    })
  }
  assertRouteBackedCollection(collection)
  assertCollectionSupportsLocale(collection, args.locale)

  const { requestedPath, projected, translations, redirectTo } = await resolvePublicPage(ctx, {
    collection,
    locale: args.locale,
    path: args.path,
    ref: args.ref,
    fallback: args.fallback,
  })
  if (!projected) {
    return toGinkoPageResult({
      collection: args.collection,
      requestedLocale: args.locale,
      requestedPath,
      result: { page: null, redirectTo: null },
      defaultLocale: getCollectionDefaultLocale(collection),
    })
  }

  const mapped = {
    ...(await mapPublicEntry(ctx, projected, collection)),
    data: {},
    assetFacts: [],
  }
  return toGinkoPageResult({
    collection: args.collection,
    requestedLocale: args.locale,
    requestedPath,
    result: {
      page: mapped,
      redirectTo: redirectTo ?? (args.ref || mapped.path === requestedPath ? null : mapped.path),
    },
    translations,
    defaultLocale: getCollectionDefaultLocale(collection),
  })
}
