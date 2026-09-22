import type { JsonMap, JsonObject, JsonValue } from './types.js'

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
  /** JSON transport for parser ASTs with keys that Convex reserves, such as props.$. */
  bodyAstJson?: string
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

/** Resolve verified asset facts on a copy, preserving canonical stored identities. */
export function applyContentAssetFacts<Data, Body>(input: {
  data: Data
  bodyAst: Body
  assetFacts: ReadonlyArray<Pick<GinkoPublicAssetFact, 'fieldPath' | 'assetId' | 'url'>>
}): { data: Data; bodyAst: Body } {
  const clone = <T>(value: T): T =>
    value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
  const data = clone(input.data)
  const bodyAst = clone(input.bodyAst)
  const roots: Record<string, unknown> = { data, bodyAst }
  for (const fact of input.assetFacts) {
    if (!/^(?:data|bodyAst)(?:\.[\w-]+|\[\d+\])+$/.test(fact.fieldPath)) {
      throw new Error('Invalid asset field path.')
    }
    const segments = [...fact.fieldPath.matchAll(/([\w-]+)|\[(\d+)\]/g)].map((match) =>
      match[2] === undefined ? match[1]! : Number(match[2]),
    )
    let current: unknown = roots
    for (let index = 0; index < segments.length - 1; index++) {
      const segment = segments[index]!
      if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment))
        throw new Error('Asset field path is missing.')
      current = (current as Record<string | number, unknown>)[segment]
    }
    const terminal = segments.at(-1)!
    if (
      !current ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, terminal) ||
      (current as Record<string | number, unknown>)[terminal] !== fact.assetId
    ) {
      throw new Error('Asset field identity does not match.')
    }
    ;(current as Record<string | number, unknown>)[terminal] = fact.url
  }
  return { data, bodyAst }
}

/** Decode parser JSON without dropping framework markers or trusting arbitrary object shapes. */
export function decodeContentBodyAstJson(source: string | null): JsonObject | null {
  if (source === null) return null
  if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > 8 * 1024 * 1024) {
    throw new TypeError('CMS_BODY_AST_INVALID: expected bounded article-body JSON.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new TypeError('CMS_BODY_AST_INVALID: malformed article-body JSON.')
  }
  if (!isBodyJsonObject(parsed) || parsed.type !== 'root' || !Array.isArray(parsed.children)) {
    throw new TypeError('CMS_BODY_AST_INVALID: expected a Markdown root with children.')
  }
  return parsed
}

function isBodyJsonObject(root: unknown): root is JsonObject {
  if (root === null || typeof root !== 'object' || Array.isArray(root)) return false
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  let nodes = 0
  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (++nodes > 100_000 || depth > 64) return false
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return false
      continue
    }
    if (!value || typeof value !== 'object') return false
    const children = Array.isArray(value) ? value : Object.values(value)
    for (const child of children) stack.push({ value: child, depth: depth + 1 })
  }
  return true
}
