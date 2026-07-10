import type {
  GinkoListResult,
  GinkoLocaleResolution,
  GinkoPageResult,
  GinkoPublicEntry,
  GinkoRoute,
  GinkoSearchResult,
  GinkoSitemapResult,
  GinkoSingletonResult,
  GinkoSiteDataResult,
  GinkoSurroundResult,
} from '@lupinum/ginko-cms-contract/shared/publicContent.js'
import type { JsonMap, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

export interface PublicProjectionEntry {
  _id: string
  collection: string
  slug: string
  path: string
  href: string
  locale: string
  resolvedLocale: string
  title: string
  data: JsonMap
  bodyAst?: JsonValue
  toc?: JsonValue
  publishedAt: number
  stableId: string
}

export interface PublicTranslationSummary {
  locale: string
  slug: string | null
  path: string | null
  href?: string | null
  published: boolean
}

export interface ProjectionPageResult {
  page: PublicProjectionEntry | null
  redirectTo: string | null
}

export interface ProjectionListResult {
  page: PublicProjectionEntry[]
  isDone: boolean
  continueCursor: string | null
}

export interface ProjectionSearchResultItem extends PublicProjectionEntry {
  snippet?: string | null
  highlights?: Array<{ start: number; end: number }>
}

export interface PublicSurroundItem {
  title: string
  path: string
}

export interface ProjectionSurroundResult {
  prev: PublicSurroundItem | null
  next: PublicSurroundItem | null
}

export function createLocaleResolution(args: {
  requested: string
  resolved?: string | null
  policy?: 'strict' | 'transparent'
  fallbacks?: Array<{ path: string; from: string }>
}): GinkoLocaleResolution {
  return {
    requested: args.requested,
    resolved: args.resolved ?? args.requested,
    policy: args.policy ?? 'strict',
    fallbacks: {
      fields: args.fallbacks ?? [],
    },
  }
}

export function toGinkoRoute(
  entry: Pick<PublicProjectionEntry, 'slug' | 'path' | 'href' | 'locale'>,
): GinkoRoute {
  return {
    slug: entry.slug,
    path: entry.path,
    href: entry.href,
    locale: entry.locale,
    source: 'published',
  }
}

export function toGinkoTranslations(
  translations: PublicTranslationSummary[],
): GinkoPublicEntry['translations'] {
  return translations
    .map((translation) => ({
      locale: translation.locale,
      route: {
        slug: translation.slug ?? '',
        path: translation.path ?? '',
        ...(translation.href ? { href: translation.href } : {}),
        locale: translation.locale,
        source: 'published' as const,
      },
      status:
        translation.published && translation.path ? ('published' as const) : ('missing' as const),
    }))
    .sort((left, right) => left.locale.localeCompare(right.locale))
}

export function toGinkoEntry(
  entry: PublicProjectionEntry,
  requestedLocale: string,
  translations: PublicTranslationSummary[] = [],
): GinkoPublicEntry {
  const locale = createLocaleResolution({
    requested: requestedLocale,
    resolved: entry.resolvedLocale,
  })

  return {
    id: entry._id,
    collection: entry.collection,
    route: toGinkoRoute(entry),
    translations: toGinkoTranslations(translations),
    locale,
    title: entry.title,
    data: entry.data,
    ...(entry.bodyAst ? { bodyAst: entry.bodyAst } : {}),
    ...(entry.toc ? { toc: entry.toc } : {}),
    publishedAt: toIso(entry.publishedAt),
    updatedAt: toIso(entry.publishedAt),
    revision: entry.stableId,
    stableId: entry.stableId,
  }
}

function seoDescriptionForEntry(entry: GinkoPublicEntry): string {
  const description = entry.data.description
  return typeof description === 'string' ? description : ''
}

export function toGinkoPageResult(args: {
  collection: string
  requestedLocale: string
  requestedPath: string
  result: ProjectionPageResult
  translations?: PublicTranslationSummary[]
  defaultLocale?: string
}): GinkoPageResult<GinkoPublicEntry> {
  const locale = createLocaleResolution({ requested: args.requestedLocale })

  if (args.result.redirectTo) {
    return {
      status: 'redirect',
      page: null,
      collection: args.collection,
      locale,
      breadcrumbs: [],
      seo: null,
      redirectTo: {
        slug: lastSegment(args.result.redirectTo),
        path: args.result.redirectTo,
        locale: args.requestedLocale,
        source: 'published',
      },
      redirectedFrom: args.requestedPath,
    }
  }

  if (!args.result.page) {
    return {
      status: 'not-found',
      page: null,
      collection: args.collection,
      locale,
      breadcrumbs: [],
      seo: null,
    }
  }

  const translations = args.translations ?? []
  const page = toGinkoEntry(args.result.page, args.requestedLocale, translations)
  const alternates = toGinkoTranslations(translations)
    .filter((translation) => translation.status === 'published')
    .map((translation) => ({
      locale: translation.locale,
      hreflang: translation.locale,
      route: translation.route,
    }))
  const xDefault =
    alternates.find((alternate) => alternate.locale === args.defaultLocale)?.route ??
    alternates[0]?.route ??
    null

  return {
    status: 'found',
    page,
    collection: args.collection,
    locale: page.locale,
    breadcrumbs: [],
    seo: {
      title: page.title,
      description: seoDescriptionForEntry(page),
      canonical: page.route.path,
      alternates,
      xDefault,
    },
  }
}

export function toGinkoListResult(args: {
  collection: string
  requestedLocale: string
  result: ProjectionListResult
  translationsByEntryId?: Map<string, PublicTranslationSummary[]>
}): GinkoListResult<GinkoPublicEntry> {
  return {
    entries: args.result.page.map((entry) =>
      toGinkoEntry(entry, args.requestedLocale, args.translationsByEntryId?.get(entry._id) ?? []),
    ),
    pageInfo: {
      hasNextPage: !args.result.isDone,
      endCursor: args.result.continueCursor,
    },
    collection: args.collection,
    locale: createLocaleResolution({ requested: args.requestedLocale }),
  }
}

export function toGinkoSearchResult(args: {
  requestedLocale: string
  results: ProjectionSearchResultItem[]
  translationsByEntryId?: Map<string, PublicTranslationSummary[]>
  pageInfo?: {
    hasNextPage: boolean
    endCursor: string | null
  }
}): GinkoSearchResult<GinkoPublicEntry> {
  return {
    results: args.results.map((entry) =>
      toGinkoEntry(entry, args.requestedLocale, args.translationsByEntryId?.get(entry._id) ?? []),
    ),
    pageInfo: args.pageInfo ?? {
      hasNextPage: false,
      endCursor: null,
    },
    locale: createLocaleResolution({ requested: args.requestedLocale }),
  }
}

export function toGinkoSurroundResult(args: {
  collection: string
  requestedLocale: string
  result: ProjectionSurroundResult
}): GinkoSurroundResult<PublicSurroundItem> {
  return {
    previous: args.result.prev ? [args.result.prev] : [],
    next: args.result.next ? [args.result.next] : [],
    collection: args.collection,
    locale: createLocaleResolution({ requested: args.requestedLocale }),
  }
}

export function toGinkoSitemapResult(args: {
  entries: PublicProjectionEntry[]
  translationsByEntryId: Map<string, PublicTranslationSummary[]>
  defaultLocale?: string
  pageInfo?: {
    hasNextPage: boolean
    endCursor: string | null
  }
}): GinkoSitemapResult {
  return {
    urls: args.entries.map((entry) => {
      const alternates = toGinkoTranslations(args.translationsByEntryId.get(entry._id) ?? [])
        .filter((translation) => translation.status === 'published')
        .map((translation) => ({
          locale: translation.locale,
          hreflang: translation.locale,
          route: translation.route,
        }))

      return {
        collection: entry.collection,
        id: entry._id,
        route: toGinkoRoute(entry),
        alternates,
        xDefault:
          alternates.find((alternate) => alternate.locale === args.defaultLocale)?.route ??
          alternates[0]?.route ??
          null,
        lastmod: toIso(entry.publishedAt),
      }
    }),
    pageInfo: args.pageInfo ?? {
      hasNextPage: false,
      endCursor: null,
    },
  }
}

export function toGinkoSiteDataResult(args: {
  key: string
  requestedLocale: string
  data: JsonValue | null
  resolvedLocale?: string | null
  fallbacks?: Array<{ path: string; from: string }>
}): GinkoSiteDataResult<string, JsonValue> {
  return {
    key: args.key,
    data: args.data,
    locale: createLocaleResolution({
      requested: args.requestedLocale,
      resolved: args.resolvedLocale,
      policy: args.fallbacks?.length ? 'transparent' : 'strict',
      fallbacks: args.fallbacks,
    }),
  }
}

export function toGinkoSingletonResult(args: {
  name: string
  requestedLocale: string
  entry: PublicProjectionEntry | null
  translations?: PublicTranslationSummary[]
  failure?:
    | null
    | 'missing_locale'
    | 'unknown_collection'
    | 'not_singleton'
    | 'mode_mismatch'
    | 'no_published_entry'
}): GinkoSingletonResult<string, GinkoPublicEntry, string> {
  return {
    name: args.name,
    singleton: args.entry
      ? toGinkoEntry(args.entry, args.requestedLocale, args.translations ?? [])
      : null,
    locale: createLocaleResolution({ requested: args.requestedLocale }),
    failure: args.failure ?? null,
  }
}

function toIso(value: number): string {
  return new Date(value).toISOString()
}

function lastSegment(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? ''
}
