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
  ContentDataSourceControl,
} from '@lupinum/ginko-content/data-source'
import { createContentDataSourceError } from '@lupinum/ginko-content/data-source'
import {
  type ContentProviderNavigationItem,
  type ContentProviderSearchRequest,
  type ContentProviderSiteDataRequest,
  type ContentProviderSurroundingsOptions,
  type ContentProviderVariantSelector,
  type ContentRouteRecord,
} from '@lupinum/ginko-content/provider'
import type { H3Event } from 'h3'

import {
  cacheHintForEntry,
  collectionCacheHint,
  navigationCacheHint,
  searchCacheHint,
  siteDataCacheHint,
  sitemapCacheHint,
  sourceResult,
} from './cache-hints.js'
import { defaultLocale, routeFactFor, toContentEntry } from './content-shaping.js'
import {
  applyOnlyProjection,
  assertPortableListPlan,
  assertProviderQuery,
  assertQueryCollection,
  collectPlanFilter,
  hasExplicitPublicSort,
  sortFromPlan,
  type FilterState,
} from './query-plan.js'
import { callGinko, type ConvexQueryCaller } from './transport.js'

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
type RequestedFacts = Parameters<typeof assertCmsRequestedFacts>[0]['requested']
type ReturnedFacts = Parameters<typeof assertCmsRequestedFacts>[0]['returned']
type RoutesResult = ReturnType<typeof parseCmsRoutesWireResult>
type CmsSearchRequest = ContentProviderSearchRequest & { limit: number }
type CmsSiteDataRequest = ContentProviderSiteDataRequest
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

type RoutesCursor = readonly [
  version: 1,
  scope: number,
  backend: string | null,
  snapshot: string | null,
]

const parseRoutesCursor = (cursor: string | null): RoutesCursor => {
  if (cursor === null) return [1, 0, null, null]
  try {
    const parsed = JSON.parse(cursor) as unknown
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 4 ||
      parsed[0] !== 1 ||
      !Number.isSafeInteger(parsed[1]) ||
      parsed[1] < 0 ||
      (parsed[2] !== null && typeof parsed[2] !== 'string') ||
      (parsed[3] !== null && typeof parsed[3] !== 'string')
    ) {
      throw new Error('invalid')
    }
    return parsed as unknown as RoutesCursor
  } catch {
    throw createContentDataSourceError('QUERY_CURSOR_INVALID')
  }
}

const encodeRoutesCursor = (cursor: RoutesCursor): string => JSON.stringify(cursor)

const pickNavFields = (entry: UnknownRecord, fields: readonly string[] = []): UnknownRecord =>
  Object.fromEntries(fields.filter((field) => field in entry).map((field) => [field, entry[field]]))

const localeFromOptions = (
  options: ContentProviderSurroundingsOptions = {},
  contentRuntime: ContentRuntime = {},
): string => options.locale || defaultLocale(contentRuntime)

const localeFromQuery = (filterState: FilterState, contentRuntime: ContentRuntime = {}): string =>
  filterState.locale || defaultLocale(contentRuntime)

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
  } catch {
    throw createContentDataSourceError('BACKEND_FAILURE')
  }
}

const decodeResult = <T>(operation: string, parser: (raw: unknown) => T, raw: unknown): T => {
  try {
    return parser(raw)
  } catch {
    throw createContentDataSourceError('BACKEND_FAILURE')
  }
}

const resolveVariant = async (
  caller: ConvexQueryCaller,
  collection: string,
  selector: ContentProviderVariantSelector,
  contentRuntime: ContentRuntime,
  control: ContentDataSourceControl,
) => {
  if (selector.by === 'path') {
    const locale = selector.locale || defaultLocale(contentRuntime)
    return {
      locale,
      result: decodeRequested(
        'page',
        parseCmsPageWireResult,
        { collection, locale },
        await callGinko(
          caller,
          'page',
          {
            collection,
            locale,
            path: selector.path,
            fallback: selector.fallback,
          },
          control,
        ),
      ),
    }
  }
  if (selector.by === 'ref') {
    const locale = selector.requestedLocale || defaultLocale(contentRuntime)
    return {
      locale,
      result: decodeRequested(
        'page',
        parseCmsPageWireResult,
        { collection, locale },
        await callGinko(
          caller,
          'page',
          {
            collection,
            locale,
            ref: selector.requestedRef,
            fallback: selector.localeChain?.slice(1),
          },
          control,
        ),
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
      await callGinko(
        caller,
        'page',
        {
          collection,
          locale: candidate.locale,
          path: candidate.contentPath,
        },
        control,
      ),
    )
    if (result.status === 'redirect') {
      result = decodeRequested(
        'page',
        parseCmsPageWireResult,
        { collection, locale: candidate.locale },
        await callGinko(
          caller,
          'page',
          {
            collection,
            locale: candidate.locale,
            path: result.redirectTo.path,
          },
          control,
        ),
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
    control: ContentDataSourceControl,
  ) => {
    assertProviderQuery(input)
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const plan = input.plan
    if (plan.variant) {
      if (!input.collection) {
        throw createContentDataSourceError('QUERY_UNSUPPORTED')
      }
      const { locale, result } = await resolveVariant(
        context.caller,
        input.collection,
        plan.variant,
        contentRuntime,
        control,
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
      throw createContentDataSourceError('QUERY_UNSUPPORTED')
    }
    const collection = input.collection
    assertQueryCollection(collection)
    const filterState = collectPlanFilter(plan.filter)
    if (filterState.impossible) {
      const limit = plan.pagination.limit ?? 100
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
    const locale = localeFromQuery(filterState, contentRuntime)
    const pathPrefix = filterState.pathPrefix
    if (pathPrefix && hasExplicitPublicSort(plan.sort)) {
      throw createContentDataSourceError('QUERY_UNSUPPORTED')
    }
    const sort = sortFromPlan(plan.sort)
    const listArgs = {
      collection,
      locale,
      limit: plan.pagination.limit,
      cursor: plan.pagination.mode === 'cursor' ? plan.pagination.after : undefined,
      ...(pathPrefix ? { pathPrefix } : {}),
      ...(sort ? { sort } : {}),
    }
    const [rawList, total] = await Promise.all([
      callGinko(context.caller, 'list', listArgs, control),
      plan.pagination.mode === 'cursor'
        ? Promise.resolve<number | null>(null)
        : callGinko(
            context.caller,
            'count',
            {
              collection,
              locale,
              ...(pathPrefix ? { pathPrefix } : {}),
            },
            control,
          ).then((value) => {
            if (!Number.isSafeInteger(value) || (value as number) < 0) {
              throw createContentDataSourceError('BACKEND_FAILURE')
            }
            return value as number
          }),
    ])
    const result = decodeRequested('list', parseCmsListWireResult, { collection, locale }, rawList)
    const rawEntries = result.entries || []
    const entries = (
      await Promise.all(rawEntries.map((entry) => toContentEntry(entry, locale)))
    ).map((entry) => applyOnlyProjection(entry, plan.projection?.only))
    const limit = plan.pagination.limit || entries.length
    const data =
      plan.mode === 'first'
        ? { result: entries[0] }
        : plan.pagination.mode === 'cursor'
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
    _options: { readonly limit: number },
    control: ContentDataSourceControl,
  ) => {
    assertProviderQuery(input)
    const collection = input.collection
    assertQueryCollection(collection)
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const locale = localeFromQuery(collectPlanFilter(input.plan.filter), contentRuntime)
    const fields = input.plan?.projection?.only || []
    const result = decodeRequested(
      'navigation',
      parseCmsNavWireResult,
      { collection, locale },
      await callGinko(context.caller, 'nav', { collection, locale }, control),
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
    control: ContentDataSourceControl,
  ) => {
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const locale = localeFromOptions(options, contentRuntime)
    const result = decodeRequested(
      'surroundings',
      parseCmsSurroundWireResult,
      { collection, locale },
      await callGinko(
        context.caller,
        'surround',
        {
          collection,
          locale,
          path,
          previous: 1,
          next: 1,
        },
        control,
      ),
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
    control: ContentDataSourceControl,
  ) => {
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const locale = request.locale || defaultLocale(contentRuntime)
    const query = request.term.trim()
    if (!query) {
      return sourceResult([], searchCacheHint(locale))
    }
    const collections = request.collections?.length
      ? request.collections
      : Object.keys(contentRuntime.collections || {})
    if (!collections.length) {
      throw createContentDataSourceError('QUERY_UNSUPPORTED')
    }
    const collectionResults = await Promise.all(
      collections.map(async (collection) => {
        const result = decodeRequested(
          'search',
          parseCmsSearchWireResult,
          { collection, locale },
          await callGinko(
            context.caller,
            'search',
            {
              query,
              locale,
              collection,
              limit: Math.min(request.limit, CMS_PUBLIC_SEARCH_MAX_LIMIT),
            },
            control,
          ),
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
    control: ContentDataSourceControl,
  ) => {
    const contentRuntime = await contentRuntimeFromEvent(context.event)
    const locale = request.locale || defaultLocale(contentRuntime)
    const result = decodeRequested(
      'site data',
      parseCmsSiteDataWireResult,
      { locale },
      await callGinko(context.caller, 'siteData', { key: request.key, locale }, control),
    )
    if (result.key !== request.key) {
      throw createContentDataSourceError('BACKEND_FAILURE')
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
    control: ContentDataSourceControl,
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
    while (position[1] < scopes.length) {
      const scope = scopes[position[1]]!
      const result: RoutesResult = decodeResult(
        'routes',
        parseCmsRoutesWireResult,
        await callGinko(
          context.caller,
          'routes',
          {
            ...scope,
            cursor: position[2],
            limit: request.limit,
          },
          control,
        ),
      )
      if (
        result.routes.some(
          (route) => route.collection !== scope.collection || route.locale !== scope.locale,
        )
      ) {
        throw createContentDataSourceError('BACKEND_FAILURE')
      }
      if (position[3] !== null && result.snapshot !== position[3]) {
        throw createContentDataSourceError('QUERY_CURSOR_INVALID')
      }
      const backend = result.pageInfo?.endCursor ?? null
      const next: RoutesCursor = backend
        ? [1, position[1], backend, result.snapshot]
        : [1, position[1] + 1, null, result.snapshot]
      const records = result.routes.map(
        (route): ContentRouteRecord => ({
          collection: route.collection,
          canonicalKey: route.stableId,
          locale: route.locale,
          contentPath: route.path,
          ...(route.sitemapIncluded ? { sitemap: { lastmod: route.lastmod } } : { sitemap: false }),
        }),
      )
      if (records.length || next[1] >= scopes.length) {
        return sourceResult(
          {
            items: records,
            nextCursor: next[1] >= scopes.length ? null : encodeRoutesCursor(next),
            snapshot: result.snapshot,
          },
          sitemapCacheHint(),
        )
      }
      position = next
    }
    return sourceResult(
      { items: [], nextCursor: null, snapshot: position[3] ?? '0' },
      sitemapCacheHint(),
    )
  },
} satisfies ContentDataSource<GinkoCmsDataSourceContext>
