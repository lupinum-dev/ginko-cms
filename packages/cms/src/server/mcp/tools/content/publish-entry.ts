import { publishEntry as publishEntryArgs } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { publishEntryOperation } from '@lupinum/ginko-cms-convex/operations'
import { defineArgs } from '@lupinum/trellis/args'

import { internal } from '#trellis/api'

import { projectTool, type ProjectToolDefinition } from '../../_shared/project-tool-runtime'

const publishEntry = defineArgs({
  description: 'Publish one or more locales for an entry.',
  args: publishEntryArgs.args,
  meta: {
    entryId: publishEntryArgs.meta.entryId,
    expectedVersion: publishEntryArgs.meta.expectedVersion,
    locales: publishEntryArgs.meta.locales,
  },
})

const tool: ProjectToolDefinition = projectTool({
  schema: publishEntry,
  operation: publishEntryOperation,
  call: internal.ginkoCmsMcp.publishEntry,
  capability: 'publishEntries',
  meta: {
    name: 'publish-entry',
    destructive: true,
  },
  preview: internal.ginkoCmsMcp.previewPublishEntryOperation,
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
