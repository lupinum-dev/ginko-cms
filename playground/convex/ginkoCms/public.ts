import {
  count as countArgs,
  list as listArgs,
  nav as navArgs,
  page as pageArgs,
  routeMeta as routeMetaArgs,
  routes as routesArgs,
  search as searchArgs,
  singleton as singletonArgs,
  sitemap as sitemapArgs,
  siteData as siteDataArgs,
  surround as surroundArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/public.js'

import { components } from '../_generated/api.js'
import { query } from '../_generated/server.js'
import { mcpCallerArgs, stripMcpCallerArgs } from './mcpCaller.js'

export const page = query({
  args: { ...pageArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.page, stripMcpCallerArgs(args)),
})

export const routeMeta = query({
  args: routeMetaArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.routeMeta, args),
})

export const list = query({
  args: { ...listArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.list, stripMcpCallerArgs(args)),
})

export const count = query({
  args: countArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.count, args),
})

export const nav = query({
  args: { ...navArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.nav, stripMcpCallerArgs(args)),
})

export const surround = query({
  args: surroundArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.surround, args),
})

export const search = query({
  args: { ...searchArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.search, stripMcpCallerArgs(args)),
})

export const sitemap = query({
  args: { ...sitemapArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.sitemap, stripMcpCallerArgs(args)),
})

export const routes = query({
  args: { ...routesArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.routes, stripMcpCallerArgs(args)),
})

export const singleton = query({
  args: singletonArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.singleton, args),
})

export const siteData = query({
  args: siteDataArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.siteData, args),
})
