import {
  assertCmsCallerConsistency,
  cmsAnonymousCaller,
  cmsCallerFromConvexAuthIdentity,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { CmsCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import type {
  FunctionVisibility,
  ActionBuilder,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
} from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel.js'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server.js'
import { getAppIdentity, type CmsAppIdentity } from './auth/appIdentity.js'
import { can, type CmsGuard } from './auth/checks.js'
import { executeDestructiveOperation } from './operationHelpers.js'

type ExtractQueryVisibility<T> =
  T extends QueryBuilder<DataModel, infer TVisibility> ? TVisibility : FunctionVisibility

type ExtractMutationVisibility<T> =
  T extends MutationBuilder<DataModel, infer TVisibility> ? TVisibility : FunctionVisibility
type ExtractActionVisibility<T> =
  T extends ActionBuilder<DataModel, infer TVisibility> ? TVisibility : FunctionVisibility

type RootCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

type HandlerCtx<TCtx> = TCtx & {
  appIdentity: () => Promise<any>
  cmsCaller: () => Promise<CmsCaller>
}

type ProtectedDefinition<TCtx> = {
  id?: string
  args?: Record<string, unknown>
  returns?: unknown
  guard?: CmsGuard | unknown
  load?: (ctx: HandlerCtx<TCtx>, args: any) => any
  handler: (ctx: HandlerCtx<TCtx>, args: any, loaded?: any) => unknown
  [key: string]: unknown
}

type PublicDefinition<TCtx> = {
  id?: string
  args?: Record<string, unknown>
  returns?: unknown
  handler: (ctx: HandlerCtx<TCtx>, args: any) => unknown
  [key: string]: unknown
}

export const cmsPublicReadTables = [
  'assets',
  'cmsSettings',
  'collections',
  'contentAssetRefs',
  'entries',
  'publicEntries',
  'publicRoutes',
  'siteData',
] as const

export async function resolveCmsCaller(ctx: RootCtx): Promise<CmsCaller> {
  const auth = await ctx.auth.getUserIdentity()
  if (auth?.subject) {
    return assertCmsCallerConsistency(cmsCallerFromConvexAuthIdentity(auth))
  }

  return cmsAnonymousCaller()
}

export async function resolveCmsAppIdentity(
  ctx: RootCtx,
  caller?: CmsCaller,
): Promise<CmsAppIdentity> {
  return await getAppIdentity(ctx, caller ?? (await resolveCmsCaller(ctx)))
}

export function requireCms(
  identity: CmsAppIdentity,
  guard: CmsGuard | undefined,
  message = 'Forbidden.',
): NonNullable<CmsAppIdentity> {
  if (!identity || (guard && !can(identity, guard))) {
    throw new Error(guard ? `Forbidden: ${guard.label}` : message)
  }
  return identity
}

async function createHandlerCtx<TCtx extends RootCtx>(
  ctx: TCtx,
  guard?: CmsGuard | unknown,
): Promise<HandlerCtx<TCtx>> {
  const caller = await resolveCmsCaller(ctx)
  let identityPromise: Promise<CmsAppIdentity> | null = null

  const handlerCtx = Object.assign(ctx, {
    cmsCaller: async () => caller,
    appIdentity: async () => {
      if (!identityPromise) {
        const identity = await resolveCmsAppIdentity(ctx, caller)
        if (guard) requireCms(identity, guard as CmsGuard)
        identityPromise = Promise.resolve(identity)
      }
      return await identityPromise
    },
  })

  if (guard) await handlerCtx.appIdentity()
  return handlerCtx
}

function convexDefinition<TCtx extends RootCtx>(
  definition: ProtectedDefinition<TCtx> | PublicDefinition<TCtx>,
  handler: (ctx: TCtx, args: any) => unknown,
) {
  const args = {
    ...(definition.args ?? {}),
    ...((definition as { kind?: unknown }).kind === 'destructive'
      ? { _confirmationToken: v.optional(v.string()) }
      : {}),
  }
  return {
    args,
    ...(definition.returns === undefined ? {} : { returns: definition.returns }),
    handler,
  }
}

function protectedHandler<TCtx extends RootCtx>(definition: ProtectedDefinition<TCtx>) {
  return async (ctx: TCtx, args: any) => {
    const isDestructive = (definition as { kind?: unknown }).kind === 'destructive'
    if (isDestructive && typeof args?._confirmationToken !== 'string') {
      throw new Error('Destructive operation requires confirmation.')
    }
    const handlerArgs =
      isDestructive && args && typeof args === 'object'
        ? Object.fromEntries(
            Object.entries(args as Record<string, unknown>).filter(
              ([key]) => key !== '_confirmationToken',
            ),
          )
        : args
    const handlerCtx = await createHandlerCtx(ctx, definition.guard)
    const loaded = definition.load ? await definition.load(handlerCtx, handlerArgs) : undefined
    if (isDestructive) {
      await executeDestructiveOperation(
        handlerCtx as Parameters<typeof executeDestructiveOperation>[0],
        definition,
        handlerArgs,
        loaded,
        args._confirmationToken,
      )
    }
    return await definition.handler(handlerCtx, handlerArgs, loaded)
  }
}

function publicHandler<TCtx extends RootCtx>(definition: PublicDefinition<TCtx>) {
  return async (ctx: TCtx, args: any) => {
    const handlerCtx = await createHandlerCtx(ctx)
    return await definition.handler(handlerCtx, args)
  }
}

export const publicQuery = (definition: PublicDefinition<GenericQueryCtx<DataModel>>) =>
  query(convexDefinition(definition, publicHandler(definition)) as any)

export const protectedQuery = (definition: ProtectedDefinition<GenericQueryCtx<DataModel>>) =>
  query(convexDefinition(definition, protectedHandler(definition)) as any)

export const protectedMutation = (definition: ProtectedDefinition<GenericMutationCtx<DataModel>>) =>
  mutation(convexDefinition(definition, protectedHandler(definition)) as any)

export const protectedAction = (definition: ProtectedDefinition<GenericActionCtx<DataModel>>) =>
  action(convexDefinition(definition, protectedHandler(definition)) as any)

export const directInternalQuery = (definition: PublicDefinition<GenericQueryCtx<DataModel>>) =>
  internalQuery(convexDefinition(definition, publicHandler(definition)) as any)

export const directInternalMutation = (
  definition: PublicDefinition<GenericMutationCtx<DataModel>>,
) => internalMutation(convexDefinition(definition, publicHandler(definition)) as any)

export const callerQuery = {
  public: publicQuery,
  protected: protectedQuery,
}

export const callerMutation = {
  protected: protectedMutation,
}

export const callerAction = {
  protected: protectedAction,
}

export { action, query, mutation }

export type CmsQueryVisibility = ExtractQueryVisibility<typeof query>
export type CmsMutationVisibility = ExtractMutationVisibility<typeof mutation>
export type CmsActionVisibility = ExtractActionVisibility<typeof action>
