import { unpublishEntry } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'

import { components } from '#convex/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: unpublishEntry,
  operation: {
    execute: components.ginkoCms.editor.unpublishEntryOperationExecute,
    preview: components.ginkoCms.editor.previewUnpublishEntryOperation,
  },
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
