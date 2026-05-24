import {
  list as listArgs,
  nav as navArgs,
  page as pageArgs,
  routeMeta as routeMetaArgs,
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
  ginkoSearchResultValidator,
  ginkoSingletonResultValidator,
  ginkoSitemapResultValidator,
  ginkoSiteDataResultValidator,
  ginkoSurroundResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'

import { createBridgeModule, type BridgeEntry } from './create.js'

export const entries = [
  {
    exportName: 'page',
    operation: 'query',
    component: 'page',
    args: pageArgs.args,
    returns: ginkoPageResultValidator,
  },
  {
    exportName: 'routeMeta',
    operation: 'query',
    component: 'routeMeta',
    args: routeMetaArgs.args,
    returns: ginkoPageResultValidator,
  },
  {
    exportName: 'list',
    operation: 'query',
    component: 'list',
    args: listArgs.args,
    returns: ginkoListResultValidator,
  },
  {
    exportName: 'nav',
    operation: 'query',
    component: 'nav',
    args: navArgs.args,
    returns: ginkoNavResultValidator,
  },
  {
    exportName: 'surround',
    operation: 'query',
    component: 'surround',
    args: surroundArgs.args,
    returns: ginkoSurroundResultValidator,
  },
  {
    exportName: 'search',
    operation: 'query',
    component: 'search',
    args: searchArgs.args,
    returns: ginkoSearchResultValidator,
  },
  {
    exportName: 'sitemap',
    operation: 'query',
    component: 'sitemap',
    args: sitemapArgs.args,
    returns: ginkoSitemapResultValidator,
  },
  {
    exportName: 'singleton',
    operation: 'query',
    component: 'singleton',
    args: singletonArgs.args,
    returns: ginkoSingletonResultValidator,
  },
  {
    exportName: 'siteData',
    operation: 'query',
    component: 'siteData',
    args: siteDataArgs.args,
    returns: ginkoSiteDataResultValidator,
  },
] as const satisfies readonly BridgeEntry[]

export function createPublicBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
