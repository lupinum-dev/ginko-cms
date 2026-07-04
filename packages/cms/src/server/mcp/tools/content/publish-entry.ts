import { publishEntry as publishEntryArgs } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'

import { components } from '#convex/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const tool: ProjectToolDefinition = projectTool({
  schema: publishEntryArgs,
  operation: {
    execute: components.ginkoCms.editor.publishEntryOperationExecute,
    preview: components.ginkoCms.editor.previewPublishEntryOperation,
  },
  capability: 'publishEntries',
  meta: {
    name: 'publish-entry',
    destructive: true,
  },
  group: 'content',
  respond: ({ args, result, ok, error }) => {
    void error
    const locales = Array.isArray(args.locales) ? args.locales.map(String) : []
    return ok(
      result,
      `Published entry for locale${locales.length === 1 ? '' : 's'} ${locales.join(', ')}.`,
    )
  },
})

export default tool
