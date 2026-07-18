import type { Doc } from '../_generated/dataModel.js'
import { inspectPublicEntryReachability } from '../entries/workflow/publicTree.js'
import { throwCmsError } from '../errors.js'
import { assertCollectionSupportsLocale, getCollectionOrThrow } from '../lib/collections.js'
import { toStringId } from '../lib/ids.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { QueryOrMutationCtx } from '../lib/types.js'

const REDIRECT_INVENTORY_MAX_PAGE_SIZE = 50

type RedirectInventoryCursor = {
  v: 1
  kind: 'redirectInventory'
  collection: string
  locale: string
  state: Doc<'redirects'>['state']
  updatedAt: number
  redirectId: string
}

function parseCursor(
  value: string | null,
  expected: Pick<RedirectInventoryCursor, 'collection' | 'locale' | 'state'>,
): RedirectInventoryCursor | null {
  if (!value) return null
  let parsed: Partial<RedirectInventoryCursor>
  try {
    parsed = JSON.parse(value) as Partial<RedirectInventoryCursor>
  } catch {
    throwCmsError('INVALID_CURSOR', 'Invalid redirect inventory cursor.')
  }
  if (
    parsed.v !== 1 ||
    parsed.kind !== 'redirectInventory' ||
    parsed.collection !== expected.collection ||
    parsed.locale !== expected.locale ||
    parsed.state !== expected.state ||
    typeof parsed.updatedAt !== 'number' ||
    !Number.isFinite(parsed.updatedAt) ||
    typeof parsed.redirectId !== 'string'
  ) {
    throwCmsError('INVALID_CURSOR', 'Invalid redirect inventory cursor.')
  }
  return parsed as RedirectInventoryCursor
}

export async function readRedirectInventorySourcePage(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    state: Doc<'redirects'>['state']
    cursor: RedirectInventoryCursor | null
    limit: number
  },
) {
  const take = args.limit + 1
  const cursor = args.cursor
  const sameTimestamp = cursor
    ? await ctx.db
        .query('redirects')
        .withIndex('by_collection_locale_state_updatedAt_redirectId', (query) =>
          query
            .eq('collection', args.collection)
            .eq('locale', args.locale)
            .eq('state', args.state)
            .eq('updatedAt', cursor.updatedAt)
            .lt('redirectId', cursor.redirectId),
        )
        .order('desc')
        .take(take)
    : []
  const remaining = take - sameTimestamp.length
  const older =
    remaining > 0
      ? await ctx.db
          .query('redirects')
          .withIndex('by_collection_locale_state_updatedAt_redirectId', (query) => {
            const scope = query
              .eq('collection', args.collection)
              .eq('locale', args.locale)
              .eq('state', args.state)
            return cursor ? scope.lt('updatedAt', cursor.updatedAt) : scope
          })
          .order('desc')
          .take(remaining)
      : []
  const rows = [...sameTimestamp, ...older]
  const page = rows.slice(0, args.limit)
  const last = page.at(-1)
  const isDone = rows.length <= args.limit
  return {
    page,
    isDone,
    continueCursor:
      isDone || !last
        ? null
        : JSON.stringify({
            v: 1,
            kind: 'redirectInventory',
            collection: args.collection,
            locale: args.locale,
            state: args.state,
            updatedAt: last.updatedAt,
            redirectId: last.redirectId,
          } satisfies RedirectInventoryCursor),
  }
}

function treeOptions(collection: Awaited<ReturnType<typeof getCollectionOrThrow>>, locale: string) {
  return {
    pathPrefix: pathPrefixForLocale(collection, locale),
    rootSlug: rootSlugForLocale(collection, locale),
  }
}

async function targetPath(
  ctx: QueryOrMutationCtx,
  redirect: Doc<'redirects'>,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
): Promise<string | null> {
  const target = await inspectPublicEntryReachability(ctx, {
    collection: redirect.collection,
    locale: redirect.locale,
    entryId: redirect.targetEntryId,
    options: treeOptions(collection, redirect.locale),
  })
  return target.reachable ? target.path : null
}

export async function readRedirectTargetPath(ctx: QueryOrMutationCtx, redirect: Doc<'redirects'>) {
  const collection = await getCollectionOrThrow(ctx, redirect.collection)
  assertCollectionSupportsLocale(collection, redirect.locale)
  return await targetPath(ctx, redirect, collection)
}

export function mapRedirectInventoryItem(
  redirect: Doc<'redirects'>,
  resolvedTargetPath: string | null,
) {
  return {
    id: redirect.redirectId,
    collection: redirect.collection,
    locale: redirect.locale,
    kind: redirect.kind,
    fromPath: redirect.fromPath,
    targetEntryId: toStringId(redirect.targetEntryId),
    targetPath: resolvedTargetPath,
    targetReachable: resolvedTargetPath !== null,
    state: redirect.state,
    statusCode: redirect.statusCode,
    source: redirect.source,
    operationId: redirect.operationId,
    createdBy: redirect.createdBy,
    createdAt: redirect.createdAt,
    retiredBy: redirect.retiredBy,
    retiredAt: redirect.retiredAt,
    updatedAt: redirect.updatedAt,
  }
}

export async function listRedirectInventory(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    state: Doc<'redirects'>['state']
    paginationOpts: { cursor: string | null; numItems: number }
  },
) {
  const collection = await getCollectionOrThrow(ctx, args.collection)
  assertCollectionSupportsLocale(collection, args.locale)
  const result = await readRedirectInventorySourcePage(ctx, {
    collection: args.collection,
    locale: args.locale,
    state: args.state,
    cursor: parseCursor(args.paginationOpts.cursor, args),
    limit: Math.min(
      Math.max(Math.floor(args.paginationOpts.numItems), 1),
      REDIRECT_INVENTORY_MAX_PAGE_SIZE,
    ),
  })
  return {
    page: await Promise.all(
      result.page.map(async (redirect) =>
        mapRedirectInventoryItem(redirect, await targetPath(ctx, redirect, collection)),
      ),
    ),
    isDone: result.isDone,
    continueCursor: result.continueCursor,
  }
}
