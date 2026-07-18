import { createExportRun as createExportRunArgs } from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel.js'
import { internalQuery } from '../_generated/server.js'
import { canManagePortability } from '../auth/checks.js'
import { readRouteGeneration } from '../entries/workflow/routeGeneration.js'
import { callerAction, requireCmsContractWriteToken } from '../functions.js'
import { readInstalledCmsContract, type CmsContractWriteToken } from '../lib/installedContract.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import { assertSha256, PORTABLE_ASSET_LIMIT, PORTABLE_DOCUMENT_LIMIT } from './model.js'

export const EXPORT_PAGE_SIZE = 100

export type ExportPreflightScope = {
  collection: string
  locale: string
}

type ExportPreflightGeneration = ExportPreflightScope & {
  generation: number
}

export type ExportPreflightState = {
  v: 1
  kind: 'publishedExportPreflight'
  sourceContentHash: string
  collections: string[]
  scopeIndex: number
  orderKey: string | null
  entryId: string | null
  documentCount: number
  assetSha256s: string[]
  generations: ExportPreflightGeneration[]
  complete: boolean
}

type ExportPreflightPageResult = {
  scanned: number
  documentCount: number
  assetCount: number
  complete: boolean
  cursor: string | null
  preflightToken: string | null
}

export const createExportRunResultValidator = v.object({
  runId: v.string(),
  state: v.literal('capturing'),
  payloadSha256: v.string(),
  leaseGeneration: v.number(),
  expiresAt: v.number(),
  preflight: v.object({ documentCount: v.number(), assetCount: v.number() }),
})

export type CreateExportRunResult = {
  runId: string
  state: 'capturing'
  payloadSha256: string
  leaseGeneration: number
  expiresAt: number
  preflight: { documentCount: number; assetCount: number }
}

function assertExportScopeShape(scope: { collections: string[] }) {
  if (
    scope.collections.length === 0 ||
    scope.collections.length > 100 ||
    scope.collections.some(
      (slug, index) => !slug || (index > 0 && scope.collections[index - 1]! >= slug),
    )
  ) {
    throw new Error('Portable export scope is invalid.')
  }
}

async function resolveExportScope(
  ctx: QueryOrMutationCtx,
  args: { scope: { collections: string[] }; sourceContentHash: string },
) {
  assertSha256(args.sourceContentHash, 'sourceContentHash')
  assertExportScopeShape(args.scope)
  const installed = await readInstalledCmsContract(ctx)
  if (!installed || installed.record.contentHash !== args.sourceContentHash) {
    throw new Error('Portable export source content hash does not match the installed contract.')
  }
  const scopes: ExportPreflightScope[] = []
  for (const slug of args.scope.collections) {
    const collection = installed.content.collections[slug]
    if (!collection) {
      throw new Error(`Portable export collection "${slug}" is absent from the contract.`)
    }
    for (const locale of collection.locales) scopes.push({ collection: slug, locale })
  }
  return { installed, scopes }
}

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function parseExportPreflightState(
  encoded: string,
  expected: {
    sourceContentHash: string
    collections: string[]
    scopes: ExportPreflightScope[]
    requireComplete?: boolean
  },
): ExportPreflightState {
  let parsed: unknown
  try {
    parsed = JSON.parse(encoded)
  } catch {
    throw new Error('Portable export preflight token is invalid.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Portable export preflight token is invalid.')
  }
  const state = parsed as Partial<ExportPreflightState>
  const generations = state.generations
  const assetSha256s = state.assetSha256s
  const hasPosition = state.orderKey !== null || state.entryId !== null
  if (
    state.v !== 1 ||
    state.kind !== 'publishedExportPreflight' ||
    state.sourceContentHash !== expected.sourceContentHash ||
    !Array.isArray(state.collections) ||
    !sameStrings(state.collections, expected.collections) ||
    !Number.isSafeInteger(state.scopeIndex) ||
    state.scopeIndex! < 0 ||
    state.scopeIndex! > expected.scopes.length ||
    (state.orderKey !== null && typeof state.orderKey !== 'string') ||
    (state.entryId !== null && typeof state.entryId !== 'string') ||
    (hasPosition && (typeof state.orderKey !== 'string' || typeof state.entryId !== 'string')) ||
    !Number.isSafeInteger(state.documentCount) ||
    state.documentCount! < 0 ||
    state.documentCount! > PORTABLE_DOCUMENT_LIMIT ||
    !Array.isArray(assetSha256s) ||
    assetSha256s.length > PORTABLE_ASSET_LIMIT ||
    assetSha256s.some((hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash)) ||
    assetSha256s.some((hash, index) => index > 0 && assetSha256s[index - 1]! >= hash) ||
    !Array.isArray(generations) ||
    generations.length !== expected.scopes.length ||
    generations.some((generation, index) => {
      const scope = expected.scopes[index]
      return (
        !scope ||
        generation.collection !== scope.collection ||
        generation.locale !== scope.locale ||
        !Number.isSafeInteger(generation.generation) ||
        generation.generation < 0
      )
    }) ||
    typeof state.complete !== 'boolean' ||
    (state.complete &&
      (state.scopeIndex !== expected.scopes.length ||
        state.orderKey !== null ||
        state.entryId !== null)) ||
    (!state.complete && state.scopeIndex === expected.scopes.length) ||
    (expected.requireComplete === true && !state.complete)
  ) {
    throw new Error('Portable export preflight token is invalid.')
  }
  return state as ExportPreflightState
}

async function assertGenerationsCurrent(
  ctx: QueryOrMutationCtx,
  generations: ExportPreflightGeneration[],
) {
  const current = await Promise.all(
    generations.map(
      async (scope) => await readRouteGeneration(ctx, scope.collection, scope.locale),
    ),
  )
  if (current.some((generation, index) => generation !== generations[index]!.generation)) {
    throw new Error('Portable export preflight is stale; rerun it.')
  }
}

async function initialState(
  ctx: QueryOrMutationCtx,
  args: { sourceContentHash: string; collections: string[]; scopes: ExportPreflightScope[] },
): Promise<ExportPreflightState> {
  const generationValues = await Promise.all(
    args.scopes.map(
      async (scope) => await readRouteGeneration(ctx, scope.collection, scope.locale),
    ),
  )
  return {
    v: 1,
    kind: 'publishedExportPreflight',
    sourceContentHash: args.sourceContentHash,
    collections: args.collections,
    scopeIndex: 0,
    orderKey: null,
    entryId: null,
    documentCount: 0,
    assetSha256s: [],
    generations: args.scopes.map((scope, index) => ({
      ...scope,
      generation: generationValues[index]!,
    })),
    complete: args.scopes.length === 0,
  }
}

export async function readPublishedExportPage(
  ctx: QueryOrMutationCtx,
  scope: ExportPreflightScope,
  position: { orderKey: string | null; entryId: Id<'entries'> | null },
) {
  const indexed = () =>
    ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_orderKey_entry', (query) =>
        query.eq('collection', scope.collection).eq('locale', scope.locale),
      )
  if (position.orderKey === null || position.entryId === null) {
    return await indexed()
      .order('asc')
      .take(EXPORT_PAGE_SIZE + 1)
  }
  const sameOrder = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_orderKey_entry', (query) =>
      query
        .eq('collection', scope.collection)
        .eq('locale', scope.locale)
        .eq('orderKey', position.orderKey!)
        .gt('entryId', position.entryId!),
    )
    .order('asc')
    .take(EXPORT_PAGE_SIZE + 1)
  if (sameOrder.length > EXPORT_PAGE_SIZE) return sameOrder
  const later = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_orderKey_entry', (query) =>
      query
        .eq('collection', scope.collection)
        .eq('locale', scope.locale)
        .gt('orderKey', position.orderKey!),
    )
    .order('asc')
    .take(EXPORT_PAGE_SIZE + 1 - sameOrder.length)
  return [...sameOrder, ...later]
}

const pageResultValidator = v.object({
  scanned: v.number(),
  documentCount: v.number(),
  assetCount: v.number(),
  complete: v.boolean(),
  cursor: v.union(v.string(), v.null()),
  preflightToken: v.union(v.string(), v.null()),
})

export const preflightExportPageInternal = internalQuery({
  args: {
    scope: v.object({ collections: v.array(v.string()) }),
    sourceContentHash: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: pageResultValidator,
  handler: async (ctx, args): Promise<ExportPreflightPageResult> => {
    const { scopes } = await resolveExportScope(ctx, args)
    const expected = {
      sourceContentHash: args.sourceContentHash,
      collections: args.scope.collections,
      scopes,
    }
    const state = args.cursor
      ? parseExportPreflightState(args.cursor, expected)
      : await initialState(ctx, expected)
    if (state.complete) {
      await assertGenerationsCurrent(ctx, state.generations)
      return {
        scanned: 0,
        documentCount: state.documentCount,
        assetCount: state.assetSha256s.length,
        complete: true,
        cursor: null,
        preflightToken: JSON.stringify(state),
      }
    }

    const scope = scopes[state.scopeIndex]!
    const expectedGeneration = state.generations[state.scopeIndex]!
    if (
      (await readRouteGeneration(ctx, scope.collection, scope.locale)) !==
      expectedGeneration.generation
    ) {
      throw new Error('Portable export preflight is stale; rerun it.')
    }
    const entryId = state.entryId === null ? null : ctx.db.normalizeId('entries', state.entryId)
    if (state.entryId !== null && !entryId) {
      throw new Error('Portable export preflight token is invalid.')
    }
    const fetched = await readPublishedExportPage(ctx, scope, {
      orderKey: state.orderKey,
      entryId,
    })
    const rows = fetched.slice(0, EXPORT_PAGE_SIZE)
    const documentCount = state.documentCount + rows.length
    if (documentCount > PORTABLE_DOCUMENT_LIMIT) {
      throw new Error('Portable export exceeds the document limit.')
    }
    const assetSha256s = new Set(state.assetSha256s)
    for (const row of rows) {
      for (const asset of row.assetFacts) {
        assertSha256(asset.sha256, 'Portable export asset sha256')
        assetSha256s.add(asset.sha256)
        if (assetSha256s.size > PORTABLE_ASSET_LIMIT) {
          throw new Error('Portable export exceeds the asset limit.')
        }
      }
    }

    const scopeDone = fetched.length <= EXPORT_PAGE_SIZE
    const last = rows.at(-1)
    const complete = scopeDone && state.scopeIndex + 1 === scopes.length
    const nextState: ExportPreflightState = {
      ...state,
      scopeIndex: scopeDone ? state.scopeIndex + 1 : state.scopeIndex,
      orderKey: scopeDone ? null : (last?.orderKey ?? null),
      entryId: scopeDone ? null : last ? String(last.entryId) : null,
      documentCount,
      assetSha256s: [...assetSha256s].sort(),
      complete,
    }
    if (!scopeDone && !last) {
      throw new Error('Portable export preflight did not advance its bounded cursor.')
    }
    if (complete) await assertGenerationsCurrent(ctx, nextState.generations)
    const encoded = JSON.stringify(nextState)
    return {
      scanned: rows.length,
      documentCount,
      assetCount: nextState.assetSha256s.length,
      complete,
      cursor: complete ? null : encoded,
      preflightToken: complete ? encoded : null,
    }
  },
})

const preflightPageRef = makeFunctionReference<
  'query',
  { scope: { collections: string[] }; sourceContentHash: string; cursor: string | null },
  ExportPreflightPageResult
>('portability/exportPreflight:preflightExportPageInternal')

const createInternalRef = makeFunctionReference<
  'mutation',
  {
    runId: string
    deploymentId: string
    scope: { collections: string[] }
    sourceContentHash: string
    leaseTokenHash: string
    callerId: string
    preflightToken: string
    contractWriteToken: CmsContractWriteToken
  },
  CreateExportRunResult
>('portability/exports:createExportRunInternal')

export async function assertCurrentExportPreflight(
  ctx: QueryOrMutationCtx,
  args: { scope: { collections: string[] }; sourceContentHash: string },
  token: string,
) {
  const { installed, scopes } = await resolveExportScope(ctx, args)
  const preflight = parseExportPreflightState(token, {
    sourceContentHash: args.sourceContentHash,
    collections: args.scope.collections,
    scopes,
    requireComplete: true,
  })
  await assertGenerationsCurrent(ctx, preflight.generations)
  return { installed, preflight }
}

export const createExportRun = callerAction.protected({
  id: 'portability:createExportRun',
  args: createExportRunArgs.args,
  acceptsTrustedCaller: true,
  guard: canManagePortability,
  returns: createExportRunResultValidator,
  handler: async (ctx, args): Promise<CreateExportRunResult> => {
    const identity = await ctx.appIdentity()
    let cursor: string | null = null
    const seen = new Set<string>()
    let preflightToken: string | null = null
    for (;;) {
      const page: ExportPreflightPageResult = await ctx.runQuery(preflightPageRef, {
        scope: args.scope,
        sourceContentHash: args.sourceContentHash,
        cursor,
      })
      if (page.complete) {
        preflightToken = page.preflightToken
        break
      }
      if (!page.cursor || seen.has(page.cursor)) {
        throw new Error('Portable export preflight did not advance its bounded cursor.')
      }
      seen.add(page.cursor)
      cursor = page.cursor
    }
    if (!preflightToken) {
      throw new Error('Portable export preflight completed without a fence token.')
    }
    return await ctx.runMutation(createInternalRef, {
      ...args,
      callerId: identity.userId,
      preflightToken,
      contractWriteToken: requireCmsContractWriteToken(ctx),
    })
  },
})
