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
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.page, args as never),
})

export const routeMeta = query({
  args: routeMetaArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.routeMeta, args as never),
})

export const list = query({
  args: listArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.list, args as never),
})

export const nav = query({
  args: navArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.public.nav, args as never),
})

export const surround = query({
  args: surroundArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.surround, args as never),
})

export const search = query({
  args: searchArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.search, args as never),
})

export const sitemap = query({
  args: sitemapArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.sitemap, args as never),
})

export const routes = query({
  args: routesArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.routes, args as never),
})

export const singleton = query({
  args: singletonArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.singleton, args as never),
})

export const siteData = query({
  args: siteDataArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.public.siteData, args as never),
})
