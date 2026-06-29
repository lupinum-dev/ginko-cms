import { cmsOperationPreviewValidator } from './operation-runtime'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

const backupCountsValidator = v.object({
  entries: v.number(),
  revisions: v.number(),
  assets: v.number(),
  members: v.number(),
})

const backupScopeValidator = v.union(
  v.literal('full'),
  v.literal('collection'),
  v.literal('entry'),
  v.literal('asset'),
)

const backupScopeArgs = {
  scope: backupScopeValidator,
  collectionId: v.optional(v.string()),
  entryId: v.optional(v.string()),
  assetId: v.optional(v.string()),
}

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

export const entries = [
  {
    exportName: 'exportBackup',
    operation: 'action',
    component: 'exportBackup',
    args: backupScopeArgs,
    returns: v.object({
      artifactId: v.string(),
      checksum: v.string(),
      storageRef: v.string(),
      counts: backupCountsValidator,
    }),
  },
  {
    exportName: 'downloadBackup',
    operation: 'action',
    component: 'downloadBackup',
    args: { artifactId: v.string() },
    returns: v.object({
      artifactId: v.string(),
      checksum: v.string(),
      archiveJson: v.string(),
    }),
  },
  {
    exportName: 'verifyBackup',
    operation: 'action',
    component: 'verifyBackup',
    args: { artifactId: v.string() },
    returns: v.object({
      ok: v.boolean(),
      checksumMatches: v.boolean(),
      currentDataMatches: v.boolean(),
      artifactId: v.string(),
    }),
  },
  {
    exportName: 'deleteBackupArtifact',
    operation: 'mutation',
    component: 'deleteBackupArtifactOperationExecute',
    args: confirmedArgs({ artifactId: v.string() }),
    returns: v.null(),
  },
  {
    exportName: 'previewDeleteBackupArtifactOperation',
    operation: 'mutation',
    component: 'previewDeleteBackupArtifactOperation',
    args: { artifactId: v.string() },
    returns: cmsOperationPreviewValidator(),
  },
] as const satisfies readonly BridgeEntry[]

export function createBackupBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
