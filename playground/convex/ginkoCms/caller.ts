import { cmsCallerFromActionAuthIdentity } from '@lupinum/ginko-cms-contract/shared/caller.js'

import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server.js'

type CmsCallerHostCtx = Pick<QueryCtx | MutationCtx | ActionCtx, 'auth'>

export async function bindCmsCaller<TArgs extends Record<string, unknown>>(
  ctx: CmsCallerHostCtx,
  args: TArgs,
) {
  const caller = cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity())
  return caller ? { ...args, _trustedCaller: caller } : args
}
