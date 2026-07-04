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

function compactNode(
  value: unknown,
  locale: string,
  defaultLocale: string,
): Record<string, unknown> {
  const node = asRecord(value)
  const entry = asRecord(node.entry)
  const route = asRecord(entry.route ?? node.route)
  const children = Array.isArray(node.children) ? node.children : []
  const path = route.path ?? entry.path ?? node.path ?? null
  const href = hrefFor(path, route.href ?? entry.href ?? node.href, locale, defaultLocale)
  return {
    id: entry.id ?? node.id ?? node._id ?? null,
    stableId: entry.stableId ?? entry.revision ?? node.stableId ?? null,
    title: entry.title ?? node.title ?? node.label ?? null,
    label: entry.label ?? entry.title ?? node.label ?? node.title ?? null,
    href,
    route: {
      path,
      href,
    },
    children: children.map((child) => compactNode(child, locale, defaultLocale)),
  }
}

export default defineMcpTool({
  name: 'nav',
  description: 'Load the published navigation tree with the locked public content contract.',
  inputSchema: {
    collection: z.string(),
    locale: z.string(),
    compact: z
      .boolean()
      .optional()
      .describe('Return a compact nav tree without full public entry data payloads.'),
  },
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const { compact, ...queryArgs } = args
      const result = await context.convex.query(components.ginkoCms.public.nav, queryArgs)
      const record = asRecord(result)
      const tree = Array.isArray(record.tree) ? record.tree : []
      if (!compact) {
        return ok(result, `Loaded nav tree for "${args.collection}" (${tree.length} root nodes).`)
      }
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
          tree: tree.map((node) => compactNode(node, args.locale, defaultLocale)),
          compact: true,
        },
        `Loaded compact nav tree for "${args.collection}" (${tree.length} root nodes).`,
      )
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Failed to load public nav.')
    }
  },
})
