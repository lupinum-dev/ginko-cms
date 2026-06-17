import { cmsCallerValidator } from '@lupinum/ginko-cms-contract/convex/caller.js'
import {
  assertCmsCallerConsistency,
  cmsAnonymousCaller,
  getCmsComponentForwardingKey,
  cmsCallerFromConvexAuthIdentity,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { CmsCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { defineCaller, defineTrellis, getForwardedCaller, unsafe } from '@lupinum/trellis/backend'
import type { ActingFor } from '@lupinum/trellis/backend'
import type {
  FunctionVisibility,
  ActionBuilder,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
} from 'convex/server'

import type { DataModel } from './_generated/dataModel.js'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server.js'
import { getAppIdentity } from './auth/appIdentity.js'

type ExtractQueryVisibility<T> =
  T extends QueryBuilder<DataModel, infer TVisibility> ? TVisibility : FunctionVisibility

type ExtractMutationVisibility<T> =
  T extends MutationBuilder<DataModel, infer TVisibility> ? TVisibility : FunctionVisibility
type ExtractActionVisibility<T> =
  T extends ActionBuilder<DataModel, infer TVisibility> ? TVisibility : FunctionVisibility

type CmsAppIdentity = Awaited<ReturnType<typeof getAppIdentity>>
type RootCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>
type CmsRuntime = ReturnType<
  typeof defineTrellis<
    DataModel,
    ExtractQueryVisibility<typeof query>,
    ExtractMutationVisibility<typeof mutation>,
    ExtractQueryVisibility<typeof internalQuery>,
    ExtractMutationVisibility<typeof internalMutation>,
    CmsCaller,
    ActingFor,
    CmsAppIdentity,
    ExtractActionVisibility<typeof action>
  >
>

const caller = defineCaller({
  validator: cmsCallerValidator,
  resolve: async (ctx, args): Promise<CmsCaller> => {
    const forwarded = getForwardedCaller<CmsCaller>(ctx as RootCtx, args)
    if (forwarded) return assertCmsCallerConsistency(forwarded)

    const auth = await (ctx as RootCtx).auth.getUserIdentity()
    if (auth?.subject) {
      return cmsCallerFromConvexAuthIdentity(auth)
    }

    return cmsAnonymousCaller()
  },
})

const cmsRuntime: CmsRuntime = defineTrellis<
  DataModel,
  ExtractQueryVisibility<typeof query>,
  ExtractMutationVisibility<typeof mutation>,
  ExtractQueryVisibility<typeof internalQuery>,
  ExtractMutationVisibility<typeof internalMutation>,
  CmsCaller,
  ActingFor,
  CmsAppIdentity
>(
  { query, mutation, action, internalQuery, internalMutation },
  {
    caller,
    identityForwardingKey: () => getCmsComponentForwardingKey(),
    appIdentity: async (ctx, _args, resolvedCmsCaller) =>
      await getAppIdentity(ctx, resolvedCmsCaller),
    public: {
      readTables: [
        'assets',
        'cmsSettings',
        'collections',
        'contentAssetRefs',
        'entries',
        'publicEntries',
        'publicRoutes',
        'siteData',
      ],
    },
    destructiveOperations: {
      confirmationTable: 'destructiveConfirmations',
      auditTable: 'destructiveAuditLog',
      previewConfirmation: {
        callerKey: async (ctx) => {
          const identity = await ctx.appIdentity()
          if (!identity) throw new Error('Destructive preview confirmation requires identity.')
          return identity.userId
        },
        scopeKey: () => 'ginko-cms',
      },
    },
    trustedReplay: {
      table: 'trustedReplay',
    },
  },
)

export const unsafeRaw: CmsRuntime['unsafe'] = cmsRuntime.unsafe
export const unsafePermit = unsafe
export const callerQuery: CmsRuntime['query'] = cmsRuntime.query
export const callerMutation: CmsRuntime['mutation'] = cmsRuntime.mutation
export const callerTransportMutation: CmsRuntime['transportMutation'] = cmsRuntime.transportMutation
export const callerInternalTransportMutation: NonNullable<CmsRuntime['internalTransportMutation']> =
  cmsRuntime.internalTransportMutation!
export const callerAction: NonNullable<CmsRuntime['action']> = cmsRuntime.action!

export { action, query, mutation }
