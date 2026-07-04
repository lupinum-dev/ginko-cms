import {
  createEntry as createEntrySchema,
  listEntries as listEntriesSchema,
  saveEntryDraft as saveEntryDraftSchema,
  unarchiveEntry as unarchiveEntrySchema,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'

import { components } from '#convex/api'

import { projectTool, type ProjectToolDefinition } from '../_shared/project-tool-runtime'

export const createEntry: ProjectToolDefinition = projectTool({
  schema: createEntrySchema,
  capability: 'createEntries',
  meta: {
    name: 'create-entry',
  },
  operation: {
    execute: components.ginkoCms.editor.createEntry,
  },
  group: 'content',
  respond: ({ args, result, ok, error }) => {
    void args
    void error
    return ok(result, 'Created entry.')
  },
})

export const listEntries: ProjectToolDefinition = projectTool({
  schema: listEntriesSchema,
  call: components.ginkoCms.editor.listEntries,
  capability: 'readCms',
  meta: {
    name: 'list-entries',
  },
  group: 'content',
  respond: ({ args, result, ok, error }) => {
    void error
    const entries = result
    return ok({ entries }, `Listed ${entries.length} entries in "${args.collection}".`)
  },
  operation: 'query',
})

export const saveEntryDraft: ProjectToolDefinition = projectTool({
  schema: saveEntryDraftSchema,
  capability: 'editEntries',
  meta: {
    name: 'save-entry-draft',
  },
  operation: {
    execute: components.ginkoCms.editor.saveEntryDraft,
  },
  group: 'content',
  respond: ({ result, ok }) => ok(result, 'Saved entry draft.'),
})

export const unarchiveEntry: ProjectToolDefinition = projectTool({
  schema: unarchiveEntrySchema,
  capability: 'deleteEntries',
  meta: {
    name: 'unarchive-entry',
    description: 'Restore an archived entry to draft state.',
  },
  operation: {
    execute: components.ginkoCms.editor.unarchiveEntry,
  },
  group: 'content',
  respond: ({ args, result, ok }) => {
    void result
    return ok({ unarchived: true, entryId: args.entryId }, `Unarchived entry "${args.entryId}".`)
  },
})
