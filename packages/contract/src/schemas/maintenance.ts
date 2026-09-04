import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { defineArgs } from '../args.js'

export const startProjectionRepairRun = defineArgs({
  description:
    'Start one owner-scoped bounded repair of public/search projections and content-to-asset references.',
  args: {
    runId: v.string(),
    pageSize: v.optional(v.number()),
    autoContinue: v.optional(v.boolean()),
  },
})

export const resumeProjectionRepairRun = defineArgs({
  description: 'Resume one interrupted projection/reference repair from its durable cursor.',
  args: {
    runId: v.string(),
    autoContinue: v.optional(v.boolean()),
  },
})

export const getProjectionRepairRun = defineArgs({
  description: 'Inspect one durable projection/reference repair run.',
  args: { runId: v.string() },
})

export const listTerminalAssetCleanupTasks = defineArgs({
  description: 'Page through owner-only terminal abandoned-upload cleanup failures.',
  args: { paginationOpts: v.optional(paginationOptsValidator) },
})

export const getStorageHealth = defineArgs({
  description:
    'Inspect bounded Convex asset-storage health and tracked usage without exposing provider credentials.',
  args: {},
})

export const runStorageDiagnostic = defineArgs({
  description:
    'Run an owner-only upload-capability diagnostic that creates no storage object or permanent junk.',
  args: {},
})

export const previewRetryAssetCleanupOperation = defineArgs({
  description: 'Preview generation-fenced recovery of one terminal asset cleanup task.',
  args: { taskId: v.string(), expectedGeneration: v.number() },
})

export const retryAssetCleanupOperationExecute = defineArgs({
  description: 'Resume one previewed terminal asset cleanup task.',
  args: {
    taskId: v.string(),
    expectedGeneration: v.number(),
    _confirmationToken: v.optional(v.string()),
  },
})

export const createAssetRecoveryArtifact = defineArgs({
  description: 'Create and verify one immutable recovery artifact for an asset.',
  args: { assetId: v.string() },
})

export const downloadAssetRecoveryArtifact = defineArgs({
  description: 'Download one verified asset recovery archive.',
  args: { artifactId: v.string() },
})

export const verifyAssetRecoveryArtifact = defineArgs({
  description: 'Verify one asset recovery archive against its current source asset.',
  args: { artifactId: v.string() },
})

export const previewRestoreAsset = defineArgs({
  description: 'Preview restoration of one verified asset recovery archive.',
  args: { artifactId: v.string() },
})

export const restoreAsset = defineArgs({
  description: 'Restore bytes from one previewed recovery archive with checksum confirmation.',
  args: {
    artifactId: v.string(),
    expectedChecksum: v.string(),
  },
})
