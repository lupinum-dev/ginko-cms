import { deleteEntry } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { deleteEntryOperation } from '@lupinum/ginko-cms-convex/operations'

import { internal } from '#trellis/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: deleteEntry,
  operation: deleteEntryOperation,
  call: internal.ginkoCmsMcp.deleteEntry,
  capability: 'deleteEntries',
  meta: {
    name: 'delete-entry',
    destructive: true,
  },
  preview: internal.ginkoCmsMcp.previewDeleteEntryOperation,
  group: 'content',
  respond: ({ args, result, ok, error }) => {
    void args
    void result
    void error
    return ok({ deleted: true }, 'Deleted entry.')
  },
})

export default tool
