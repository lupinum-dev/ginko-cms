import { unpublishEntry } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { operations } from '@lupinum/ginko-cms-convex/operation-handles/mcp'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: unpublishEntry,
  operation: operations.ginkoCms.unpublishEntry,
  capability: 'publishEntries',
  meta: {
    name: 'unpublish-entry',
    destructive: true,
  },
  group: 'content',
  respond: ({ args, result, ok, error }) => {
    void args
    void result
    void error
    return ok({ unpublished: true }, 'Unpublished entry.')
  },
})

export default tool
