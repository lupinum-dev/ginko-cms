import { getCollection as getCollectionArgs } from '@lupinum/ginko-cms-contract/convex/schemas/collections.js'
import {
  collectionDocValidator,
  collectionListItemValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { canRead } from '../auth/checks.js'
import { callerQuery } from '../functions.js'
import { getCollectionOrThrow } from '../lib/collections.js'
import { toStringId } from '../lib/ids.js'
import { resolveLocaleText } from '../lib/locale.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import { mapCollectionListItem } from './sync.js'

async function getDefaultLocale(ctx: QueryOrMutationCtx) {
  const settings = await ctx.db
    .query('cmsSettings')
    .withIndex('by_key', (q) => q.eq('key', 'site'))
    .first()
  return (
    settings?.locales.find((locale) => locale.isDefault)?.code ?? settings?.locales[0]?.code ?? 'en'
  )
}

function numberFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

async function getLastImportRunForCollection(ctx: QueryOrMutationCtx, collectionSlug: string) {
  const runs = await ctx.db
    .query('collectionImportRuns')
    .withIndex('by_created_at')
    .order('desc')
    .take(20)
  const run = runs.find((candidate) => candidate.collectionSlugs.includes(collectionSlug))
  if (!run) return null
  const summary =
    typeof run.summary === 'object' && run.summary !== null && !Array.isArray(run.summary)
      ? run.summary
      : {}
  return {
    importRunId: run.importRunId,
    kind: run.kind,
    status: run.status ?? (run.kind === 'preview' ? 'previewed' : 'applied'),
    publish: run.publish,
    blockerCount: numberFrom(summary.blockerCount),
    warningCount: numberFrom(summary.warningCount),
    publishedCount: numberFrom(summary.publishedCount),
    createdAt: run.createdAt,
  }
}

async function mapCollectionDoc(
  ctx: QueryOrMutationCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  locale: string,
) {
  const lastImportRun = await getLastImportRunForCollection(ctx, collection.slug)
  return {
    _id: toStringId(collection._id),
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
    lastImportRun,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    updatedBy: collection.updatedBy,
  }
}

export const listCollections = callerQuery.protected({
  identityForwardingFunctionRef: 'collections:listCollections',
  args: {},
  guard: canRead,
  returns: v.array(collectionListItemValidator),
  handler: async (ctx) => {
    const defaultLocale = await getDefaultLocale(ctx)

    const rawCollections = await ctx.db.query('collections').collect()
    const result = []

    for (const raw of rawCollections) {
      const collection = await getCollectionOrThrow(ctx, raw.slug)
      const entries = await ctx.db
        .query('entries')
        .withIndex('by_collection_status', (q) => q.eq('collectionId', collection._id))
        .collect()
      result.push(mapCollectionListItem(collection, defaultLocale, entries.length))
    }

    return result
  },
})

export const getCollection = callerQuery.protected({
  identityForwardingFunctionRef: 'collections:getCollection',
  args: getCollectionArgs.args,
  guard: canRead,
  returns: v.union(v.null(), collectionDocValidator),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('collections')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()
    if (!existing) return null

    const collection = await getCollectionOrThrow(ctx, args.slug)
    return mapCollectionDoc(ctx, collection, await getDefaultLocale(ctx))
  },
})
