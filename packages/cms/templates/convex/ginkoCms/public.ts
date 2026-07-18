import {
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

export const page = query({
  args: pageArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.page, args),
})

export const routeMeta = query({
  args: routeMetaArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.routeMeta, args),
})

export const list = query({
  args: listArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.list, args),
})

export const nav = query({
  args: navArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.nav, args),
})

export const surround = query({
  args: surroundArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.surround, args),
})

export const search = query({
  args: searchArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.search, args),
})

export const sitemap = query({
  args: sitemapArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.sitemap, args),
})

export const routes = query({
  args: routesArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.routes, args),
})

export const singleton = query({
  args: singletonArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.singleton, args),
})

export const siteData = query({
  args: siteDataArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.siteData, args),
})
