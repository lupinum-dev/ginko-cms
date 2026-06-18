import { archiveEntry } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { operations } from '@lupinum/ginko-cms-convex/operation-handles/mcp'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: archiveEntry,
  operation: operations.ginkoCms.archiveEntry,
  capability: 'deleteEntries',
  meta: {
    name: 'archive-entry',
    description: 'Archive an entry and remove its public output after preview-token confirmation.',
    destructive: true,
  },
  group: 'content',
  respond: ({ args, result, ok }) => {
    void result
    return ok({ archived: true, entryId: args.entryId }, `Archived entry "${args.entryId}".`)
  },
})

export default tool
