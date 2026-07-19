import { contentTags, uniqueContentTags } from '@lupinum/ginko-cms-contract/shared/contentTags.js'
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
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import type {
  BoundedContentProviderQuery,
  ContentDataSource,
  ContentDataSourceCacheHint,
  ContentDataSourceControl,
  ContentDataSourceResult,
} from '@lupinum/ginko-content/data-source'
import {
  PROVIDER_QUERY_VERSION,
  type ContentCacheHint,
  type ContentProvider,
  type ContentProviderNavigationItem,
  type ContentProviderNavigationOptions,
  type ProviderDocumentInput,
  type ContentProviderQuery,
  type ContentProviderSiteDataRequest,
  type ContentProviderSurroundingsOptions,
  type ContentProviderVariantSelector,
  type ContentRouteRecord,
} from '@lupinum/ginko-content/provider'
import type { H3Event } from 'h3'

import {
  canonicalFromRoute,
  defaultLocale,
  normalizeContentPath,
  publicEntryKey,
  routeFactFor,
  toContentEntry,
} from './content-shaping.js'
import { callGinko, providerError, type ConvexQueryCaller } from './transport.js'

type ProviderEvent = H3Event
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
type FilterState = { locale?: string; pathPrefix?: string; impossible?: true }
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
interface GinkoCmsDataSourceContext {
  event: H3Event
  caller: ConvexQueryCaller
}

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const CMS_PUBLIC_SEARCH_MAX_LIMIT = 50

const runtimeConfigFromEvent = async (event: ProviderEvent): Promise<RuntimeConfig> => {
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

const contentRuntimeFromEvent = async (event: ProviderEvent): Promise<ContentRuntime> => {
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
  normalizeCacheHint({
    tags: uniqueContentTags([
      contentTags.siteData(key || '*'),
      locale ? contentTags.siteData(key || '*', locale) : null,
    ]),
  })

const sitemapCacheHint = () => normalizeCacheHint({ tags: [contentTags.sitemap()] })

const dataSourceCacheHint = (
  hint: ContentCacheHint | false,
): ContentDataSourceCacheHint | false => {
  if (hint === false) return false
  return {
    tags: [...(hint.tags || [])],
    paths: [...(hint.paths || [])],
    maxAge: hint.maxAge ?? null,
    swr: hint.swr ?? null,
    etag: hint.etag ?? null,
    lastModified: hint.lastModified ? hint.lastModified.valueOf() : null,
  }
}

const sourceResult = <T>(data: T, cache: ContentCacheHint | false): ContentDataSourceResult<T> => ({
  data,
  cache: dataSourceCacheHint(cache),
})

type RoutesCursor = {
  source: 'cms'
  scope: number
  backend: string | null
  snapshot: string | null
}

const parseRoutesCursor = (cursor: string | null): RoutesCursor => {
  if (cursor === null) return { source: 'cms', scope: 0, backend: null, snapshot: null }
  try {
    const parsed = JSON.parse(cursor) as Partial<RoutesCursor>
    if (
      parsed.source !== 'cms' ||
      !Number.isSafeInteger(parsed.scope) ||
      (parsed.scope as number) < 0 ||
      (parsed.backend !== null && typeof parsed.backend !== 'string') ||
      (parsed.snapshot !== null && typeof parsed.snapshot !== 'string')
    ) {
      throw new Error('invalid')
    }
    return parsed as RoutesCursor
  } catch {
    throw providerError('CURSOR_INVALID', 'CMS route cursor is invalid.', 400, {
      operation: 'routes',
    })
  }
}

const encodeRoutesCursor = (cursor: RoutesCursor): string => JSON.stringify(cursor)

const pickNavFields = (entry: UnknownRecord, fields: string[] = []): UnknownRecord =>
  Object.fromEntries(fields.filter((field) => field in entry).map((field) => [field, entry[field]]))

const assertUnsupportedQueryShape = (condition: unknown, field: string, message: string): void => {
  if (!condition) return
  throw providerError('unsupported_query_shape', message, 400, { field })
}

const applyOnlyProjection = (
  entry: ProviderDocumentInput,
  only: string[] = [],
): ProviderDocumentInput => {
  if (!only.length) return entry
  const projected: ProviderDocumentInput = {
    collection: entry.collection,
    locale: entry.locale,
    contentPath: entry.contentPath,
    canonicalKey: entry.canonicalKey,
    body: entry.body,
  }
  for (const field of only) {
    if (field in entry) projected[field] = entry[field]
  }
  return projected
}

function assertProviderQuery(input: unknown): asserts input is ContentProviderQuery {
  if (!isRecord(input) || input.v !== PROVIDER_QUERY_VERSION || !isRecord(input.plan)) {
    throw providerError(
      'unsupported_query_shape',
      `Ginko CMS provider requires the ginko-content provider query wire v${PROVIDER_QUERY_VERSION}.`,
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

const applyPlanCompare = (state: FilterState, clause: PlanCompare): FilterState => {
  assertSupportedPlanOperator(clause.operator)
  const { field, operator, value } = clause
  if (field === 'draft' || field === 'partial') {
    if ((operator === 'ne' && value === true) || (operator === 'eq' && value === false)) {
      return state
    }
    if ((operator === 'eq' && value === true) || (operator === 'ne' && value === false)) {
      return { impossible: true }
    }
    return unsupportedFilter('where')
  }
  if (field === 'locale' && operator === 'eq' && typeof value === 'string') {
    if (state.locale && state.locale !== value) return { impossible: true }
    return { ...state, locale: value }
  }
  if (field === 'path' && operator === 'prefix' && typeof value === 'string' && value) {
    if (!state.pathPrefix) return { ...state, pathPrefix: value }
    if (value === state.pathPrefix || value.startsWith(`${state.pathPrefix}/`)) {
      return { ...state, pathPrefix: value }
    }
    if (state.pathPrefix.startsWith(`${value}/`)) return state
    return { impossible: true }
  }
  return unsupportedFilter('where')
}

const sameFilterState = (left: FilterState, right: FilterState): boolean =>
  left.impossible === right.impossible &&
  left.locale === right.locale &&
  left.pathPrefix === right.pathPrefix

const collectPlanFilter = (filter: PlanFilter): FilterState => {
  if (!filter || filter.type === 'true') return {}
  if (filter.type === 'and') {
    let state: FilterState = {}
    for (const clause of filter.clauses || []) {
      const next = collectPlanFilter(clause)
      if (state.impossible || next.impossible) return { impossible: true }
      if (next.locale) {
        if (state.locale && state.locale !== next.locale) return { impossible: true }
        state = { ...state, locale: next.locale }
      }
      if (next.pathPrefix) {
        state = applyPlanCompare(state, {
          type: 'compare',
          field: 'path',
          operator: 'prefix',
          value: next.pathPrefix,
        })
      }
    }
    return state
  }
  if (filter.type === 'compare') {
    return applyPlanCompare({}, filter)
  }
  if (filter.type === 'or') {
    const branches = filter.clauses.map(collectPlanFilter)
    const possible = branches.filter((branch) => !branch.impossible)
    if (!possible.length) return { impossible: true }
    if (possible.length === 1) return possible[0]!
    if (possible.every((branch) => sameFilterState(branch, possible[0]!))) return possible[0]!
    return unsupportedFilter('where')
  }
  if (filter.type === 'not') {
    const child = collectPlanFilter(filter.clause)
    if (child.impossible) return {}
    if (sameFilterState(child, {})) return { impossible: true }
    return unsupportedFilter('where')
  }
  return unsupportedFilter('where')
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
  caller: ConvexQueryCaller,
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
        await callGinko(caller, 'page', {
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
    let result = decodeRequested(
      'page',
      parseCmsPageWireResult,
      { collection, locale: candidate.locale },
      await callGinko(caller, 'page', {
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
    if (result.status === 'redirect') {
      result = decodeRequested(
        'page',
        parseCmsPageWireResult,
        { collection, locale: candidate.locale },
        await callGinko(caller, 'page', {
          collection,
          locale: candidate.locale,
          path: result.redirectTo.path,
        }),
      )
    }
    if (result.status === 'found' && result.page) return { locale: candidate.locale, result }
  }
  return {
    locale: selector.requestedLocale || defaultLocale(contentRuntime),
    result: { status: 'not-found', page: null },
  }
}

export const contentDataSource = {
  name: 'cms',
  capabilities: {
    protocol: 'ginko-content-data-source/v1',
    query: {
      operators: ['$eq', '$ne', '$prefix'],
      pagination: ['cursor'],
      maxPageSize: 100,
    },
  },
  query: async (
    context: GinkoCmsDataSourceContext,
    input: BoundedContentProviderQuery,
    _control: ContentDataSourceControl,
  ) => {
    assertProviderQuery(input)
    const contentRuntime = await contentRuntimeFromEvent(context.event)
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
        context.caller,
        input.collection,
        plan.variantSelector,
        contentRuntime,
      )
      const entry =
        result.status === 'found' && result.page ? await toContentEntry(result.page, locale) : null
      const data = { result: entry ? applyOnlyProjection(entry, plan.projection?.only) : undefined }
      return sourceResult(
        data,
        entry && result.page
          ? cacheHintForEntry(result.page, entry)
          : collectionCacheHint(input.collection),
      )
    }

    assertPortableListPlan(input)
    if (plan.mode === 'count') {
      throw providerError(
        'unsupported_query_shape',
        'Ginko public queries do not support exact aggregate counts.',
        400,
        { field: 'mode' },
      )
    }
    const collection = input.collection
    assertQueryCollection(collection)
    const filterState = collectPlanFilter(plan.filter)
    if (filterState.impossible) {
      const limit = plan.paging?.mode === 'cursor' ? plan.paging.limit : (plan.limit ?? 100)
      return sourceResult(
        plan.mode === 'first'
          ? { result: undefined }
          : {
              mode: 'cursor' as const,
              result: [],
              limit,
              pageInfo: { endCursor: null, hasNext: false },
            },
        collectionCacheHint(collection),
      )
    }
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
    const listArgs = {
      collection,
      locale,
      limit: plan.paging?.mode === 'cursor' ? plan.paging.limit : plan.limit,
      cursor: plan.paging?.mode === 'cursor' ? plan.paging.after : undefined,
      ...(pathPrefix ? { pathPrefix } : {}),
      ...(sort ? { sort } : {}),
    }
    const [rawList, total] = await Promise.all([
      callGinko(context.caller, 'list', listArgs),
      plan.paging?.mode === 'cursor'
        ? Promise.resolve<number | null>(null)
        : callGinko(context.caller, 'count', {
            collection,
            locale,
            ...(pathPrefix ? { pathPrefix } : {}),
          }).then((value) => {
            if (!Number.isSafeInteger(value) || (value as number) < 0) {
              throw providerError(
                'provider_response_invalid',
                'Ginko public count returned an invalid total.',
                502,
                { operation: 'count' },
              )
            }
            return value as number
          }),
    ])
    const result = decodeRequested('list', parseCmsListWireResult, { collection, locale }, rawList)
    const rawEntries = result.entries || []
    const entries = (
      await Promise.all(rawEntries.map((entry) => toContentEntry(entry, locale)))
    ).map((entry) => applyOnlyProjection(entry, plan.projection?.only))
    const limit = plan.paging?.mode === 'cursor' ? plan.paging.limit : plan.limit || entries.length
    const data =
      plan.mode === 'first'
        ? { result: entries[0] }
        : plan.paging?.mode === 'cursor'
          ? {
              mode: 'cursor' as const,
              result: entries,
              limit,
              pageInfo: {
                endCursor: result.pageInfo?.endCursor ?? null,
                hasNext: result.pageInfo?.hasNextPage === true,
              },
            }
          : {
              result: entries,
              skip: 0,
              limit,
              total: total!,
            }
    return sourceResult(data, collectionCacheHint(collection))
  },
  navigation: async (
    context: GinkoCmsDataSourceContext,
    input: BoundedContentProviderQuery,
    options: ContentProviderNavigationOptions & { limit: number },
    _control: ContentDataSourceControl,
  ) => {
    assertProviderQuery(input)
    const collection = input.collection
    assertQueryCollection(collection)
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const locale = options.locale || defaultLocale(contentRuntime)
    const fields = input.plan?.projection?.only || []
    const result = decodeRequested(
      'navigation',
      parseCmsNavWireResult,
      { collection, locale },
      await callGinko(context.caller, 'nav', { collection, locale }),
    )
    return sourceResult(
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
    context: GinkoCmsDataSourceContext,
    collection: string,
    path: string,
    options: ContentProviderSurroundingsOptions,
    _control: ContentDataSourceControl,
  ) => {
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const locale = localeFromOptions(options, contentRuntime)
    const result = decodeRequested(
      'surroundings',
      parseCmsSurroundWireResult,
      { collection, locale },
      await callGinko(context.caller, 'surround', {
        collection,
        locale,
        path: canonicalFromRoute(path, locale),
        previous: 1,
        next: 1,
      }),
    )
    const previous = (result.previous || [])[0]
    const next = (result.next || [])[0]
    return sourceResult(
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
  search: async (
    context: GinkoCmsDataSourceContext,
    request: CmsSearchRequest & { limit: number },
    _control: ContentDataSourceControl,
  ) => {
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const locale = request.locale || defaultLocale(contentRuntime)
    const query = (request.query || request.term || '').trim()
    if (!query) {
      throw providerError('INVALID_QUERY', 'Search query must not be empty.', 400)
    }
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
          await callGinko(context.caller, 'search', {
            query,
            locale,
            collection,
            limit: Math.min(request.limit, CMS_PUBLIC_SEARCH_MAX_LIMIT),
          }),
        )
        const searchEntries = await Promise.all(
          (result.results || []).map((entry) => toContentEntry(entry, locale)),
        )
        return searchEntries.map((content, index) => {
          return {
            title: typeof content.title === 'string' ? content.title : '',
            excerpt: typeof content.description === 'string' ? content.description : '',
            score: Math.max(1, searchEntries.length - index),
            route: routeFactFor(result.results?.[index] || content),
          }
        })
      }),
    )
    const data = collectionResults.flat()
    return sourceResult(data, searchCacheHint(locale))
  },
  siteData: async (
    context: GinkoCmsDataSourceContext,
    request: CmsSiteDataRequest,
    _control: ContentDataSourceControl,
  ) => {
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const locale = request.locale || defaultLocale(contentRuntime)
    const result = decodeRequested(
      'site data',
      parseCmsSiteDataWireResult,
      { locale },
      await callGinko(context.caller, 'siteData', { key: request.key, locale }),
    )
    if (result.key !== request.key) {
      throw providerError(
        'provider_response_invalid',
        'Ginko site data returned a different key than requested.',
        502,
        { operation: 'siteData', field: 'key' },
      )
    }
    return sourceResult(
      {
        key: result.key,
        locale: result.locale?.resolved || result.locale?.requested || locale,
        data: (result.data ?? null) as JsonValue | null,
        updatedAt: null,
      },
      siteDataCacheHint(result.key || request.key || '*', locale),
    )
  },
  routes: async (
    context: GinkoCmsDataSourceContext,
    request: { cursor: string | null; limit: number },
    _control: ContentDataSourceControl,
  ) => {
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const collections = Object.entries(contentRuntime.collections || {})
      .filter(([, collection]) => collection?.type !== 'data')
      .map(([name]) => name)
    const scopes = collections.flatMap((collection) =>
      sitemapLocalesForCollection(contentRuntime, collection).map((locale) => ({
        collection,
        locale,
      })),
    )
    let position = parseRoutesCursor(request.cursor)
    while (position.scope < scopes.length) {
      const scope = scopes[position.scope]!
      const result: RoutesResult = decodeResult(
        'routes',
        parseCmsRoutesWireResult,
        await callGinko(context.caller, 'routes', {
          ...scope,
          cursor: position.backend,
          limit: request.limit,
        }),
      )
      if (
        result.routes.some(
          (route) => route.collection !== scope.collection || route.locale !== scope.locale,
        )
      ) {
        throw providerError(
          'provider_response_invalid',
          'Ginko routes substituted a different collection or locale.',
          502,
          { operation: 'routes', ...scope },
        )
      }
      if (position.snapshot !== null && result.snapshot !== position.snapshot) {
        throw providerError(
          'CURSOR_INVALID',
          'CMS route snapshot changed during enumeration.',
          400,
          {
            operation: 'routes',
          },
        )
      }
      const backend = result.pageInfo?.endCursor ?? null
      const next = backend
        ? { source: 'cms' as const, scope: position.scope, backend, snapshot: result.snapshot }
        : {
            source: 'cms' as const,
            scope: position.scope + 1,
            backend: null,
            snapshot: result.snapshot,
          }
      const records = result.routes.map(
        (route): ContentRouteRecord => ({
          collection: route.collection,
          canonicalKey: route.stableId,
          locale: route.locale,
          contentPath: route.path,
          ...(route.sitemapIncluded ? { sitemap: { lastmod: route.lastmod } } : { sitemap: false }),
        }),
      )
      if (records.length || next.scope >= scopes.length) {
        return sourceResult(
          {
            items: records,
            nextCursor: next.scope >= scopes.length ? null : encodeRoutesCursor(next),
            snapshot: result.snapshot,
          },
          sitemapCacheHint(),
        )
      }
      position = next
    }
    return sourceResult(
      { items: [], nextCursor: null, snapshot: position.snapshot ?? '0' },
      sitemapCacheHint(),
    )
  },
} satisfies ContentDataSource<GinkoCmsDataSourceContext>
