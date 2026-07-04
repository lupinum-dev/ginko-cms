import { archiveEntry } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'

import { components } from '#convex/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: archiveEntry,
  operation: {
    execute: components.ginkoCms.editor.archiveEntryOperationExecute,
    preview: components.ginkoCms.editor.previewArchiveEntryOperation,
  },
  capability: 'deleteEntries',
  meta: {
    name: 'archive-entry',
    description: 'Archive an entry and remove its public output after confirmation-token approval.',
    destructive: true,
  },
  group: 'content',
  respond: ({ args, result, ok }) => {
    void result
    return ok({ archived: true, entryId: args.entryId }, `Archived entry "${args.entryId}".`)
  },
})

export default tool
