import {
  listRevalidationJobs as listRevalidationJobsArgs,
  retryRevalidationJob as retryRevalidationJobArgs,
  testRevalidationTarget as testRevalidationTargetArgs,
  upsertRevalidationTarget as upsertRevalidationTargetArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/revalidation.js'
import { cmsCallerFromActionAuthIdentity } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { action, mutation, query } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.optional(v.string()),
  }
}

export const listRevalidationTargets = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.revalidation.listRevalidationTargets, args),
})

export const upsertRevalidationTarget = mutation({
  args: upsertRevalidationTargetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.revalidation.upsertRevalidationTarget,
      bindExpectedCmsContract(args),
    ),
})

export const testRevalidationTarget = action({
  args: testRevalidationTargetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(components.ginkoCms.revalidation.testRevalidationTarget, {
      ...args,
      _trustedCaller:
        cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
    }),
})

export const listRevalidationJobs = query({
  args: listRevalidationJobsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.revalidation.listRevalidationJobs, args),
})

export const retryRevalidationJob = mutation({
  args: confirmedArgs(retryRevalidationJobArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.revalidation.retryRevalidationJobOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewRetryRevalidationJobOperation = mutation({
  args: retryRevalidationJobArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.revalidation.previewRetryRevalidationJobOperation,
      bindExpectedCmsContract(args),
    ),
})
