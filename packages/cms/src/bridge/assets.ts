import {
  attachAssetsToEntry as attachAssetsToEntryArgs,
  deleteAsset as deleteAssetArgs,
  getAsset as getAssetArgs,
  getAssetManagerData as getAssetManagerDataArgs,
  getAssetUrl as getAssetUrlArgs,
  listColocatedAssets as listColocatedAssetsArgs,
  moveAsset as moveAssetArgs,
  registerAsset as registerAssetArgs,
  resolveAssetUrls as resolveAssetUrlsArgs,
  updateAsset as updateAssetArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'
import {
  assetColocationGroupsValidator,
  assetManagerAssetValidator,
  assetManagerPageValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { operationPreviewValidator } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

const purgeAssetArgs = {
  assetId: v.string(),
  force: v.optional(v.boolean()),
  exportArtifactId: v.string(),
}

export const entries = [
  {
    exportName: 'generateUploadUrl',
    operation: 'mutation',
    component: 'generateUploadUrl',
    args: {},
    returns: v.string(),
  },
  {
    exportName: 'registerAsset',
    operation: 'mutation',
    component: 'registerAsset',
    args: registerAssetArgs.args,
    returns: v.string(),
  },
  {
    exportName: 'attachAssetsToEntry',
    operation: 'mutation',
    component: 'attachAssetsToEntry',
    args: attachAssetsToEntryArgs.args,
    returns: v.null(),
  },
  {
    exportName: 'updateAsset',
    operation: 'mutation',
    component: 'updateAsset',
    args: updateAssetArgs.args,
    returns: v.null(),
  },
  {
    exportName: 'moveAsset',
    operation: 'mutation',
    component: 'moveAsset',
    args: moveAssetArgs.args,
    returns: v.null(),
  },
  {
    exportName: 'getAssetUrl',
    operation: 'query',
    component: 'getAssetUrl',
    args: getAssetUrlArgs.args,
    returns: v.union(v.null(), v.string()),
  },
  {
    exportName: 'getAsset',
    operation: 'query',
    component: 'getAsset',
    args: getAssetArgs.args,
    returns: v.union(assetManagerAssetValidator, v.null()),
  },
  {
    exportName: 'listColocatedAssets',
    operation: 'query',
    component: 'listColocatedAssets',
    args: listColocatedAssetsArgs.args,
    returns: assetColocationGroupsValidator,
  },
  {
    exportName: 'resolveAssetUrls',
    operation: 'query',
    component: 'resolveAssetUrls',
    args: resolveAssetUrlsArgs.args,
    returns: v.record(v.string(), v.union(v.string(), v.null())),
  },
  {
    exportName: 'getAssetManagerData',
    operation: 'query',
    component: 'getAssetManagerData',
    args: getAssetManagerDataArgs.args,
    returns: assetManagerPageValidator,
  },
  {
    exportName: 'deleteAsset',
    operation: 'mutation',
    component: 'deleteAssetOperationExecute',
    args: confirmedArgs(deleteAssetArgs.args),
    returns: v.null(),
  },
  {
    exportName: 'previewDeleteAssetOperation',
    operation: 'mutation',
    component: 'previewDeleteAssetOperation',
    args: deleteAssetArgs.args,
    returns: operationPreviewValidator(),
  },
  {
    exportName: 'restoreAsset',
    operation: 'mutation',
    component: 'restoreAsset',
    args: { assetId: v.string() },
    returns: v.null(),
  },
  {
    exportName: 'purgeAsset',
    operation: 'mutation',
    component: 'purgeAsset',
    args: confirmedArgs(purgeAssetArgs),
    returns: v.null(),
  },
  {
    exportName: 'previewPurgeAssetOperation',
    operation: 'mutation',
    component: 'previewPurgeAssetOperation',
    args: purgeAssetArgs,
    returns: operationPreviewValidator(),
  },
] as const satisfies readonly BridgeEntry[]

export function createAssetsBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
