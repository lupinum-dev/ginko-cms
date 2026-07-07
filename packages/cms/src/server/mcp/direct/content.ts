import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { failFromError, loadAgentContext, ok } from '../_shared/agent-tools'

const jsonRecord = z.record(z.string(), z.unknown())
const nodeKind = z.enum(['page', 'folder', 'group', 'section'])

export const createEntry = defineMcpTool({
  name: 'create-entry',
  description: 'Create a new CMS entry in a collection.',
  inputSchema: {
    agentRunId: z.string().describe('Active agent run id for this write.'),
    collection: z.string().describe('Collection slug.'),
    locale: z.string().optional(),
    slug: z.string().describe('Draft slug for the new entry.'),
    shared: jsonRecord.optional(),
    localized: jsonRecord.optional(),
    parentEntryId: z.string().optional(),
    orderRank: z.string().optional(),
    nodeKind: nodeKind.optional(),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'createEntries')
      const result = await context.convex.mutation(api.ginkoCms.editor.mcpCreateEntry, args)
      return ok(result, 'Created entry.')
    } catch (error) {
      return failFromError(error, 'Failed to create entry.')
    }
  },
})

export const listEntries = defineMcpTool({
  name: 'list-entries',
  description: 'List CMS entries for a collection and locale.',
  inputSchema: {
    collection: z.string(),
    locale: z.string(),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const entries = await context.convex.query(api.ginkoCms.editor.listEntries, args)
      const count = Array.isArray(entries) ? entries.length : 0
      return ok({ entries }, `Listed ${count} entries in "${args.collection}".`)
    } catch (error) {
      return failFromError(error, 'Failed to list entries.')
    }
  },
})

export const saveEntryDraft = defineMcpTool({
  name: 'save-entry-draft',
  description: 'Save shared, placement, slug, and localized draft fields for an entry.',
  inputSchema: {
    agentRunId: z.string().describe('Active agent run id for this write.'),
    entryId: z.string().describe('The entry to update.'),
    expectedDraftVersion: z.number().describe('Current draft version observed before saving.'),
    patch: z.object({
      shared: z
        .object({
          parentEntryId: z.union([z.string(), z.null()]).optional(),
          orderRank: z.union([z.string(), z.null()]).optional(),
          slug: z.union([z.string(), z.null()]).optional(),
          shared: jsonRecord.optional(),
          nodeKind: nodeKind.optional(),
        })
        .optional(),
      locales: z
        .record(
          z.string(),
          z.object({
            slug: z.union([z.string(), z.null()]).optional(),
            values: jsonRecord.optional(),
            bodyMdc: z.union([z.string(), z.null()]).optional(),
          }),
        )
        .optional(),
    }),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'editEntries')
      const result = await context.convex.mutation(api.ginkoCms.editor.mcpSaveEntryDraft, args)
      return ok(result, 'Saved entry draft.')
    } catch (error) {
      return failFromError(error, 'Failed to save entry draft.')
    }
  },
})
