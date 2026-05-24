import type { GinkoPublicEntry, JsonValue } from './index.js'

export interface GinkoCollections {
  locales: string
  collections: {}
  singletons: {}
  siteData: {}
}

export type GinkoCollectionName = never
export type GinkoRouteBackedCollectionName = never
export type GinkoDataCollectionName = never
