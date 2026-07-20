import { cmsCallerValidator } from '@lupinum/ginko-cms-contract/convex/caller.js'
import {
  assertCmsCallerConsistency,
  cmsAnonymousCaller,
  cmsCallerFromConvexAuthIdentity,
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
import { makeFunctionReference } from 'convex/server'
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
import {
  assertCmsContractWritable,
  type CmsContractWriteToken,
  type ExpectedCmsContract,
} from './lib/installedContract.js'
import {
  type DestructiveCmsOperationDefinition,
  executeDestructiveOperation,
  operationExecuteResultValidator,
} from './operationHelpers.js'

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
  name?: string | null
  email?: string | null
  emailVerified?: boolean | null
  token_use?: unknown
}

type HandlerCtx<TCtx> = TCtx & {
  appIdentity: () => Promise<CmsMemberAppIdentity>
  cmsCaller: () => Promise<CmsCaller>
  cmsContractWriteToken: () => CmsContractWriteToken | null
}

type ArgsFor<TArgsValidator> = TArgsValidator extends GenericValidator
  ? TArgsValidator['type']
  : TArgsValidator extends PropertyValidators
    ? ObjectType<TArgsValidator>
    : DefaultFunctionArgs

type LooseValue = ReturnType<typeof v.any>['type']
type ContractWritePolicy = 'required' | 'bypass'

/**
 * The only caller-visible writes allowed while the editorial contract is
 * missing, mismatched, or transition-locked. These operations belong to the
 * access/security or diagnostic control planes and cannot change canonical CMS
 * content, public output, assets, site data, or portability state.
 */
export const CONTRACT_WRITE_BYPASS_IDS: ReadonlySet<string> = new Set([
  'agentRuns:completeRun',
  'agentRuns:revokeRun',
  'ginko-cms.remove-member',
  'mcpAuthLimiter:recordFailure',
  'mcpCredentials:revokeSettings',
  'mcpCredentials:createCredential',
  'members:acceptMemberInvitation',
  'members:bootstrapCmsOwner',
  'members:prepareMemberInvitationDelivery',
  'members:prepareMemberInvitationResendDelivery',
  'members:previewRemoveMemberOperation',
  'members:recordMemberInvitationDelivery',
  'members:revokeMemberInvitation',
  'members:updateMemberRole',
  'revalidation:testRevalidationTarget',
  'storageMaintenance:runStorageDiagnostic',
] as const)

type ProtectedDefinition<
  TCtx extends RootCtx,
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
  TLoaded = LooseValue,
> = {
  id?: string
  kind?: 'safe'
  contractWrite?: ContractWritePolicy
  acceptsTrustedCaller?: boolean
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
  kind?: never
  contractWrite?: ContractWritePolicy
  acceptsTrustedCaller?: never
  args?: TArgsValidator
  returns?: unknown
  handler: (ctx: HandlerCtx<TCtx>, args: ArgsFor<TArgsValidator>) => unknown
  [key: string]: unknown
}

export async function resolveCmsCaller(ctx: RootCtx): Promise<CmsCaller> {
  const auth = (await ctx.auth.getUserIdentity()) as BetterAuthConvexIdentity | null
  if (!auth?.subject) return cmsAnonymousCaller()

  if (auth.token_use === 'convex-session') {
    return assertCmsCallerConsistency(cmsCallerFromConvexAuthIdentity(auth))
  }
  return throwCmsError(
    'CMS_CREDENTIAL_KIND_INVALID',
    'Authenticated identity has no supported credential kind.',
  )
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
  contractWriteToken?: CmsContractWriteToken | null,
): Promise<HandlerCtx<TCtx>> {
  // Host facades resolve the caller from their own authenticated context and
  // forward it as `_trustedCaller`. A component invocation can retain a
  // transport identity that is not the host application's Better Auth subject,
  // so an explicitly enabled trusted caller is authoritative rather than only
  // an anonymous fallback. Component functions are callable by the host app,
  // not directly by clients. MCP callers are still resolved against canonical
  // credential and membership state below.
  const caller = trustedCaller
    ? assertCmsCallerConsistency(trustedCaller)
    : await resolveCmsCaller(ctx)
  let identityPromise: Promise<CmsAppIdentity> | null = null

  const handlerCtx = Object.assign(ctx, {
    cmsCaller: async () => caller,
    cmsContractWriteToken: () => contractWriteToken ?? null,
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

export function requireCmsContractWriteToken(ctx: {
  cmsContractWriteToken: () => CmsContractWriteToken | null
}): CmsContractWriteToken {
  const token = ctx.cmsContractWriteToken()
  if (!token) {
    return throwCmsError(
      'CMS_CONTRACT_WRITE_FENCE_REQUIRED',
      'The action did not receive a CMS contract write fence.',
    )
  }
  return token
}

function convexDefinition<
  TCtx extends RootCtx,
  TArgsValidator extends GenericValidator | PropertyValidators | undefined,
  TLoaded,
  TResult,
>(
  definition:
    | ProtectedDefinition<TCtx, TArgsValidator, TLoaded>
    | PublicDefinition<TCtx, TArgsValidator>
    | DestructiveCmsOperationDefinition<TArgsValidator, TLoaded, TResult>,
  handler: (ctx: TCtx, args: DefaultFunctionArgs) => unknown,
  options: { acceptsContractExpectation?: boolean } = {},
) {
  const args = {
    ...(definition.args ?? {}),
    ...(definition.kind === 'destructive' ? { _confirmationToken: v.optional(v.string()) } : {}),
    ...(definition.acceptsTrustedCaller ? { _trustedCaller: v.optional(cmsCallerValidator) } : {}),
    ...(options.acceptsContractExpectation
      ? {
          _expectedContentHash: v.optional(v.string()),
          _expectedPresentationHash: v.optional(v.string()),
        }
      : {}),
  }
  return {
    args,
    ...(definition.returns === undefined
      ? {}
      : {
          returns:
            definition.kind === 'destructive'
              ? operationExecuteResultValidator(definition.returns)
              : definition.returns,
        }),
    handler,
  }
}

function splitContractExpectation(args: DefaultFunctionArgs): {
  args: DefaultFunctionArgs
  expected: ExpectedCmsContract | null
} {
  const { _expectedContentHash, _expectedPresentationHash, ...handlerArgs } = args
  const expected =
    typeof _expectedContentHash === 'string' && typeof _expectedPresentationHash === 'string'
      ? {
          contentHash: _expectedContentHash,
          presentationHash: _expectedPresentationHash,
        }
      : null
  return { args: handlerArgs, expected }
}

function requiresContractWriteGuard(definition: {
  id?: string
  contractWrite?: ContractWritePolicy
}): boolean {
  if ((definition.contractWrite ?? 'required') === 'required') return true
  if (definition.id && CONTRACT_WRITE_BYPASS_IDS.has(definition.id)) return false
  throw new Error(
    `CMS_CONTRACT_BYPASS_NOT_ALLOWED: ${definition.id ?? 'unnamed mutation'} is not in the audited bypass whitelist.`,
  )
}

function contractMutationHandler<TCtx extends GenericMutationCtx<DataModel>>(
  definition: { contractWrite?: ContractWritePolicy },
  handler: (ctx: TCtx, args: DefaultFunctionArgs) => unknown,
) {
  return async (ctx: TCtx, args: DefaultFunctionArgs) => {
    const split = splitContractExpectation(args)
    if (requiresContractWriteGuard(definition)) {
      if (!split.expected) {
        throwCmsError(
          'CMS_CONTRACT_EXPECTATION_REQUIRED',
          'The host facade did not bind its expected CMS contract hashes.',
        )
      }
      await assertCmsContractWritable(ctx, split.expected)
    }
    return await handler(ctx, split.args)
  }
}

const assertExpectedCmsContractRef = makeFunctionReference<
  'query',
  { expectedContentHash: string; expectedPresentationHash: string },
  CmsContractWriteToken
>('contract:assertExpectedCmsContract')

function contractActionHandler<TCtx extends GenericActionCtx<DataModel>>(
  definition: { contractWrite?: ContractWritePolicy },
  handler: (ctx: TCtx, args: DefaultFunctionArgs) => unknown,
) {
  return async (ctx: TCtx, args: DefaultFunctionArgs) => {
    const split = splitContractExpectation(args)
    let contractWriteToken: CmsContractWriteToken | null = null
    if (requiresContractWriteGuard(definition)) {
      if (!split.expected) {
        throwCmsError(
          'CMS_CONTRACT_EXPECTATION_REQUIRED',
          'The host facade did not bind its expected CMS contract hashes.',
        )
      }
      contractWriteToken = await ctx.runQuery(assertExpectedCmsContractRef, {
        expectedContentHash: split.expected.contentHash,
        expectedPresentationHash: split.expected.presentationHash,
      })
    }
    return await handler(ctx, { ...split.args, _contractWriteToken: contractWriteToken })
  }
}

function protectedHandler<
  TCtx extends RootCtx,
  TArgsValidator extends GenericValidator | PropertyValidators | undefined,
  TLoaded,
>(definition: ProtectedDefinition<TCtx, TArgsValidator, TLoaded>) {
  return async (ctx: TCtx, args: DefaultFunctionArgs) => {
    const acceptsTrustedCaller = definition.acceptsTrustedCaller
    const trustedCaller = acceptsTrustedCaller ? (args._trustedCaller as CmsCaller | null) : null
    const contractWriteToken = (args._contractWriteToken as CmsContractWriteToken | null) ?? null
    const strippedKeys = new Set([
      '_contractWriteToken',
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
    const handlerCtx = await createHandlerCtx(
      ctx,
      definition.guard,
      trustedCaller,
      contractWriteToken,
    )
    const loaded = (
      definition.load ? await definition.load(handlerCtx, handlerArgs) : undefined
    ) as TLoaded
    return await definition.handler(handlerCtx, handlerArgs, loaded)
  }
}

function protectedMutationHandler<
  TArgsValidator extends GenericValidator | PropertyValidators | undefined,
  TLoaded,
  TResult,
>(
  definition:
    | ProtectedDefinition<GenericMutationCtx<DataModel>, TArgsValidator, TLoaded>
    | DestructiveCmsOperationDefinition<TArgsValidator, TLoaded, TResult>,
) {
  return async (ctx: GenericMutationCtx<DataModel>, args: DefaultFunctionArgs) => {
    if (definition.kind === 'destructive') {
      const trustedCaller = (args._trustedCaller as CmsCaller | null) ?? null
      const handlerArgs = Object.fromEntries(
        Object.entries(args).filter(
          ([key]) => key !== '_confirmationToken' && key !== '_trustedCaller',
        ),
      ) as ArgsFor<TArgsValidator>
      // Guard evaluation is part of execution so authorization changes become a
      // durable blocked result instead of an unstructured transport failure.
      const handlerCtx = await createHandlerCtx(ctx, undefined, trustedCaller)
      return await executeDestructiveOperation<TArgsValidator, TLoaded, TResult>(
        handlerCtx,
        definition,
        handlerArgs,
        typeof args._confirmationToken === 'string' ? args._confirmationToken : undefined,
      )
    }

    const trustedCaller = definition.acceptsTrustedCaller
      ? (args._trustedCaller as CmsCaller | null)
      : null
    const handlerCtx = await createHandlerCtx(ctx, definition.guard, trustedCaller)
    const handlerArgs = Object.fromEntries(
      Object.entries(args).filter(([key]) => key !== '_trustedCaller'),
    ) as ArgsFor<TArgsValidator>
    const loaded = (
      definition.load ? await definition.load(handlerCtx, handlerArgs) : undefined
    ) as TLoaded
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
    convexDefinition(definition, contractMutationHandler(definition, publicHandler(definition)), {
      acceptsContractExpectation: true,
    }) as Parameters<typeof mutation>[0],
  )

export const protectedMutation = <
  TArgsValidator extends GenericValidator | PropertyValidators | undefined =
    | GenericValidator
    | PropertyValidators
    | undefined,
  TLoaded = LooseValue,
  TResult = unknown,
>(
  definition:
    | ProtectedDefinition<GenericMutationCtx<DataModel>, TArgsValidator, TLoaded>
    | DestructiveCmsOperationDefinition<TArgsValidator, TLoaded, TResult>,
): LooseValue =>
  mutation(
    convexDefinition(
      definition,
      contractMutationHandler(definition, protectedMutationHandler(definition)),
      { acceptsContractExpectation: true },
    ) as Parameters<typeof mutation>[0],
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
    convexDefinition(
      actionDefinition,
      contractActionHandler(actionDefinition, protectedHandler(actionDefinition)),
      { acceptsContractExpectation: true },
    ) as Parameters<typeof action>[0],
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
