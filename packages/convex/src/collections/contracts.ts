import { getCollection as getCollectionArgs } from '@lupinum/ginko-cms-contract/convex/schemas/collections.js'
import {
  collectionDocValidator,
  collectionListItemValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { canRead } from '../auth/checks.js'
import { callerQuery } from '../functions.js'
import { getCollection as readCollection, listInstalledCollections } from '../lib/collections.js'
import { getCmsSettings, resolveLocaleText } from '../lib/locale.js'
import type { QueryOrMutationCtx } from '../lib/types.js'

async function getDefaultLocale(ctx: QueryOrMutationCtx) {
  const settings = await getCmsSettings(ctx)
  return (
    settings?.locales.find((locale) => locale.isDefault)?.code ?? settings?.locales[0]?.code ?? 'en'
  )
}

function mapCollectionDoc(
  collection: NonNullable<Awaited<ReturnType<typeof readCollection>>>,
  locale: string,
) {
  return {
    _id: collection.slug,
    slug: collection.slug,
    label: resolveLocaleText(collection.label, locale),
    labelMap: collection.label,
    type: collection.type,
    icon: collection.icon ?? null,
    routing: collection.routing,
    pathPrefix: collection.routing.pathPrefix,
    mode: collection.routing.mode ?? 'route',
    slugMode: collection.routing.slugMode ?? 'shared',
    rootSlug: collection.routing.rootSlug ?? null,
    singleton: collection.routing.singleton ?? false,
    locales: collection.locales,
    fields: collection.fields,
    settings: collection.settings ?? {},
    contract: collection.contract,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    updatedBy: collection.updatedBy,
  }
}

function mapCollectionListItem(
  collection: NonNullable<Awaited<ReturnType<typeof readCollection>>>,
  defaultLocale: string,
) {
  return {
    _id: collection.slug,
    slug: collection.slug,
    label: resolveLocaleText(collection.label, defaultLocale),
    labelMap: collection.label,
    type: collection.type,
    icon: collection.icon ?? null,
    routing: collection.routing,
    pathPrefix: collection.routing.pathPrefix,
    mode: collection.routing.mode ?? 'route',
    slugMode: collection.routing.slugMode ?? 'shared',
    rootSlug: collection.routing.rootSlug ?? null,
    singleton: collection.routing.singleton ?? false,
    locales: collection.locales,
    fieldCount: collection.fields.length,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    updatedBy: collection.updatedBy,
  }
}

export const listCollections = callerQuery.protected({
  acceptsTrustedCaller: true,
  id: 'collections:listCollections',
  args: {},
  guard: canRead,
  returns: v.array(collectionListItemValidator),
  handler: async (ctx) => {
    const defaultLocale = await getDefaultLocale(ctx)

    const collections = await listInstalledCollections(ctx)
    const result = []

    for (const collection of collections) {
      result.push(mapCollectionListItem(collection, defaultLocale))
    }

    return result
  },
})

export const getCollection = callerQuery.protected({
  acceptsTrustedCaller: true,
  id: 'collections:getCollection',
  args: getCollectionArgs.args,
  guard: canRead,
  returns: v.union(v.null(), collectionDocValidator),
  handler: async (ctx, args) => {
    const collection = await readCollection(ctx, args.slug)
    if (!collection) return null
    return mapCollectionDoc(collection, await getDefaultLocale(ctx))
  },
})
