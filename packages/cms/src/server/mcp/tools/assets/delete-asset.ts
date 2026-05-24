import { deleteAsset } from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'
import { deleteAssetOperation } from '@lupinum/ginko-cms-convex/operations'

import { internal } from '#trellis/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: deleteAsset,
  operation: deleteAssetOperation,
  call: internal.ginkoCmsMcp.deleteAsset,
  capability: 'manageAssets',
  meta: {
    name: 'delete-asset',
    destructive: true,
  },
  preview: internal.ginkoCmsMcp.previewDeleteAssetOperation,
  group: 'assets',
  respond: ({ args, result, ok }) => {
    void result
    return ok({ deleted: true, assetId: args.assetId }, 'Deleted asset.')
  },
})

export default tool
