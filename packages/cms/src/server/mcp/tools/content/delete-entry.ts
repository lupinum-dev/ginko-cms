import { deleteEntry } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'

import { components } from '#convex/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: deleteEntry,
  operation: {
    execute: components.ginkoCms.editor.deleteEntryOperationExecute,
    preview: components.ginkoCms.editor.previewDeleteEntryOperation,
  },
  capability: 'deleteEntries',
  meta: {
    name: 'delete-entry',
    destructive: true,
  },
  group: 'content',
  respond: ({ args, result, ok, error }) => {
    void args
    void result
    void error
    return ok({ deleted: true }, 'Deleted entry.')
  },
})

export default tool
