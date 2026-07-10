import { withContentCache } from '@lupinum/ginko-content/provider'

import {
  canonicalFromRoute,
  defaultLocale,
  normalizeContentPath,
  publicEntryKey,
  routeFactFor,
  toContentEntry,
} from './nuxt-provider/content-shaping.mjs'
import { callGinko, providerError, setClientFactoryForTests } from './nuxt-provider/transport.mjs'

const normalizeContentTagSegment = (value) => {
  const segment = String(value ?? '').trim()
  if (!segment) {
    throw new Error('Content cache tag segments must be non-empty.')
  }
  return segment.replace(/[:\s]+/g, '-')
}

const uniqueContentTags = (tags) => [
  ...new Set(tags.filter((tag) => typeof tag === 'string' && tag.length > 0)),
]

const contentTags = {
  entry(collection, id, locale) {
    const base = `entry:${normalizeContentTagSegment(collection)}:${normalizeContentTagSegment(id)}`
    return locale ? `${base}:${normalizeContentTagSegment(locale)}` : base
  },

  collection(collection) {
    return `collection:${normalizeContentTagSegment(collection)}`
  },

  route(path) {
    return `route:${normalizeContentPath(path)}`
  },

  nav(collection, locale) {
    return `nav:${normalizeContentTagSegment(collection)}:${normalizeContentTagSegment(locale)}`
  },

  search(locale) {
    return `search:${normalizeContentTagSegment(locale)}`
  },

  sitemap() {
    return 'sitemap'
  },

  siteData(key, locale) {
    const base = `site-data:${normalizeContentTagSegment(key)}`
    return locale ? `${base}:${normalizeContentTagSegment(locale)}` : base
  },
}

export const __setGinkoNuxtProviderClientFactoryForTests = (factory) => {
  setClientFactoryForTests(factory)
}

const runtimeConfigFromEvent = async (event) => {
  const eventRuntimeConfig = event?.context?.nitro?.runtimeConfig || event?.context?.runtimeConfig
  if (eventRuntimeConfig) return eventRuntimeConfig

  try {
    const { useRuntimeConfig } = await import('nitropack/runtime')
    const runtimeConfig = useRuntimeConfig(event)
    if (runtimeConfig?.public || runtimeConfig?.content) return runtimeConfig
  } catch {
    // Fall back below for provider-contract tests that pass runtime config directly.
  }
  return event?.context?.runtimeConfig
}

const contentRuntimeFromEvent = async (event) => {
  const runtime = await runtimeConfigFromEvent(event)
  const publicRuntime = runtime?.public || {}
  const contentRuntime = publicRuntime.content || runtime?.content || {}
  const cmsRuntime = publicRuntime.ginkoCms || runtime?.ginkoCms || {}
  const i18nRuntime = publicRuntime.i18n || runtime?.i18n || {}
  const contentI18n = contentRuntime.i18n || {}
  const defaultLocaleCode =
    cmsRuntime.defaultLocale ||
    contentRuntime.defaultLocale ||
    contentI18n.defaultLocale ||
    i18nRuntime.defaultLocale

  return {
    ...contentRuntime,
    collections: {
      ...(contentRuntime.collections || {}),
      ...(cmsRuntime.collections || {}),
    },
    ...(defaultLocaleCode ? { defaultLocale: defaultLocaleCode } : {}),
    locales:
      contentRuntime.locales ||
      cmsRuntime.locales?.map?.((locale) => (typeof locale === 'string' ? locale : locale.code)) ||
      i18nRuntime.locales?.map?.((locale) => (typeof locale === 'string' ? locale : locale.code)),
    i18n: {
      ...contentI18n,
      ...(i18nRuntime || {}),
      ...(defaultLocaleCode ? { defaultLocale: defaultLocaleCode } : {}),
    },
  }
}

const sitemapLocalesForCollection = (contentRuntime, collection, requestedLocale) => {
  if (requestedLocale) return [requestedLocale]

  const runtimeCollection = contentRuntime?.collections?.[collection]
  if (Array.isArray(runtimeCollection?.i18n?.locales) && runtimeCollection.i18n.locales.length) {
    return runtimeCollection.i18n.locales
  }

  const contentLocales = contentRuntime?.locales
  if (Array.isArray(contentLocales) && contentLocales.length) return contentLocales

  return [defaultLocale(contentRuntime)]
}

const normalizeCacheHint = (hint = {}) => ({
  ...hint,
  tags: uniqueContentTags(hint.tags || []),
  paths: uniqueContentTags((hint.paths || []).map((path) => normalizeContentPath(path))),
})

const cacheHintForEntry = (entry, content) => {
  const locale =
    entry?.locale?.resolved ||
    entry?.locale?.requested ||
    content?.resolved?.locale ||
    defaultLocale()
  const routePath = content?.unprefixedPath || content?.path || entry?.route?.path
  const updatedAt = entry?.updatedAt || content?.updatedAt
  return normalizeCacheHint({
    tags: [
      contentTags.collection(entry.collection),
      contentTags.entry(entry.collection, publicEntryKey(entry)),
      contentTags.entry(entry.collection, publicEntryKey(entry), locale),
      routePath ? contentTags.route(routePath) : null,
    ],
    paths: routePath ? [routePath] : [],
    lastModified: updatedAt ? new Date(updatedAt) : undefined,
  })
}

const mergeCacheHints = (...hints) => {
  const activeHints = hints.filter((hint) => hint && hint !== false)
  if (hints.includes(false)) return false
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

const collectionCacheHint = (collection) =>
  normalizeCacheHint({ tags: [contentTags.collection(collection)] })

const navigationCacheHint = (collection, locale) =>
  normalizeCacheHint({
    tags: [contentTags.collection(collection), contentTags.nav(collection, locale)],
  })

const searchCacheHint = (locale, collection) =>
  normalizeCacheHint({
    tags: [collection ? contentTags.collection(collection) : null, contentTags.search(locale)],
  })

const siteDataCacheHint = (key, locale) =>
  normalizeCacheHint({ tags: [contentTags.siteData(key || '*', locale)] })

const sitemapCacheHint = () => normalizeCacheHint({ tags: [contentTags.sitemap()] })

const pickNavFields = (entry = {}, fields = []) =>
  Object.fromEntries(fields.filter((field) => field in entry).map((field) => [field, entry[field]]))

const assertUnsupportedQueryShape = (condition, field, message) => {
  if (!condition) return
  throw providerError('unsupported_query_shape', message, 400, { field })
}

const applyOnlyProjection = (entry, only = []) => {
  if (!only.length) return entry
  const projected = {}
  for (const field of only) {
    if (field in entry) projected[field] = entry[field]
  }
  return projected
}

const assertProviderQuery = (input = {}) => {
  if (!input || typeof input !== 'object' || input.v !== 2 || !input.plan) {
    throw providerError(
      'unsupported_query_shape',
      'Ginko CMS provider requires the ginko-content provider query wire v2.',
      400,
      { field: 'query' },
    )
  }
}

const assertQueryCollection = (collection) => {
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

const assertPortableListPlan = (query) => {
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

const unsupportedFilter = (field = 'where') => {
  throw providerError(
    'unsupported_query_shape',
    'Ginko public list queries only support public visibility predicates.',
    400,
    { field },
  )
}

const assertSupportedPlanOperator = (operator) => {
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

const applyPlanCompare = (state, clause) => {
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
  unsupportedFilter('where')
}

const collectPlanFilter = (filter, state = {}) => {
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

const sortFromPlan = (sort = []) => {
  const supportedFields = new Set([
    'orderKey',
    'entryCreatedAt',
    'firstPublishedAt',
    'lastPublishedAt',
  ])
  for (const item of sort) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const field = item.field
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

const hasExplicitPublicSort = (sort = []) => sort.some((item) => item?.field)

const localeFromOptions = (options = {}, contentRuntime = {}) =>
  options.locale || options.resolveLocale?.locale || defaultLocale(contentRuntime)

const localeFromQuery = (query, filterState, contentRuntime = {}) =>
  query.plan?.resolveLocale?.locale || filterState.locale || defaultLocale(contentRuntime)

const resolveVariant = async (event, collection, selector, contentRuntime) => {
  if (selector.by === 'ref') {
    const locale = selector.requestedLocale || defaultLocale(contentRuntime)
    return {
      locale,
      result: await callGinko(event, 'page', {
        collection,
        locale,
        ref: selector.ref,
        fallback: selector.localeChain?.slice(1),
      }),
    }
  }

  // Route selectors are already closed and ordered by ginko-content. Trying them
  // in order keeps locale fallback policy in the content engine, not this adapter.
  for (const candidate of selector.candidates || []) {
    const result = await callGinko(event, 'page', {
      collection,
      locale: candidate.locale,
      path: canonicalFromRoute(candidate.contentPath, candidate.locale),
    })
    if (result.status === 'found' && result.page) return { locale: candidate.locale, result }
  }
  return {
    locale: selector.requestedLocale || defaultLocale(contentRuntime),
    result: { status: 'not-found', page: null },
  }
}

const contentProvider = {
  name: 'cms',
  capabilities: {
    query: {
      operators: ['$eq', '$ne', '$prefix'],
      pagination: ['cursor'],
    },
  },
  query: async (event, input = {}) => {
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
        result.status === 'found' && result.page
          ? await toContentEntry(event, result.page, locale, {
              defaultLocale: defaultLocale(contentRuntime),
              contentRuntime,
            })
          : null
      const data = { result: entry ? applyOnlyProjection(entry, plan.projection?.only) : null }
      return withContentCache(
        data,
        entry ? cacheHintForEntry(result.page, entry) : collectionCacheHint(input.collection),
      )
    }

    assertPortableListPlan(input)
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
    const result = await callGinko(event, 'list', {
      collection: input.collection,
      locale,
      limit: plan.paging?.mode === 'cursor' ? plan.paging.limit : plan.limit,
      cursor: plan.paging?.mode === 'cursor' ? plan.paging.after : undefined,
      ...(pathPrefix ? { pathPrefix } : {}),
      ...(sort ? { sort } : {}),
    })
    const rawEntries = result.entries || []
    const entries = (
      await Promise.all(
        rawEntries.map((entry) =>
          toContentEntry(event, entry, locale, {
            defaultLocale: defaultLocale(contentRuntime),
            contentRuntime,
          }),
        ),
      )
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
    return withContentCache(
      data,
      mergeCacheHints(collectionCacheHint(input.collection), ...entryHints),
    )
  },
  navigation: async (event, input, options = {}) => {
    assertProviderQuery(input)
    const collection = input.collection
    assertQueryCollection(collection)
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = options.locale || defaultLocale(contentRuntime)
    const fields = input.plan?.projection?.only || []
    const result = await callGinko(event, 'nav', { collection, locale })
    return withContentCache(
      (result.tree || []).map(function toRawNavigation(node) {
        const entry = node.entry || {}
        return {
          ...pickNavFields(entry, fields),
          title: entry.title || node.title || '',
          route: routeFactFor(entry),
          children: (node.children || []).map(toRawNavigation),
        }
      }),
      navigationCacheHint(collection, locale),
    )
  },
  surroundings: async (event, collection, path, options = {}) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = localeFromOptions(options, contentRuntime)
    const result = await callGinko(event, 'surround', {
      collection,
      locale,
      path: canonicalFromRoute(path, locale),
      previous: 1,
      next: 1,
    })
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
  search: async (event, request = {}) => {
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
        const result = await callGinko(event, 'search', {
          query,
          locale,
          collection,
        })
        const searchEntries = await Promise.all(
          (result.results || []).map((entry) =>
            toContentEntry(event, entry, locale, {
              defaultLocale: defaultLocale(contentRuntime),
              contentRuntime,
            }),
          ),
        )
        return searchEntries.map((content, index) => {
          return {
            title: content.title || '',
            excerpt: result.results?.[index]?.snippet || content.description || '',
            score: Math.max(1, searchEntries.length - index),
            route: routeFactFor(result.results?.[index] || content),
          }
        })
      }),
    )
    const data = collectionResults.flat()
    return withContentCache(data, searchCacheHint(locale))
  },
  siteData: async (event, request = {}) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = request.locale || defaultLocale(contentRuntime)
    const result = await callGinko(event, 'siteData', {
      key: request.key,
      locale,
    })
    return withContentCache(
      {
        key: result.key,
        locale: result.locale?.resolved || result.locale?.requested || locale,
        data: result.data ?? null,
        updatedAt: result.updatedAt,
      },
      siteDataCacheHint(result.key || request.key || '*', locale),
    )
  },
  routes: async (event) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const collections = Object.entries(contentRuntime.collections || {})
      .filter(([, collection]) => collection?.type !== 'data')
      .map(([name]) => name)
    const records = []
    const MAX_ROUTE_PAGES = 1000
    const MAX_ROUTE_RECORDS = 100_000
    for (const collection of collections) {
      for (const locale of sitemapLocalesForCollection(contentRuntime, collection)) {
        let cursor = null
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
          const result = await callGinko(event, 'routes', {
            collection,
            locale,
            cursor,
          })
          if (records.length + (result.routes?.length || 0) > MAX_ROUTE_RECORDS) {
            throw providerError(
              'unsupported_provider_prerender',
              `CMS route enumeration exceeded its safety bound for collection "${collection}".`,
              500,
              { collection, maxPages: MAX_ROUTE_PAGES, maxRecords: MAX_ROUTE_RECORDS },
            )
          }
          records.push(
            ...(result.routes || []).map((route) => ({
              collection: route.collection,
              canonicalKey: `${route.collection}:${route.stableId}`,
              locale: route.locale,
              contentPath: route.path,
              ...(route.sitemapIncluded
                ? { sitemap: { lastmod: route.lastmod } }
                : { sitemap: false }),
            })),
          )
          cursor = result.pageInfo?.endCursor ?? null
        } while (cursor)
      }
    }
    return withContentCache(records, sitemapCacheHint())
  },
}

export { contentProvider }
export default contentProvider
