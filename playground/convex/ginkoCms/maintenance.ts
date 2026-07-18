import {
  getStorageHealth as getStorageHealthArgs,
  getProjectionRepairRun as getProjectionRepairRunArgs,
  listTerminalAssetCleanupTasks as listTerminalAssetCleanupTasksArgs,
  previewRetryAssetCleanupOperation as previewRetryAssetCleanupOperationArgs,
  resumeProjectionRepairRun as resumeProjectionRepairRunArgs,
  retryAssetCleanupOperationExecute as retryAssetCleanupOperationExecuteArgs,
  runStorageDiagnostic as runStorageDiagnosticArgs,
  startProjectionRepairRun as startProjectionRepairRunArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/maintenance.js'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'

export const startProjectionRepairRun = mutation({
  args: startProjectionRepairRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.entries.projectionMaintenance.startProjectionRepairRun,
      bindExpectedCmsContract(args),
    ),
})

export const resumeProjectionRepairRun = mutation({
  args: resumeProjectionRepairRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.entries.projectionMaintenance.resumeProjectionRepairRun,
      bindExpectedCmsContract(args),
    ),
})

export const getProjectionRepairRun = query({
  args: getProjectionRepairRunArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.entries.projectionMaintenance.getProjectionRepairRun,
      args,
    ),
})

export const getStorageHealth = query({
  args: getStorageHealthArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.storageMaintenance.getStorageHealth, args),
})

export const runStorageDiagnostic = mutation({
  args: runStorageDiagnosticArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.storageMaintenance.runStorageDiagnostic, args),
})

export const listTerminalAssetCleanupTasks = query({
  args: listTerminalAssetCleanupTasksArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.assets.listTerminalAssetCleanupTasks, args),
})

export const previewRetryAssetCleanupOperation = mutation({
  args: previewRetryAssetCleanupOperationArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assets.previewRetryAssetCleanupOperation,
      bindExpectedCmsContract(args),
    ),
})

export const retryAssetCleanupOperationExecute = mutation({
  args: retryAssetCleanupOperationExecuteArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assets.retryAssetCleanupOperationExecute,
      bindExpectedCmsContract(args),
    ),
})
