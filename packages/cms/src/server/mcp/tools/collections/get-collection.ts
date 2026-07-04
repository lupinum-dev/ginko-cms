import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { components } from '#convex/api'

import { asRecord, fail, loadAgentContext, ok } from '../../_shared/agent-tools'

function compactSettings(settings: unknown) {
  const record = asRecord(settings)
  const cmsSchema = asRecord(record.cmsSchema)
  const { artifact: _artifact, ...cmsSchemaSummary } = cmsSchema
  const { cmsSchema: _cmsSchema, ...rest } = record

  return {
    ...rest,
    ...(Object.keys(cmsSchemaSummary).length ? { cmsSchema: cmsSchemaSummary } : {}),
  }
}

function compactCollection(collection: Record<string, unknown>) {
  const fields = Array.isArray(collection.fields)
    ? collection.fields.map((item) => {
        const field =
          item && typeof item === 'object' && !Array.isArray(item)
            ? (item as Record<string, unknown>)
            : {}
        return {
          key: field.key,
          type: field.type,
          label: field.label,
          localized: field.localized,
          required: field.required,
          relation: field.relation,
        }
      })
    : []

  return {
    slug: collection.slug,
    label: collection.label,
    type: collection.type,
    locales: collection.locales,
    routing: collection.routing,
    settings: compactSettings(collection.settings),
    fields,
  }
}

const tool = defineMcpTool({
  name: 'get-collection',
  description: 'Load one collection definition.',
  inputSchema: {
    slug: z.string(),
    compact: z
      .boolean()
      .optional()
      .describe('Return a compact schema summary without large generated artifacts.'),
  },
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const collection = await context.convex.query(components.ginkoCms.collections.getCollection, {
        slug: args.slug,
      })
      if (!collection) return fail(`Collection "${args.slug}" not found.`)
      const record = collection as Record<string, unknown>
      return ok(
        args.compact ? compactCollection(record) : collection,
        `Loaded ${args.compact ? 'compact ' : ''}collection "${args.slug}".`,
      )
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Failed to load collection.')
    }
  },
})

export default tool
