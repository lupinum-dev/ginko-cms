import { deleteAsset } from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'
import { operations } from '@lupinum/ginko-cms-convex/operation-handles/mcp'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: deleteAsset,
  operation: operations.ginkoCms.deleteAsset,
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
