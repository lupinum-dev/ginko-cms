import {
  listRevalidationJobs as listRevalidationJobsArgs,
  retryRevalidationJob as retryRevalidationJobArgs,
  revalidationEnvironmentValidator,
  revalidationStatusValidator,
  upsertRevalidationTarget as upsertRevalidationTargetArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/revalidation.js'
import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { cmsOperationPreviewValidator } from './operation-runtime'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

const revalidationTargetValidator = v.object({
  id: v.string(),
  name: v.string(),
  environment: revalidationEnvironmentValidator,
  endpoint: v.string(),
  secretEnv: v.string(),
  enabled: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const revalidationJobValidator = v.object({
  id: v.string(),
  status: revalidationStatusValidator,
  tags: v.array(v.string()),
  paths: v.array(v.string()),
  attempts: v.number(),
  nextAttemptAt: v.number(),
  lastError: v.union(v.string(), v.null()),
  deliveredAt: v.union(v.number(), v.null()),
  payload: jsonObjectValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const entries = [
  {
    exportName: 'listRevalidationTargets',
    operation: 'query',
    component: 'listRevalidationTargets',
    args: {},
    returns: v.array(revalidationTargetValidator),
  },
  {
    exportName: 'upsertRevalidationTarget',
    operation: 'mutation',
    component: 'upsertRevalidationTarget',
    args: upsertRevalidationTargetArgs.args,
    returns: v.string(),
  },
  {
    exportName: 'listRevalidationJobs',
    operation: 'query',
    component: 'listRevalidationJobs',
    args: listRevalidationJobsArgs.args,
    returns: v.array(revalidationJobValidator),
  },
  {
    exportName: 'retryRevalidationJob',
    operation: 'mutation',
    component: 'retryRevalidationJobOperationExecute',
    args: confirmedArgs(retryRevalidationJobArgs.args),
    returns: v.null(),
  },
  {
    exportName: 'previewRetryRevalidationJobOperation',
    operation: 'mutation',
    component: 'previewRetryRevalidationJobOperation',
    args: retryRevalidationJobArgs.args,
    returns: cmsOperationPreviewValidator(),
  },
] as const satisfies readonly BridgeEntry[]

export function createRevalidationBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
