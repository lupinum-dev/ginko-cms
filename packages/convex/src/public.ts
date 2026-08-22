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
import {
  ginkoListResultValidator,
  ginkoNavResultValidator,
  ginkoPageResultValidator,
  ginkoRoutesResultValidator,
  ginkoSearchResultValidator,
  ginkoSingletonResultValidator,
  ginkoSitemapResultValidator,
  ginkoSiteDataResultValidator,
  ginkoSurroundResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { callerQuery } from './functions.js'
import {
  countHandler,
  listHandler,
  routesHandler,
  searchHandler,
  sitemapHandler,
} from './publicReads/discoveryHandlers.js'
import { navHandler, surroundHandler } from './publicReads/navigationHandlers.js'
import { pageHandler, routeMetaHandler } from './publicReads/pageHandlers.js'
import { singletonHandler, siteDataHandler } from './publicReads/siteHandlers.js'
import { cmsProviderWireResult, cmsProviderWireValidator } from './publicReads/wire.js'

// AUTH-AUDIT: all exports in this module are intentionally unguarded. The
// handlers are read-only and consume published projections or public site data.
// Registrations stay here so every external function path remains `public:*`.
export const page = callerQuery.public({
  id: 'public:page',
  args: pageArgs.args,
  returns: cmsProviderWireValidator(ginkoPageResultValidator),
  handler: async (ctx, args) => cmsProviderWireResult(await pageHandler(ctx, args)),
})

export const routeMeta = callerQuery.public({
  id: 'public:routeMeta',
  args: routeMetaArgs.args,
  returns: ginkoPageResultValidator,
  handler: routeMetaHandler,
})

export const list = callerQuery.public({
  id: 'public:list',
  args: listArgs.args,
  returns: cmsProviderWireValidator(ginkoListResultValidator),
  handler: async (ctx, args) => cmsProviderWireResult(await listHandler(ctx, args)),
})

export const count = callerQuery.public({
  id: 'public:count',
  args: countArgs.args,
  returns: v.number(),
  handler: countHandler,
})

export const nav = callerQuery.public({
  id: 'public:nav',
  args: navArgs.args,
  returns: cmsProviderWireValidator(ginkoNavResultValidator),
  handler: async (ctx, args) => cmsProviderWireResult(await navHandler(ctx, args)),
})

export const surround = callerQuery.public({
  id: 'public:surround',
  args: surroundArgs.args,
  returns: cmsProviderWireValidator(ginkoSurroundResultValidator),
  handler: async (ctx, args) => cmsProviderWireResult(await surroundHandler(ctx, args)),
})

export const search = callerQuery.public({
  id: 'public:search',
  args: searchArgs.args,
  returns: cmsProviderWireValidator(ginkoSearchResultValidator),
  handler: async (ctx, args) => cmsProviderWireResult(await searchHandler(ctx, args)),
})

export const sitemap = callerQuery.public({
  id: 'public:sitemap',
  args: sitemapArgs.args,
  returns: ginkoSitemapResultValidator,
  handler: sitemapHandler,
})

export const routes = callerQuery.public({
  id: 'public:routes',
  args: routesArgs.args,
  returns: cmsProviderWireValidator(ginkoRoutesResultValidator),
  handler: async (ctx, args) => cmsProviderWireResult(await routesHandler(ctx, args)),
})

export const singleton = callerQuery.public({
  id: 'public:singleton',
  args: singletonArgs.args,
  returns: ginkoSingletonResultValidator,
  handler: singletonHandler,
})

export const siteData = callerQuery.public({
  id: 'public:siteData',
  args: siteDataArgs.args,
  returns: cmsProviderWireValidator(ginkoSiteDataResultValidator),
  handler: async (ctx, args) => cmsProviderWireResult(await siteDataHandler(ctx, args)),
})
