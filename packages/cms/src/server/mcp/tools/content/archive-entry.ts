import { archiveEntry } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { archiveEntryOperation } from '@lupinum/ginko-cms-convex/operations'

import { internal } from '#trellis/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: archiveEntry,
  operation: archiveEntryOperation,
  call: internal.ginkoCmsMcp.archiveEntry,
  capability: 'deleteEntries',
  meta: {
    name: 'archive-entry',
    description: 'Archive an entry and remove its public output after preview-token confirmation.',
    destructive: true,
  },
  preview: internal.ginkoCmsMcp.previewArchiveEntryOperation,
  group: 'content',
  respond: ({ args, result, ok }) => {
    void result
    return ok({ archived: true, entryId: args.entryId }, `Archived entry "${args.entryId}".`)
  },
})

export default tool
