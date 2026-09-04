import type { MutationCtx, QueryOrMutationCtx } from '../../lib/types.js'

function routeGenerationScope(collection: string, locale: string) {
  return `${collection.length}:${collection}${locale.length}:${locale}`
}

const ROUTE_INVENTORY_COLLECTION = '*'
const ROUTE_INVENTORY_LOCALE = '*'

export async function readRouteGeneration(
  ctx: QueryOrMutationCtx,
  collection: string,
  locale: string,
): Promise<number> {
  const row = await ctx.db
    .query('routeGenerations')
    .withIndex('by_scope', (q) => q.eq('scope', routeGenerationScope(collection, locale)))
    .unique()
  return row?.generation ?? 0
}

export async function bumpRouteGeneration(
  ctx: MutationCtx,
  collection: string,
  locale: string,
  now = Date.now(),
): Promise<number> {
  const generation = await bumpGenerationRow(ctx, collection, locale, now)
  await bumpGenerationRow(ctx, ROUTE_INVENTORY_COLLECTION, ROUTE_INVENTORY_LOCALE, now)
  return generation
}

async function bumpGenerationRow(
  ctx: MutationCtx,
  collection: string,
  locale: string,
  now: number,
): Promise<number> {
  const scope = routeGenerationScope(collection, locale)
  const row = await ctx.db
    .query('routeGenerations')
    .withIndex('by_scope', (q) => q.eq('scope', scope))
    .unique()
  const generation = (row?.generation ?? 0) + 1
  if (row) await ctx.db.patch(row._id, { generation, updatedAt: now })
  else
    await ctx.db.insert('routeGenerations', {
      scope,
      collection,
      locale,
      generation,
      updatedAt: now,
    })
  return generation
}

export function readRouteInventoryGeneration(ctx: QueryOrMutationCtx): Promise<number> {
  return readRouteGeneration(ctx, ROUTE_INVENTORY_COLLECTION, ROUTE_INVENTORY_LOCALE)
}
