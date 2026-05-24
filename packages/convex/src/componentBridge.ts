import { cmsCallerValidator } from '@lupinum/ginko-cms-contract/convex/caller.js'
import {
  assertCmsCallerConsistency,
  cmsAnonymousCaller,
  cmsCallerFromConvexAuthIdentity,
  getCmsComponentForwardingKey,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { CmsCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { createComponentBridge } from '@lupinum/trellis-bridge/component'
import { defineCaller, getForwardedCaller } from '@lupinum/trellis/backend'
import type {
  ActionBuilder,
  FunctionArgs,
  FunctionReference,
  FunctionVisibility,
  GenericDataModel,
  MutationBuilder,
  QueryBuilder,
} from 'convex/server'

const anonymousCmsCaller = cmsAnonymousCaller()

const caller = defineCaller({
  validator: cmsCallerValidator,
  resolve: async (ctx, args): Promise<CmsCaller> => {
    const forwarded = getForwardedCaller<CmsCaller>(ctx, args)
    if (forwarded) return assertCmsCallerConsistency(forwarded)
    return await getBrowserCmsCaller(ctx)
  },
})

type BrowserAuthCtx = {
  auth?: {
    getUserIdentity: () => Promise<unknown>
  }
}

async function getBrowserCmsCaller(ctx: unknown): Promise<CmsCaller> {
  const authCtx = ctx as BrowserAuthCtx
  if (typeof authCtx.auth?.getUserIdentity !== 'function') return anonymousCmsCaller

  const auth = await authCtx.auth.getUserIdentity()
  if (!auth) return anonymousCmsCaller

  return cmsCallerFromConvexAuthIdentity(auth)
}

export function createCmsComponentBridge<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
  ActionVisibility extends FunctionVisibility = FunctionVisibility,
  InternalActionVisibility extends FunctionVisibility = FunctionVisibility,
>(builders: {
  query: QueryBuilder<DataModel, QueryVisibility>
  mutation: MutationBuilder<DataModel, MutationVisibility>
  action?: ActionBuilder<DataModel, ActionVisibility>
  internalQuery: QueryBuilder<DataModel, InternalQueryVisibility>
  internalMutation: MutationBuilder<DataModel, InternalMutationVisibility>
  internalAction?: ActionBuilder<DataModel, InternalActionVisibility>
}) {
  return createComponentBridge<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility,
    InternalActionVisibility,
    CmsCaller
  >(builders, { caller, identityForwardingKey: () => getCmsComponentForwardingKey() })
}

export function componentArgs<
  TRef extends FunctionReference<'query' | 'mutation' | 'action', 'public' | 'internal'>,
>(args: unknown) {
  return args as FunctionArgs<TRef>
}
