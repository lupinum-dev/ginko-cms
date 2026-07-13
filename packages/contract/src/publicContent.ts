import type { JsonMap, JsonValue } from './types.js'

export type GinkoProfileName = 'page' | 'list' | 'search' | 'nav'

export type GinkoPublicErrorCode =
  | 'invalid_collection'
  | 'invalid_locale'
  | 'invalid_cursor'
  | 'invalid_query'
  | 'invalid_limit'
  | 'invalid_sort'
  | 'invalid_surround_mode'
  | 'data_only_collection'
  | 'route_collision'

export interface GinkoRoute<Locale extends string = string> {
  slug: string
  path: string
  locale: Locale
  source: 'published'
  href?: string
}

export interface GinkoLocaleResolution<Locale extends string = string> {
  requested: Locale
  resolved: Locale
  policy: 'strict' | 'transparent'
  fallbacks: {
    fields: Array<{ path: string; from: Locale }>
  }
}

export interface GinkoPublicAssetFact {
  fieldPath: string
  assetId: string
  url: string
  expiresAt: number | null
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  bytes: number
  sha256: string
}

export interface GinkoPublicEntry<
  Collection extends string = string,
  Data extends object = JsonMap,
  Locale extends string = string,
> {
  id: string
  collection: Collection
  route: GinkoRoute<Locale>
  translations: Array<{
    locale: Locale
    route: GinkoRoute<Locale>
    status: 'published' | 'missing'
  }>
  locale: GinkoLocaleResolution<Locale>
  title: string
  data: Data
  bodyAst?: JsonValue
  toc?: JsonValue
  publishedAt: string
  updatedAt: string
  revision: string
  stableId: string
  assetFacts: GinkoPublicAssetFact[]
}

export type GinkoPageResult<Entry, Locale extends string = string> =
  | {
      status: 'found'
      page: Entry
      collection: string
      locale: GinkoLocaleResolution<Locale>
      breadcrumbs: Array<{ title: string; route: GinkoRoute<Locale>; routable: boolean }>
      seo: {
        title: string
        description: string
        canonical: string
        alternates: Array<{ locale: Locale; hreflang: string; route: GinkoRoute<Locale> }>
        xDefault: GinkoRoute<Locale> | null
      }
    }
  | {
      status: 'redirect'
      page: null
      collection: string
      locale: GinkoLocaleResolution<Locale>
      breadcrumbs: []
      seo: null
      redirectTo: GinkoRoute<Locale>
      redirectedFrom: string
    }
  | {
      status: 'not-found'
      page: null
      collection: string
      locale: GinkoLocaleResolution<Locale>
      breadcrumbs: []
      seo: null
    }

export interface GinkoPageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

export interface GinkoRouteRecord {
  collection: string
  stableId: string
  locale: string
  path: string
  sitemapIncluded: boolean
  lastmod: string
}

export interface GinkoRoutesResult {
  routes: GinkoRouteRecord[]
  pageInfo: GinkoPageInfo
}

export interface GinkoListResult<Entry, Locale extends string = string> {
  entries: Entry[]
  pageInfo: GinkoPageInfo
  collection: string
  locale: GinkoLocaleResolution<Locale>
}

export interface GinkoNavNode<Entry> {
  entry: Entry
  children: Array<GinkoNavNode<Entry>>
}

export interface GinkoNavResult<Entry, Locale extends string = string> {
  tree: Array<GinkoNavNode<Entry>>
  collection: string
  locale: GinkoLocaleResolution<Locale>
}

export interface GinkoSurroundResult<Entry, Locale extends string = string> {
  previous: Entry[]
  next: Entry[]
  collection: string
  locale: GinkoLocaleResolution<Locale>
}

export interface GinkoSearchResult<Entry, Locale extends string = string> {
  results: Entry[]
  pageInfo: GinkoPageInfo
  locale: GinkoLocaleResolution<Locale>
}

export interface GinkoSitemapUrl<Locale extends string = string> {
  collection: string
  id: string
  route: GinkoRoute<Locale>
  alternates: Array<{ locale: Locale; hreflang: string; route: GinkoRoute<Locale> }>
  xDefault: GinkoRoute<Locale> | null
  lastmod: string
}

export interface GinkoSitemapResult<Locale extends string = string> {
  urls: Array<GinkoSitemapUrl<Locale>>
  pageInfo: GinkoPageInfo
}

export interface GinkoSingletonResult<
  Name extends string = string,
  Data = unknown,
  Locale extends string = string,
> {
  name: Name
  singleton: Data | null
  locale: GinkoLocaleResolution<Locale>
  failure:
    | null
    | 'missing_locale'
    | 'unknown_collection'
    | 'not_singleton'
    | 'mode_mismatch'
    | 'no_published_entry'
}

export interface GinkoSiteDataResult<
  Key extends string = string,
  Data = unknown,
  Locale extends string = string,
> {
  key: Key
  data: Data | null
  locale: GinkoLocaleResolution<Locale>
}

export interface GinkoCollectionContract {
  page: GinkoPublicEntry<string, object, string>
  list: GinkoPublicEntry<string, object, string>
  search: GinkoPublicEntry<string, object, string>
  nav: GinkoPublicEntry<string, object, string>
  sort: string
  routeBacked: boolean
}

export interface GinkoPublicContract {
  locales: string
  collections: Record<string, GinkoCollectionContract>
  singletons: object
  siteData: object
}

export type GinkoLocaleFor<Contract extends GinkoPublicContract> = Extract<
  Contract['locales'],
  string
>

export type GinkoCollectionName<Contract extends GinkoPublicContract> = Extract<
  keyof Contract['collections'],
  string
>

export type GinkoRouteBackedCollectionName<Contract extends GinkoPublicContract> = {
  [Collection in GinkoCollectionName<Contract>]: Contract['collections'][Collection]['routeBacked'] extends true
    ? Collection
    : never
}[GinkoCollectionName<Contract>]

export type GinkoSingletonName<Contract extends GinkoPublicContract> = Extract<
  keyof Contract['singletons'],
  string
>

export type GinkoSiteDataKey<Contract extends GinkoPublicContract> = Extract<
  keyof Contract['siteData'],
  string
>

export type GinkoEntryFor<
  Contract extends GinkoPublicContract,
  Collection extends GinkoCollectionName<Contract>,
  Profile extends GinkoProfileName,
> = Contract['collections'][Collection][Profile]

export type GinkoSortFor<
  Contract extends GinkoPublicContract,
  Collection extends GinkoCollectionName<Contract>,
> = Extract<Contract['collections'][Collection]['sort'], string>

export type GinkoSearchEntry<Contract extends GinkoPublicContract> = {
  [Collection in GinkoCollectionName<Contract>]: GinkoEntryFor<Contract, Collection, 'search'>
}[GinkoCollectionName<Contract>]
