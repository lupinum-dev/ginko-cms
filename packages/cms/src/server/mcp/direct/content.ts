import {
  createEntry as createEntrySchema,
  listEntries as listEntriesSchema,
  saveEntryDraft as saveEntryDraftSchema,
  unarchiveEntry as unarchiveEntrySchema,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'

import { internal } from '#trellis/api'

import { projectTool, type ProjectToolDefinition } from '../_shared/project-tool-runtime'

export const createEntry: ProjectToolDefinition = projectTool({
  schema: createEntrySchema,
  call: internal.ginkoCmsMcp.createEntry,
  capability: 'createEntries',
  meta: {
    name: 'create-entry',
  },
  safety: {
    kind: 'bounded-write',
    reason: 'Creates one CMS entry named by the provided collection and slug.',
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
  call: internal.ginkoCmsMcp.listEntries,
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
  call: internal.ginkoCmsMcp.saveEntryDraft,
  capability: 'editEntries',
  meta: {
    name: 'save-entry-draft',
  },
  safety: {
    kind: 'bounded-write',
    reason: 'Updates one draft entry explicitly named by entryId.',
  },
  group: 'content',
  respond: ({ result, ok }) => ok(result, 'Saved entry draft.'),
})

export const unarchiveEntry: ProjectToolDefinition = projectTool({
  schema: unarchiveEntrySchema,
  call: internal.ginkoCmsMcp.unarchiveEntry,
  capability: 'deleteEntries',
  meta: {
    name: 'unarchive-entry',
    description: 'Restore an archived entry to draft state.',
  },
  safety: {
    kind: 'bounded-write',
    reason: 'Restores one archived entry explicitly named by entryId.',
  },
  group: 'content',
  respond: ({ args, result, ok }) => {
    void result
    return ok({ unarchived: true, entryId: args.entryId }, `Unarchived entry "${args.entryId}".`)
  },
})
