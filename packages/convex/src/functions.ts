import { cmsCallerValidator } from '@lupinum/ginko-cms-contract/convex/caller.js'
import {
  assertCmsCallerConsistency,
  cmsAnonymousCaller,
  cmsCallerFromConvexAuthIdentity,
  cmsMcpCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { CmsCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import type {
  FunctionVisibility,
  ActionBuilder,
  DefaultFunctionArgs,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
} from 'convex/server'
import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel.js'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server.js'
import {
  getAppIdentity,
  type CmsAppIdentity,
  type CmsMemberAppIdentity,
} from './auth/appIdentity.js'
import { can, type CmsGuard } from './auth/checks.js'
import { throwCmsError } from './errors.js'
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

type BetterAuthConvexIdentity = {
  subject?: string | null
  email?: string | null
  sessionId?: unknown
  ginkoCredentialKind?: unknown
}

type HandlerCtx<TCtx> = TCtx & {
  appIdentity: () => Promise<CmsMemberAppIdentity>
  cmsCaller: () => Promise<CmsCaller>
}

type ArgsFor<TArgsValidator> = TArgsValidator extends GenericValidator
  ? TArgsValidator['type']
  : TArgsValidator extends PropertyValidators
    ? ObjectType<TArgsValidator>
    : DefaultFunctionArgs

type LooseValue = ReturnType<typeof v.any>['type']

type ProtectedDefinition<
  TCtx extends RootCtx,
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
  TLoaded = LooseValue,
> = {
  id?: string
  args?: TArgsValidator
  returns?: unknown
  guard?: CmsGuard | unknown
  load?: (ctx: HandlerCtx<TCtx>, args: ArgsFor<TArgsValidator>) => TLoaded | Promise<TLoaded>
  handler: (ctx: HandlerCtx<TCtx>, args: ArgsFor<TArgsValidator>, loaded: TLoaded) => unknown
  [key: string]: unknown
}

type PublicDefinition<
  TCtx extends RootCtx,
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
> = {
  id?: string
  args?: TArgsValidator
  returns?: unknown
  handler: (ctx: HandlerCtx<TCtx>, args: ArgsFor<TArgsValidator>) => unknown
  [key: string]: unknown
}

export async function resolveCmsCaller(ctx: RootCtx): Promise<CmsCaller> {
  const auth = (await ctx.auth.getUserIdentity()) as BetterAuthConvexIdentity | null
  if (!auth?.subject) return cmsAnonymousCaller()

  switch (auth.ginkoCredentialKind) {
    case 'user-session':
      return assertCmsCallerConsistency(cmsCallerFromConvexAuthIdentity(auth))

    case 'mcp-api-key': {
      const apiKeyId = typeof auth.sessionId === 'string' ? auth.sessionId : null
      if (apiKeyId) {
        const mcpCaller = cmsMcpCaller(apiKeyId)
        const mcpIdentity = await getAppIdentity(ctx, mcpCaller)
        if (mcpIdentity?.kind === 'member' && mcpIdentity.userId === auth.subject) {
          return assertCmsCallerConsistency(mcpCaller)
        }
      }
      return throwCmsError('MCP_CREDENTIAL_REJECTED', 'MCP credential is not active.')
    }

    default:
      return throwCmsError(
        'CMS_CREDENTIAL_KIND_INVALID',
        'Authenticated identity has no supported credential kind.',
      )
  }
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
  trustedCaller?: CmsCaller | null,
): Promise<HandlerCtx<TCtx>> {
  // Convex does not propagate user auth into component ACTIONS (ctx.auth is
  // empty there), so host-app action facades forward the caller they resolved
  // from their own ctx.auth as `_trustedCaller`. Component functions are only
  // callable by the host app — never directly by clients — so this argument
  // carries exactly the trust of the app's own auth resolution. It is used
  // only when ctx.auth yields nothing, and MCP callers are still re-validated
  // against stored credentials during app-identity resolution.
  let caller = await resolveCmsCaller(ctx)
  if (caller.kind === 'anonymous' && trustedCaller) {
    caller = assertCmsCallerConsistency(trustedCaller)
  }
  let identityPromise: Promise<CmsAppIdentity> | null = null

  const handlerCtx = Object.assign(ctx, {
    cmsCaller: async () => caller,
    appIdentity: async () => {
      if (!identityPromise) {
        const identity = await resolveCmsAppIdentity(ctx, caller)
        if (guard) requireCms(identity, guard as CmsGuard)
        identityPromise = Promise.resolve(identity)
      }
      return (await identityPromise) as CmsMemberAppIdentity
    },
  })

  if (guard) await handlerCtx.appIdentity()
  return handlerCtx
}

function convexDefinition<
  TCtx extends RootCtx,
  TArgsValidator extends GenericValidator | PropertyValidators | undefined,
  TLoaded,
>(
  definition:
    | ProtectedDefinition<TCtx, TArgsValidator, TLoaded>
    | PublicDefinition<TCtx, TArgsValidator>,
  handler: (ctx: TCtx, args: DefaultFunctionArgs) => unknown,
) {
  const args = {
    ...(definition.args ?? {}),
    ...((definition as { kind?: unknown }).kind === 'destructive'
      ? { _confirmationToken: v.optional(v.string()) }
      : {}),
    ...((definition as { acceptsTrustedCaller?: boolean }).acceptsTrustedCaller
      ? { _trustedCaller: v.optional(cmsCallerValidator) }
      : {}),
  }
  return {
    args,
    ...(definition.returns === undefined ? {} : { returns: definition.returns }),
    handler,
  }
}

function protectedHandler<
  TCtx extends RootCtx,
  TArgsValidator extends GenericValidator | PropertyValidators | undefined,
  TLoaded,
>(definition: ProtectedDefinition<TCtx, TArgsValidator, TLoaded>) {
  return async (ctx: TCtx, args: DefaultFunctionArgs) => {
    const isDestructive = (definition as { kind?: unknown }).kind === 'destructive'
    const confirmationToken = args._confirmationToken
    if (isDestructive && typeof confirmationToken !== 'string') {
      throw new Error('Destructive operation requires confirmation.')
    }
    const acceptsTrustedCaller = (definition as { acceptsTrustedCaller?: boolean })
      .acceptsTrustedCaller
    const trustedCaller = acceptsTrustedCaller ? (args._trustedCaller as CmsCaller | null) : null
    const strippedKeys = new Set([
      ...(isDestructive ? ['_confirmationToken'] : []),
      ...(acceptsTrustedCaller ? ['_trustedCaller'] : []),
    ])
    const handlerArgs = (
      strippedKeys.size > 0 && args && typeof args === 'object'
        ? Object.fromEntries(
            Object.entries(args as Record<string, unknown>).filter(
              ([key]) => !strippedKeys.has(key),
            ),
          )
        : args
    ) as ArgsFor<TArgsValidator>
    const handlerCtx = await createHandlerCtx(ctx, definition.guard, trustedCaller)
    const loaded = (
      definition.load ? await definition.load(handlerCtx, handlerArgs) : undefined
    ) as TLoaded
    if (isDestructive) {
      await executeDestructiveOperation(
        handlerCtx as Parameters<typeof executeDestructiveOperation>[0],
        definition as unknown as Parameters<typeof executeDestructiveOperation>[1],
        handlerArgs as DefaultFunctionArgs,
        loaded,
        confirmationToken as string,
      )
    }
    return await definition.handler(handlerCtx, handlerArgs, loaded)
  }
}

function publicHandler<
  TCtx extends RootCtx,
  TArgsValidator extends GenericValidator | PropertyValidators | undefined,
>(definition: PublicDefinition<TCtx, TArgsValidator>) {
  return async (ctx: TCtx, args: DefaultFunctionArgs) => {
    const handlerCtx = await createHandlerCtx(ctx)
    return await definition.handler(handlerCtx, args as ArgsFor<TArgsValidator>)
  }
}

export const publicQuery = <
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
>(
  definition: PublicDefinition<GenericQueryCtx<DataModel>, TArgsValidator>,
): LooseValue =>
  query(convexDefinition(definition, publicHandler(definition)) as Parameters<typeof query>[0])

export const protectedQuery = <
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
  TLoaded = LooseValue,
>(
  definition: ProtectedDefinition<GenericQueryCtx<DataModel>, TArgsValidator, TLoaded>,
): LooseValue =>
  query(convexDefinition(definition, protectedHandler(definition)) as Parameters<typeof query>[0])

export const publicMutation = <
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
>(
  definition: PublicDefinition<GenericMutationCtx<DataModel>, TArgsValidator>,
): LooseValue =>
  mutation(
    convexDefinition(definition, publicHandler(definition)) as Parameters<typeof mutation>[0],
  )

export const protectedMutation = <
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
  TLoaded = LooseValue,
>(
  definition: ProtectedDefinition<GenericMutationCtx<DataModel>, TArgsValidator, TLoaded>,
): LooseValue =>
  mutation(
    convexDefinition(definition, protectedHandler(definition)) as Parameters<typeof mutation>[0],
  )

export const protectedAction = <
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
  TLoaded = LooseValue,
>(
  definition: ProtectedDefinition<GenericActionCtx<DataModel>, TArgsValidator, TLoaded>,
): LooseValue => {
  // Component actions never see the host app's ctx.auth, so they always
  // accept the facade-forwarded `_trustedCaller` argument.
  const actionDefinition = { ...definition, acceptsTrustedCaller: true }
  return action(
    convexDefinition(actionDefinition, protectedHandler(actionDefinition)) as Parameters<
      typeof action
    >[0],
  )
}

export const directInternalQuery = <
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
>(
  definition: PublicDefinition<GenericQueryCtx<DataModel>, TArgsValidator>,
): LooseValue =>
  internalQuery(
    convexDefinition(definition, publicHandler(definition)) as Parameters<typeof internalQuery>[0],
  )

export const directInternalMutation = <
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
>(
  definition: PublicDefinition<GenericMutationCtx<DataModel>, TArgsValidator>,
): LooseValue =>
  internalMutation(
    convexDefinition(definition, publicHandler(definition)) as Parameters<
      typeof internalMutation
    >[0],
  )

export const callerQuery = {
  public: publicQuery,
  protected: protectedQuery,
}

export const callerMutation = {
  public: publicMutation,
  protected: protectedMutation,
}

export const callerAction = {
  protected: protectedAction,
}

export { action, query, mutation }

export type CmsQueryVisibility = ExtractQueryVisibility<typeof query>
export type CmsMutationVisibility = ExtractMutationVisibility<typeof mutation>
export type CmsActionVisibility = ExtractActionVisibility<typeof action>
