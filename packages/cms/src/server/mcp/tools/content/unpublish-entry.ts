import { unpublishEntry } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { unpublishEntryOperation } from '@lupinum/ginko-cms-convex/operations'

import { internal } from '#trellis/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: unpublishEntry,
  operation: unpublishEntryOperation,
  call: internal.ginkoCmsMcp.unpublishEntry,
  capability: 'publishEntries',
  meta: {
    name: 'unpublish-entry',
    destructive: true,
  },
  preview: internal.ginkoCmsMcp.previewUnpublishEntryOperation,
  group: 'content',
  respond: ({ args, result, ok, error }) => {
    void args
    void result
    void error
    return ok({ unpublished: true }, 'Unpublished entry.')
  },
})

export default tool
