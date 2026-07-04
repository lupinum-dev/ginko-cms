import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { components } from '#convex/api'

import { asRecord, fail, loadAgentContext, ok } from '../../_shared/agent-tools'

function hrefFor(
  path: unknown,
  routeHref: unknown,
  locale: string,
  defaultLocale: string,
): string | null {
  if (typeof routeHref === 'string' && routeHref) return routeHref
  if (typeof path !== 'string' || !path) return null
  if (!locale || locale === defaultLocale) return path
  return `/${locale}${path === '/' ? '' : path}`
}

function compactEntry(value: unknown, locale: string, defaultLocale: string) {
  const entry = asRecord(value)
  const data = asRecord(entry.data)
  const route = asRecord(entry.route)
  const seo = asRecord(entry.seo)
  const href = hrefFor(route.path, route.href, locale, defaultLocale)
  return {
    id: entry.id ?? entry._id ?? null,
    stableId: entry.stableId ?? entry.revision ?? null,
    collection: entry.collection ?? null,
    locale: entry.locale ?? null,
    title: entry.title ?? seo.title ?? null,
    description: seo.description ?? data.description ?? null,
    href,
    route: {
      path: route.path ?? null,
      href,
    },
    publishedAt: entry.publishedAt ?? null,
    updatedAt: entry.updatedAt ?? null,
  }
}

export default defineMcpTool({
  name: 'list',
  description: 'List published CMS entries with cursor pagination.',
  inputSchema: {
    collection: z.string(),
    locale: z.string(),
    limit: z.number().optional(),
    cursor: z.string().nullable().optional(),
    sort: z.string().optional(),
    compact: z
      .boolean()
      .optional()
      .describe('Return title/path/status summaries instead of full public entry payloads.'),
  },
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const { compact, ...queryArgs } = args
      const result = await context.convex.query(components.ginkoCms.public.list, queryArgs)
      if (!compact) {
        return ok(result, `Listed public entries in "${args.collection}".`)
      }
      const record = asRecord(result)
      const entries = Array.isArray(record.entries) ? record.entries : []
      const collections = await context.convex.query(
        components.ginkoCms.collections.listCollections,
        {},
      )
      const collection = (Array.isArray(collections) ? collections : []).find(
        (candidate) => candidate.slug === args.collection,
      )
      const defaultLocale =
        collection && Array.isArray(collection.locales) && typeof collection.locales[0] === 'string'
          ? collection.locales[0]
          : args.locale
      return ok(
        {
          ...record,
          entries: entries.map((entry) => compactEntry(entry, args.locale, defaultLocale)),
          compact: true,
        },
        `Listed ${entries.length} public entr${entries.length === 1 ? 'y' : 'ies'} in "${args.collection}" compactly.`,
      )
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Failed to list public entries.')
    }
  },
})
