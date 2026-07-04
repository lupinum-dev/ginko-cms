import { deleteAsset } from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'

import { components } from '#convex/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: deleteAsset,
  operation: {
    execute: components.ginkoCms.assets.deleteAssetOperationExecute,
    preview: components.ginkoCms.assets.previewDeleteAssetOperation,
  },
  capability: 'manageAssets',
  meta: {
    name: 'delete-asset',
    destructive: true,
  },
  group: 'assets',
  respond: ({ args, result, ok }) => {
    void result
    return ok({ deleted: true, assetId: args.assetId }, 'Deleted asset.')
  },
})

export default tool
