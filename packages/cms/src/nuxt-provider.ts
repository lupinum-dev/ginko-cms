import {
  assertCmsRequestedFacts,
  parseCmsListWireResult,
  parseCmsNavWireResult,
  parseCmsPageWireResult,
  parseCmsRoutesWireResult,
  parseCmsSearchWireResult,
  parseCmsSiteDataWireResult,
  parseCmsSurroundWireResult,
} from '@lupinum/ginko-content/cms-contract'
import {
  withContentCache,
  type ContentCacheHint,
  type ContentProvider,
  type ContentProviderNavigationItem,
  type ContentProviderNavigationOptions,
  type ContentProviderQuery,
  type ContentProviderSiteDataRequest,
  type ContentProviderSurroundingsOptions,
  type ContentProviderVariantSelector,
  type ContentRouteRecord,
} from '@lupinum/ginko-content/provider'

import {
  canonicalFromRoute,
  defaultLocale,
  normalizeContentPath,
  publicEntryKey,
  routeFactFor,
  toContentEntry,
} from './nuxt-provider/content-shaping.js'
import { callGinko, providerError, setClientFactoryForTests } from './nuxt-provider/transport.js'

type ProviderEvent = Parameters<ContentProvider['query']>[0]
type ProviderRequestEvent = ProviderEvent | undefined
type UnknownRecord = Record<string, unknown>
type ContentRuntime = {
  defaultLocale?: string
  i18n?: { defaultLocale?: string }
  locales?: string[]
  collections?: Record<
    string,
    {
      type?: string
      route?: string | Record<string, string>
      i18n?: { locales?: string[] }
    }
  >
}
type RuntimeConfig = {
  public?: { content?: ContentRuntime }
  content?: ContentRuntime
}
type FilterState = { locale?: string; pathPrefix?: string }
type PlanFilter = ContentProviderQuery['plan']['filter']
type PlanCompare = Extract<PlanFilter, { type: 'compare' }>
type PlanSort = ContentProviderQuery['plan']['sort']
type RequestedFacts = Parameters<typeof assertCmsRequestedFacts>[0]['requested']
type ReturnedFacts = Parameters<typeof assertCmsRequestedFacts>[0]['returned']
type RoutesResult = ReturnType<typeof parseCmsRoutesWireResult>
type CmsSearchRequest = Partial<Parameters<NonNullable<ContentProvider['search']>>[1]> & {
  query?: string
  collection?: string
}
type CmsSiteDataRequest = Partial<ContentProviderSiteDataRequest>

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const normalizeContentTagSegment = (value: unknown): string => {
  const segment = String(value ?? '').trim()
  if (!segment) {
    throw new Error('Content cache tag segments must be non-empty.')
  }
  return segment.replace(/[:\s]+/g, '-')
}

const uniqueContentTags = (tags: unknown[]): string[] => [
  ...new Set(tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)),
]

const contentTags = {
  entry(collection: string, id: string, locale?: string) {
    const base = `entry:${normalizeContentTagSegment(collection)}:${normalizeContentTagSegment(id)}`
    return locale ? `${base}:${normalizeContentTagSegment(locale)}` : base
  },

  collection(collection: string) {
    return `collection:${normalizeContentTagSegment(collection)}`
  },

  route(path: string) {
    return `route:${normalizeContentPath(path)}`
  },

  nav(collection: string, locale: string) {
    return `nav:${normalizeContentTagSegment(collection)}:${normalizeContentTagSegment(locale)}`
  },

  search(locale: string) {
    return `search:${normalizeContentTagSegment(locale)}`
  },

  sitemap() {
    return 'sitemap'
  },

  siteData(key: string, locale?: string) {
    const base = `site-data:${normalizeContentTagSegment(key)}`
    return locale ? `${base}:${normalizeContentTagSegment(locale)}` : base
  },
}

export const __setGinkoNuxtProviderClientFactoryForTests = (
  factory: Parameters<typeof setClientFactoryForTests>[0],
) => {
  setClientFactoryForTests(factory)
}

const runtimeConfigFromEvent = async (event: ProviderRequestEvent): Promise<RuntimeConfig> => {
  const context = event?.context as UnknownRecord | undefined
  const nitro = isRecord(context?.nitro) ? context.nitro : undefined
  const eventRuntimeConfig = nitro?.runtimeConfig || context?.runtimeConfig
  if (isRecord(eventRuntimeConfig)) return eventRuntimeConfig as RuntimeConfig

  try {
    const { useRuntimeConfig } = await import('nitropack/runtime')
    const runtimeConfig = useRuntimeConfig(event)
    if (runtimeConfig?.public || runtimeConfig?.content) return runtimeConfig as RuntimeConfig
  } catch {
    // Fall back below for provider-contract tests that pass runtime config directly.
  }
  return {}
}

const contentRuntimeFromEvent = async (event: ProviderRequestEvent): Promise<ContentRuntime> => {
  const runtime = await runtimeConfigFromEvent(event)
  const publicRuntime = runtime?.public || {}
  const contentRuntime = runtime?.content || publicRuntime.content
  return contentRuntime && typeof contentRuntime === 'object' ? contentRuntime : {}
}

const sitemapLocalesForCollection = (
  contentRuntime: ContentRuntime,
  collection: string,
  requestedLocale?: string,
): string[] => {
  if (requestedLocale) return [requestedLocale]

  const runtimeCollection = contentRuntime?.collections?.[collection]
  if (Array.isArray(runtimeCollection?.i18n?.locales) && runtimeCollection.i18n.locales.length) {
    return runtimeCollection.i18n.locales
  }

  const contentLocales = contentRuntime?.locales
  if (Array.isArray(contentLocales) && contentLocales.length) return contentLocales

  return [defaultLocale(contentRuntime)]
}

const normalizeCacheHint = (hint: ContentCacheHint = {}): ContentCacheHint => ({
  ...hint,
  tags: uniqueContentTags(hint.tags || []),
  paths: uniqueContentTags((hint.paths || []).map((path) => normalizeContentPath(path))),
})

const cacheHintForEntry = (
  entry: Parameters<typeof publicEntryKey>[0],
  content: UnknownRecord,
): ContentCacheHint => {
  const locale = entry.locale.resolved || entry.locale.requested || defaultLocale()
  const routePath =
    typeof content.unprefixedPath === 'string'
      ? content.unprefixedPath
      : typeof content.path === 'string'
        ? content.path
        : entry.route.path
  const updatedAt = entry?.updatedAt || content?.updatedAt
  return normalizeCacheHint({
    tags: [
      contentTags.collection(entry.collection),
      contentTags.entry(entry.collection, publicEntryKey(entry)),
      contentTags.entry(entry.collection, publicEntryKey(entry), locale),
      contentTags.route(routePath),
    ],
    paths: [routePath],
    lastModified:
      typeof updatedAt === 'string' || typeof updatedAt === 'number'
        ? new Date(updatedAt)
        : undefined,
  })
}

const mergeCacheHints = (...hints: Array<ContentCacheHint | false>): ContentCacheHint | false => {
  if (hints.includes(false)) return false
  const activeHints = hints.filter((hint): hint is ContentCacheHint => hint !== false)
  return normalizeCacheHint({
    tags: activeHints.flatMap((hint) => hint.tags || []),
    paths: activeHints.flatMap((hint) => hint.paths || []),
    maxAge: activeHints
      .map((hint) => hint.maxAge)
      .filter((value) => typeof value === 'number')
      .sort((left, right) => left - right)[0],
    swr: activeHints
      .map((hint) => hint.swr)
      .filter((value) => typeof value === 'number')
      .sort((left, right) => left - right)[0],
    lastModified: activeHints
      .map((hint) => hint.lastModified)
      .filter(Boolean)
      .sort((left, right) => Number(right) - Number(left))[0],
  })
}

const collectionCacheHint = (collection: string): ContentCacheHint =>
  normalizeCacheHint({ tags: [contentTags.collection(collection)] })

const navigationCacheHint = (collection: string, locale: string): ContentCacheHint =>
  normalizeCacheHint({
    tags: [contentTags.collection(collection), contentTags.nav(collection, locale)],
  })

const searchCacheHint = (locale: string, collection?: string): ContentCacheHint =>
  normalizeCacheHint({
    tags: [...(collection ? [contentTags.collection(collection)] : []), contentTags.search(locale)],
  })

const siteDataCacheHint = (key: string, locale?: string): ContentCacheHint =>
  normalizeCacheHint({ tags: [contentTags.siteData(key || '*', locale)] })

const sitemapCacheHint = () => normalizeCacheHint({ tags: [contentTags.sitemap()] })

const pickNavFields = (entry: UnknownRecord, fields: string[] = []): UnknownRecord =>
  Object.fromEntries(fields.filter((field) => field in entry).map((field) => [field, entry[field]]))

const assertUnsupportedQueryShape = (condition: unknown, field: string, message: string): void => {
  if (!condition) return
  throw providerError('unsupported_query_shape', message, 400, { field })
}

const applyOnlyProjection = (entry: UnknownRecord, only: string[] = []): UnknownRecord => {
  if (!only.length) return entry
  const projected: UnknownRecord = {}
  for (const field of only) {
    if (field in entry) projected[field] = entry[field]
  }
  return projected
}

function assertProviderQuery(input: unknown): asserts input is ContentProviderQuery {
  if (!isRecord(input) || input.v !== 2 || !isRecord(input.plan)) {
    throw providerError(
      'unsupported_query_shape',
      'Ginko CMS provider requires the ginko-content provider query wire v2.',
      400,
      { field: 'query' },
    )
  }
}

function assertQueryCollection(collection: string | null): asserts collection is string {
  if (!collection) {
    throw providerError(
      'unknown_collection',
      'A collection is required for Ginko public queries.',
      400,
      {
        collection,
      },
    )
  }
}

const assertPortableListPlan = (query: ContentProviderQuery): void => {
  assertQueryCollection(query.collection)
  const plan = query.plan || {}
  assertUnsupportedQueryShape(
    typeof plan.skip === 'number' && plan.skip > 0,
    'skip',
    'Ginko public list queries do not support numeric skip.',
  )
  assertUnsupportedQueryShape(
    plan.mode === 'count',
    'count',
    'Ginko public list queries do not support count yet.',
  )
  assertUnsupportedQueryShape(
    Boolean(plan.projection?.without?.length),
    'without',
    'Ginko public list queries support explicit select projections, not without projections.',
  )
}

function unsupportedFilter(field = 'where'): never {
  throw providerError(
    'unsupported_query_shape',
    'Ginko public list queries only support public visibility predicates.',
    400,
    { field },
  )
}

const assertSupportedPlanOperator = (operator: string): void => {
  if (['eq', 'ne', 'prefix'].includes(operator)) return
  throw providerError(
    'unsupported_query_operator',
    `Unsupported Ginko query operator: $${operator}`,
    400,
    {
      operator: `$${operator}`,
      path: 'plan.filter',
    },
  )
}

const applyPlanCompare = (state: FilterState, clause: PlanCompare): void => {
  assertSupportedPlanOperator(clause.operator)
  const { field, operator, value } = clause
  if ((field === 'draft' || field === 'partial') && operator === 'ne' && value === true) return
  if ((field === 'draft' || field === 'partial') && operator === 'eq' && value === false) return
  if (field === 'locale' && operator === 'eq' && typeof value === 'string') {
    state.locale = value
    return
  }
  if (field === 'path' && operator === 'prefix' && typeof value === 'string' && value) {
    state.pathPrefix = value
    return
  }
  return unsupportedFilter('where')
}

const collectPlanFilter = (filter: PlanFilter, state: FilterState = {}): FilterState => {
  if (!filter || filter.type === 'true') return state
  if (filter.type === 'and') {
    for (const clause of filter.clauses || []) collectPlanFilter(clause, state)
    return state
  }
  if (filter.type === 'compare') {
    applyPlanCompare(state, filter)
    return state
  }
  unsupportedFilter('where')
}

const sortFromPlan = (sort: PlanSort = []): string | undefined => {
  const supportedFields = new Set([
    'orderKey',
    'entryCreatedAt',
    'firstPublishedAt',
    'lastPublishedAt',
  ])
  for (const item of sort) {
    // Ginko Content normalizes an omitted sort to numeric `file.stem` order.
    // The CMS projection persists that same source order as `orderKey`.
    const field = item.field === 'file.stem' ? 'orderKey' : item.field
    if (!supportedFields.has(field)) {
      throw providerError(
        'unsupported_sort',
        'Ginko public sort supports orderKey, entryCreatedAt, firstPublishedAt, and lastPublishedAt.',
        400,
        { field },
      )
    }
    if (item.direction === 1) return `${field}:asc`
    if (item.direction === -1) return `${field}:desc`
    throw providerError(
      'unsupported_sort',
      'Ginko public sort direction must be asc or desc.',
      400,
      {
        field,
        direction: item.direction,
      },
    )
  }
  return undefined
}

const mountedContentPath = (
  contentRuntime: ContentRuntime,
  collection: string,
  locale: string,
  contentPath: string,
): string => {
  const route = contentRuntime?.collections?.[collection]?.route
  const mount = typeof route === 'string' ? route : route?.[locale]
  const normalizedPath = canonicalFromRoute(contentPath, locale)
  const normalizedMount = normalizeContentPath(mount)
  if (!mount || normalizedMount === '/') return normalizedPath
  if (normalizedPath === normalizedMount || normalizedPath.startsWith(`${normalizedMount}/`)) {
    return normalizedPath
  }
  if (normalizedPath === '/') return normalizedMount
  return normalizeContentPath(`${normalizedMount}/${normalizedPath.replace(/^\/+/, '')}`)
}

const hasExplicitPublicSort = (sort: PlanSort = []): boolean => sort.some((item) => item.field)

const localeFromOptions = (
  options: ContentProviderSurroundingsOptions = {},
  contentRuntime: ContentRuntime = {},
): string => options.locale || defaultLocale(contentRuntime)

const localeFromQuery = (
  query: ContentProviderQuery,
  filterState: FilterState,
  contentRuntime: ContentRuntime = {},
): string =>
  query.plan?.resolveLocale?.locale || filterState.locale || defaultLocale(contentRuntime)

const decodeRequested = <T extends ReturnedFacts>(
  operation: string,
  parser: (raw: unknown) => T,
  requested: RequestedFacts,
  raw: unknown,
): T => {
  try {
    const returned = parser(raw)
    assertCmsRequestedFacts({ operation, requested, returned })
    return returned
  } catch (error) {
    throw providerError(
      'provider_response_invalid',
      error instanceof Error ? error.message : `Invalid CMS ${operation} response.`,
      502,
      { operation },
    )
  }
}

const decodeResult = <T>(operation: string, parser: (raw: unknown) => T, raw: unknown): T => {
  try {
    return parser(raw)
  } catch (error) {
    throw providerError(
      'provider_response_invalid',
      error instanceof Error ? error.message : `Invalid CMS ${operation} response.`,
      502,
      { operation },
    )
  }
}

const resolveVariant = async (
  event: ProviderRequestEvent,
  collection: string,
  selector: ContentProviderVariantSelector,
  contentRuntime: ContentRuntime,
) => {
  if (selector.by === 'ref') {
    const locale = selector.requestedLocale || defaultLocale(contentRuntime)
    return {
      locale,
      result: decodeRequested(
        'page',
        parseCmsPageWireResult,
        { collection, locale },
        await callGinko(event, 'page', {
          collection,
          locale,
          ref: selector.ref,
          fallback: selector.localeChain?.slice(1),
        }),
      ),
    }
  }

  // Route selectors are already closed and ordered by ginko-content. Trying them
  // in order keeps locale fallback policy in the content engine, not this adapter.
  for (const candidate of selector.candidates || []) {
    const result = decodeRequested(
      'page',
      parseCmsPageWireResult,
      { collection, locale: candidate.locale },
      await callGinko(event, 'page', {
        collection,
        locale: candidate.locale,
        path: mountedContentPath(
          contentRuntime,
          collection,
          candidate.locale,
          candidate.contentPath,
        ),
      }),
    )
    if (result.status === 'found' && result.page) return { locale: candidate.locale, result }
  }
  return {
    locale: selector.requestedLocale || defaultLocale(contentRuntime),
    result: { status: 'not-found', page: null },
  }
}

const contentProviderImplementation = {
  name: 'cms',
  capabilities: {
    query: {
      operators: ['$eq', '$ne', '$prefix'],
      pagination: ['cursor'],
    },
  },
  query: async (event: ProviderEvent, input: ContentProviderQuery) => {
    assertProviderQuery(input)
    const contentRuntime = await contentRuntimeFromEvent(event)
    const plan = input.plan
    if (plan.variantSelector) {
      if (!input.collection) {
        throw providerError(
          'unknown_collection',
          'A collection is required for Ginko route variant queries.',
          400,
          {
            collection: input.collection,
          },
        )
      }
      const { locale, result } = await resolveVariant(
        event,
        input.collection,
        plan.variantSelector,
        contentRuntime,
      )
      const entry =
        result.status === 'found' && result.page ? await toContentEntry(result.page, locale) : null
      const data = { result: entry ? applyOnlyProjection(entry, plan.projection?.only) : null }
      return withContentCache(
        data,
        entry && result.page
          ? cacheHintForEntry(result.page, entry)
          : collectionCacheHint(input.collection),
      )
    }

    assertPortableListPlan(input)
    const collection = input.collection
    assertQueryCollection(collection)
    const filterState = collectPlanFilter(plan.filter)
    const locale = localeFromQuery(input, filterState, contentRuntime)
    const pathPrefix = filterState.pathPrefix
      ? canonicalFromRoute(filterState.pathPrefix, locale)
      : undefined
    assertUnsupportedQueryShape(
      Boolean(pathPrefix && hasExplicitPublicSort(plan.sort)),
      'sort',
      'Ginko public path prefix queries use path-index order and cannot be combined with public sort.',
    )
    const sort = sortFromPlan(plan.sort)
    const result = decodeRequested(
      'list',
      parseCmsListWireResult,
      { collection, locale },
      await callGinko(event, 'list', {
        collection,
        locale,
        limit: plan.paging?.mode === 'cursor' ? plan.paging.limit : plan.limit,
        cursor: plan.paging?.mode === 'cursor' ? plan.paging.after : undefined,
        ...(pathPrefix ? { pathPrefix } : {}),
        ...(sort ? { sort } : {}),
      }),
    )
    const rawEntries = result.entries || []
    const entries = (
      await Promise.all(rawEntries.map((entry) => toContentEntry(entry, locale)))
    ).map((entry) => applyOnlyProjection(entry, plan.projection?.only))
    const limit = plan.paging?.mode === 'cursor' ? plan.paging.limit : plan.limit || entries.length
    const data =
      plan.mode === 'first'
        ? { result: entries[0] || null }
        : {
            mode: 'cursor',
            result: entries,
            limit,
            pageInfo: {
              endCursor: result.pageInfo?.endCursor ?? null,
              hasNext: result.pageInfo?.hasNextPage === true,
            },
          }
    const entryHints = rawEntries.map((entry, index) => cacheHintForEntry(entry, entries[index]))
    return withContentCache(data, mergeCacheHints(collectionCacheHint(collection), ...entryHints))
  },
  navigation: async (
    event: ProviderEvent,
    input: ContentProviderQuery,
    options: ContentProviderNavigationOptions = {},
  ) => {
    assertProviderQuery(input)
    const collection = input.collection
    assertQueryCollection(collection)
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = options.locale || defaultLocale(contentRuntime)
    const fields = input.plan?.projection?.only || []
    const result = decodeRequested(
      'navigation',
      parseCmsNavWireResult,
      { collection, locale },
      await callGinko(event, 'nav', { collection, locale }),
    )
    return withContentCache(
      result.tree.map(function toRawNavigation(node): ContentProviderNavigationItem {
        const entry = node.entry
        return {
          ...pickNavFields(entry, fields),
          title: entry.title,
          route: routeFactFor(entry),
          children: node.children.map(toRawNavigation),
        }
      }),
      navigationCacheHint(collection, locale),
    )
  },
  surroundings: async (
    event: ProviderEvent,
    collection: string,
    path: string,
    options: ContentProviderSurroundingsOptions = {},
  ) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = localeFromOptions(options, contentRuntime)
    const result = decodeRequested(
      'surroundings',
      parseCmsSurroundWireResult,
      { collection, locale },
      await callGinko(event, 'surround', {
        collection,
        locale,
        path: canonicalFromRoute(path, locale),
        previous: 1,
        next: 1,
      }),
    )
    const previous = (result.previous || [])[0]
    const next = (result.next || [])[0]
    return withContentCache(
      [
        previous
          ? {
              title: previous.title,
              route: routeFactFor(previous),
            }
          : null,
        next
          ? {
              title: next.title,
              route: routeFactFor(next),
            }
          : null,
      ],
      collectionCacheHint(collection),
    )
  },
  search: async (event: ProviderEvent, request: CmsSearchRequest = {}) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = request.locale || defaultLocale(contentRuntime)
    const query = request.query || request.term || ''
    const collections = request.collections?.length
      ? request.collections
      : request.collection
        ? [request.collection]
        : []
    if (!collections.length) {
      throw providerError('unknown_collection', 'A collection is required for Ginko search.', 400, {
        collection: request.collection,
      })
    }
    const collectionResults = await Promise.all(
      collections.map(async (collection) => {
        const result = decodeRequested(
          'search',
          parseCmsSearchWireResult,
          { collection, locale },
          await callGinko(event, 'search', { query, locale, collection }),
        )
        const searchEntries = await Promise.all(
          (result.results || []).map((entry) => toContentEntry(entry, locale)),
        )
        return searchEntries.map((content, index) => {
          return {
            title: content.title || '',
            excerpt: typeof content.description === 'string' ? content.description : '',
            score: Math.max(1, searchEntries.length - index),
            route: routeFactFor(result.results?.[index] || content),
          }
        })
      }),
    )
    const data = collectionResults.flat()
    return withContentCache(data, searchCacheHint(locale))
  },
  siteData: async (event: ProviderRequestEvent, request: CmsSiteDataRequest = {}) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = request.locale || defaultLocale(contentRuntime)
    const result = decodeRequested(
      'site data',
      parseCmsSiteDataWireResult,
      { locale },
      await callGinko(event, 'siteData', { key: request.key, locale }),
    )
    if (result.key !== request.key) {
      throw providerError(
        'provider_response_invalid',
        'Ginko site data returned a different key than requested.',
        502,
        { operation: 'siteData', field: 'key' },
      )
    }
    return withContentCache(
      {
        key: result.key,
        locale: result.locale?.resolved || result.locale?.requested || locale,
        data: result.data ?? null,
      },
      siteDataCacheHint(result.key || request.key || '*', locale),
    )
  },
  routes: async (event: ProviderEvent) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const collections = Object.entries(contentRuntime.collections || {})
      .filter(([, collection]) => collection?.type !== 'data')
      .map(([name]) => name)
    const records: ContentRouteRecord[] = []
    const MAX_ROUTE_PAGES = 1000
    const MAX_ROUTE_RECORDS = 100_000
    for (const collection of collections) {
      for (const locale of sitemapLocalesForCollection(contentRuntime, collection)) {
        let cursor: string | null = null
        let pages = 0
        do {
          if (++pages > MAX_ROUTE_PAGES || records.length >= MAX_ROUTE_RECORDS) {
            throw providerError(
              'unsupported_provider_prerender',
              `CMS route enumeration exceeded its safety bound for collection "${collection}".`,
              500,
              { collection, maxPages: MAX_ROUTE_PAGES, maxRecords: MAX_ROUTE_RECORDS },
            )
          }
          const result: RoutesResult = decodeResult(
            'routes',
            parseCmsRoutesWireResult,
            await callGinko(event, 'routes', { collection, locale, cursor }),
          )
          if (
            result.routes.some(
              (route) => route.collection !== collection || route.locale !== locale,
            )
          ) {
            throw providerError(
              'provider_response_invalid',
              'Ginko routes substituted a different collection or locale.',
              502,
              { operation: 'routes', collection, locale },
            )
          }
          if (records.length + (result.routes?.length || 0) > MAX_ROUTE_RECORDS) {
            throw providerError(
              'unsupported_provider_prerender',
              `CMS route enumeration exceeded its safety bound for collection "${collection}".`,
              500,
              { collection, maxPages: MAX_ROUTE_PAGES, maxRecords: MAX_ROUTE_RECORDS },
            )
          }
          records.push(
            ...result.routes.map(
              (route): ContentRouteRecord => ({
                collection: route.collection,
                canonicalKey: route.stableId,
                locale: route.locale,
                contentPath: route.path,
                ...(route.sitemapIncluded
                  ? { sitemap: { lastmod: route.lastmod } }
                  : { sitemap: false }),
              }),
            ),
          )
          cursor = result.pageInfo?.endCursor ?? null
        } while (cursor)
      }
    }
    return withContentCache(records, sitemapCacheHint())
  },
}

const contentProvider: ContentProvider = contentProviderImplementation as unknown as ContentProvider

export { contentProvider }
export default contentProvider
