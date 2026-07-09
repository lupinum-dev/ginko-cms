import { normalizeProviderDocument, shapeProviderDocument } from '@lupinum/ginko-content/provider'

const normalizeContentTagSegment = (value) => {
  const segment = String(value ?? '').trim()
  if (!segment) {
    throw new Error('Content cache tag segments must be non-empty.')
  }
  return segment.replace(/[:\s]+/g, '-')
}

const normalizeContentPath = (path) => {
  const value = String(path ?? '').trim()
  if (!value || value === '/') return '/'
  const pathWithoutSlashes = value.replace(/^\/+|\/+$/g, '')
  return pathWithoutSlashes ? `/${pathWithoutSlashes}` : '/'
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

const supportedQueryOperators = new Set([
  '$eq',
  '$ne',
  '$in',
  '$contains',
  '$icontains',
  '$prefix',
  '$and',
  '$or',
])

let testClientFactory

export const __setGinkoNuxtProviderClientFactoryForTests = (factory) => {
  testClientFactory = factory
}

const providerError = (code, message, statusCode = 400, details = {}) => {
  const error = new Error(message)
  error.statusCode = statusCode
  error.statusMessage = code
  error.data = { code, ...details }
  return error
}

const requiredEnv = (name) => {
  const value = process.env[name]
  if (!value) {
    throw providerError(
      'provider_config_missing',
      `${name} is required for the CMS content provider.`,
      500,
      {
        env: name,
      },
    )
  }
  return value
}

const optionalEnv = (name, fallback) => process.env[name] || fallback

const convexUrl = () =>
  process.env.NUXT_PUBLIC_CONVEX_URL ||
  process.env.CONVEX_URL ||
  requiredEnv('NUXT_PUBLIC_CONVEX_URL')

const convexFunctionPrefix = () => 'ginkoCms/public:'

const convexAssetsFunctionPrefix = () => 'ginkoCms/assets:'

const defaultLocale = (runtime = {}) =>
  runtime?.defaultLocale ||
  runtime?.i18n?.defaultLocale ||
  process.env.GINKO_CONTENT_DEFAULT_LOCALE ||
  process.env.NUXT_PUBLIC_GINKO_CONTENT_DEFAULT_LOCALE ||
  'en'

const providerSite = () => optionalEnv('GINKO_CONTENT_PROVIDER_SITE', 'default')

const functionReference = (name) => ({ [Symbol.for('functionName')]: name })

const localeLanguageFromEnv = () => {
  return {}
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

const localeLanguageFromRuntime = async (event) => {
  const envLanguages = localeLanguageFromEnv()
  if (Object.keys(envLanguages).length > 0) return envLanguages

  const runtime = await runtimeConfigFromEvent(event)
  const i18nLocales = runtime?.public?.i18n?.locales || runtime?.i18n?.locales
  if (Array.isArray(i18nLocales)) {
    return Object.fromEntries(
      i18nLocales
        .filter((locale) => locale && typeof locale.code === 'string')
        .map((locale) => [locale.code, locale.language || locale.code]),
    )
  }

  const contentLocales = runtime?.public?.content?.locales || runtime?.content?.locales
  if (!Array.isArray(contentLocales)) return {}
  return Object.fromEntries(
    contentLocales
      .filter((locale) => typeof locale === 'string' && locale.length > 0)
      .map((locale) => [locale, locale]),
  )
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

const enabledSitemapCollections = (contentRuntime, options = {}) => {
  const runtimeCollections = contentRuntime?.collections || {}
  const requestedCollections =
    options.include || options.collections || contentRuntime?.sitemap?.include
  const collections = requestedCollections?.length
    ? requestedCollections
    : Object.keys(runtimeCollections)
  const excluded = new Set([
    ...(contentRuntime?.sitemap?.exclude || []),
    ...(options.exclude || []),
  ])

  return [...new Set(collections)]
    .filter((collection) => !excluded.has(collection))
    .filter((collection) => runtimeCollections[collection]?.sitemap !== false)
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

const normalizeRemoteError = (error, operation) => {
  const rawData = error?.data || error?.serverErrorData || error?.cause?.data || {}
  const data =
    typeof rawData === 'string'
      ? (() => {
          try {
            return JSON.parse(rawData)
          } catch {
            return { message: rawData }
          }
        })()
      : rawData
  const code = error?.statusMessage || data.code || 'provider_query_failed'
  const statusCode =
    error?.statusCode || data.statusCode || (code === 'missing_locale_route' ? 404 : 500)
  return providerError(
    code,
    error instanceof Error ? error.message : `CMS provider query failed: ${operation}`,
    statusCode,
    { operation, ...data },
  )
}

const callConvexFunction = async (functionName, operation, args) => {
  const { ConvexHttpClient } = await import('convex/browser')
  const client = testClientFactory
    ? testClientFactory(convexUrl())
    : new ConvexHttpClient(convexUrl())
  // Reading validates site configuration early even before multi-site routing lands.
  providerSite()
  try {
    return await client.query(functionReference(functionName), args)
  } catch (error) {
    throw normalizeRemoteError(error, operation)
  }
}

const callGinko = async (operation, args) =>
  await callConvexFunction(`${convexFunctionPrefix()}${operation}`, operation, args)

const callGinkoAsset = async (operation, args) =>
  await callConvexFunction(
    `${convexAssetsFunctionPrefix()}${operation}`,
    `assets:${operation}`,
    args,
  )

const routePathname = (path = '/') => {
  const raw = String(path || '/')
  try {
    return normalizeContentPath(new URL(raw, 'https://ginko.local').pathname)
  } catch {
    return normalizeContentPath(raw.split(/[?#]/)[0] || '/')
  }
}

const canonicalFromRoute = (path = '/', locale = defaultLocale()) => {
  const normalized = routePathname(path)
  if (locale && normalized === `/${locale}`) return '/'
  if (locale && normalized.startsWith(`/${locale}/`)) {
    return normalized.slice(locale.length + 1) || '/'
  }
  return normalized
}

const hrefFor = (route, locale, options = {}) => {
  if (options.preferStoredHref !== false && typeof route?.href === 'string' && route.href) {
    return routePathname(route.href)
  }

  const rawPath = route?.path || route?.href || '/'
  const path = rawPath === '/' ? '' : `/${rawPath.replace(/^\/+/, '').replace(/\/+$/, '')}`
  const defaultLocaleCode = options.defaultLocale || defaultLocale()
  const prefix = locale && locale !== defaultLocaleCode ? `/${locale}` : ''
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) return path || '/'
  return `${prefix}${path}` || '/'
}

const publicEntryKey = (entry) => entry?.stableId || entry?.ref || entry?.revision || entry?.id

const providerResultMarker = '__ginkoContentProviderResult'

const withContentCache = (data, cache) => ({
  [providerResultMarker]: true,
  data,
  cache: cache === false ? false : normalizeCacheHint(cache),
})

const normalizeCacheHint = (hint = {}) => ({
  ...hint,
  tags: uniqueContentTags(hint.tags || []),
  paths: uniqueContentTags((hint.paths || []).map((path) => normalizeContentPath(path))),
})

const publishedTranslations = (entry) =>
  (entry?.translations || []).filter(
    (translation) => translation?.status === 'published' && translation.route?.path,
  )

const emptyBody = () => ({
  type: 'root',
  props: {},
  children: [],
})

const parsedBodyFromData = (entry = {}, data = {}, options = {}) => {
  const value = entry.bodyAst || data.bodyAst
  if (value && typeof value === 'object') return value
  if (options.required === false) return emptyBody()
  throw providerError(
    'provider_body_ast_missing',
    'Published content is missing its parsed Comark body AST.',
    500,
  )
}

const hasStoredParsedBody = (entry = {}, data = {}) =>
  Boolean(
    (entry.bodyAst && typeof entry.bodyAst === 'object') ||
    (data.bodyAst && typeof data.bodyAst === 'object'),
  )

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

const hasLegacyMarkdownBody = (entry = {}, data = {}) =>
  isNonEmptyString(entry.bodyMdc) ||
  isNonEmptyString(data.bodyMdc) ||
  isNonEmptyString(entry.body) ||
  isNonEmptyString(data.body)

const longAssetIdPattern = /^[a-z0-9]{20,40}$/i
const storageRefPattern = /^[a-z0-9]+;[a-z_]+$/i

const looksLikeAssetId = (value) => {
  if (typeof value !== 'string') return false
  if (longAssetIdPattern.test(value)) return true
  if (!storageRefPattern.test(value)) return false
  return value.endsWith(';assets') || value.endsWith(';_storage')
}

const collectAssetIds = (value, out = new Set()) => {
  if (typeof value === 'string') {
    if (looksLikeAssetId(value)) out.add(value)
    return out
  }
  if (!value || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    for (const child of value) collectAssetIds(child, out)
    return out
  }
  for (const child of Object.values(value)) collectAssetIds(child, out)
  return out
}

const replaceAssetIds = (value, urls) => {
  if (typeof value === 'string') return urls.get(value) || value
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((child) => replaceAssetIds(child, urls))
  const next = {}
  for (const [key, child] of Object.entries(value)) next[key] = replaceAssetIds(child, urls)
  return next
}

const resolvePublicAssetIds = async (values = []) => {
  const assetIds = [...new Set(values.flatMap((value) => [...collectAssetIds(value)]))]
  if (assetIds.length === 0) return new Map()
  const entries = await Promise.all(
    assetIds.map(async (assetId) => [assetId, await callGinkoAsset('getAssetUrl', { assetId })]),
  )
  return new Map(entries.filter(([, url]) => typeof url === 'string' && url.length > 0))
}

const collectionRouteFor = (contentRuntime = {}, collection) => {
  const runtimeCollection = contentRuntime?.collections?.[collection]
  const routing = runtimeCollection?.routing || {}
  const settings = runtimeCollection?.settings || {}
  if (routing.singleton) {
    return settings.localizedSingletonPaths || settings.singletonPath || routing.pathPrefix
  }
  return settings.localizedPathPrefixes || routing.pathPrefix
}

const contentLocalesFor = (contentRuntime = {}, collection, fallbackLocales = []) => {
  const runtimeCollection = contentRuntime?.collections?.[collection]
  const collectionLocales = runtimeCollection?.locales
  if (Array.isArray(collectionLocales) && collectionLocales.length) return collectionLocales
  const contentLocales = contentRuntime?.locales
  if (Array.isArray(contentLocales) && contentLocales.length) return contentLocales
  return fallbackLocales.length ? fallbackLocales : [defaultLocale(contentRuntime)]
}

const variantEntriesFor = (entry, locale, route) => {
  const variants = [{ locale, route }, ...publishedTranslations(entry)]
    .filter((variant) => variant.locale && variant.route?.path)
    .filter(
      (variant, index, list) => list.findIndex((item) => item.locale === variant.locale) === index,
    )
  return variants
}

const toContentDocument = async (entry, requestedLocale = defaultLocale(), options = {}) => {
  const data = entry?.data && typeof entry.data === 'object' ? entry.data : {}
  const assetUrls = await resolvePublicAssetIds([data, entry?.bodyAst, data.bodyAst])
  const publicData = replaceAssetIds(data, assetUrls)
  const hasMarkdownBody = hasStoredParsedBody(entry, data) || hasLegacyMarkdownBody(entry, data)
  const route = entry?.route || {}
  const requested = entry?.locale?.requested || requestedLocale
  const locale =
    entry?.locale?.resolved || entry?.locale?.requested || route.locale || requestedLocale
  const path = route.path || data.path || '/'
  const variants = variantEntriesFor(entry, locale, route)
  const variantPaths = Object.fromEntries(
    variants.map((variant) => [variant.locale, variant.route.path]),
  )
  const availableLocales = variants.map((variant) => variant.locale)
  const entryKey = publicEntryKey(entry)
  const fallback = requested !== locale

  return normalizeProviderDocument({
    ...publicData,
    id: entry.id,
    collection: entry.collection,
    type: hasMarkdownBody ? 'markdown' : 'yaml',
    path,
    locale,
    canonicalKey: `${entry.collection}:${entryKey}`,
    ref: entry.ref || entryKey,
    title: entry.title,
    description: publicData.description || publicData.excerpt || '',
    body: replaceAssetIds(
      parsedBodyFromData(entry, data, {
        required: options.includeBody !== false && hasMarkdownBody,
      }),
      assetUrls,
    ),
    resolved: {
      locale,
      requestedLocale: requested,
      fallback,
      variantPaths,
      ...(options.requestedRoute ? { requestedRoute: options.requestedRoute } : {}),
      ...(options.requestedRef ? { requestedRef: options.requestedRef } : {}),
      availableLocales,
    },
    stableId: entryKey,
    updatedAt: entry.updatedAt || entry.publishedAt,
  })
}

const toContentEntry = async (entry, requestedLocale = defaultLocale(), options = {}) => {
  const document = await toContentDocument(entry, requestedLocale, options)
  if (options.shape === false) return document
  const contentRuntime = options.contentRuntime || {}
  const shaped = shapeProviderDocument(document, {
    defaultLocale: options.defaultLocale || defaultLocale(contentRuntime),
    locales: contentLocalesFor(
      contentRuntime,
      document.collection,
      document.resolved?.availableLocales,
    ),
    route: collectionRouteFor(contentRuntime, document.collection),
  })
  const storedHref = entry?.route?.href
  if (typeof storedHref !== 'string' || !storedHref) return shaped
  const path = options.canonical ? document.path : routePathname(storedHref)
  return {
    ...shaped,
    path,
    resolved: {
      ...shaped.resolved,
      path,
    },
  }
}

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

const toNavItem = (node, fields = [], options = {}) => {
  const entry = node?.entry || {}
  const unprefixedPath = entry.route?.path || node?.path || ''
  return {
    ...pickNavFields(entry, fields),
    title: entry.title || node?.title || '',
    path:
      options.canonical && unprefixedPath
        ? unprefixedPath
        : entry.route
          ? hrefFor(entry.route, entry.route.locale, options)
          : node?.path || '',
    unprefixedPath,
    locale: entry.route?.locale,
    stableId: entry.stableId ?? entry.revision ?? entry.id,
    ref: entry.ref ?? entry.stableId ?? entry.revision ?? entry.id,
    children: (node?.children || []).map((child) => toNavItem(child, fields, options)),
  }
}

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
  if (!input || typeof input !== 'object' || input.v !== 1 || !input.plan) {
    throw providerError(
      'unsupported_query_shape',
      'Ginko CMS provider requires the ginko-content provider query wire v1.',
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

const fallbackFromOptions = (options = {}) => {
  if ('fallback' in (options.resolveLocale || {})) return options.resolveLocale.fallback
  if ('fallback' in options) return options.fallback
  return undefined
}

const fallbackFromPlan = (plan = {}) =>
  plan.resolveVariant?.fallback || plan.resolveLocale?.fallback

const lookupFromVariantSelector = (variant = {}) => {
  if (typeof variant.path === 'string') return { path: variant.path }
  if (typeof variant.route === 'string') return { path: variant.route }
  if (typeof variant.ref === 'string') return { ref: variant.ref }
  return { path: '/' }
}

const contentProvider = {
  name: 'cms',
  capabilities: {
    routeBackedCollections: true,
    dataCollections: true,
    localizedRoutes: true,
    translatedSlugs: true,
    navigation: true,
    surroundings: true,
    searchSections: false,
    sitemap: true,
    query: {
      operators: Array.from(supportedQueryOperators),
      limit: true,
      skip: false,
      count: false,
    },
  },
  query: async (event, input = {}) => {
    assertProviderQuery(input)
    const contentRuntime = await contentRuntimeFromEvent(event)
    const plan = input.plan
    if (plan.resolveVariant) {
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
      const variant = plan.resolveVariant
      const locale = variant.locale || plan.resolveLocale?.locale || defaultLocale(contentRuntime)
      const lookup = lookupFromVariantSelector(variant)
      const fallback = fallbackFromPlan(plan)
      const result = await callGinko('page', {
        collection: input.collection,
        locale,
        ...(fallback !== undefined ? { fallback } : {}),
        ...(lookup.ref ? { ref: lookup.ref } : { path: canonicalFromRoute(lookup.path, locale) }),
      })
      const entry =
        result.status === 'found' && result.page
          ? await toContentEntry(result.page, locale, {
              requestedRoute: lookup.ref ? undefined : lookup.path,
              requestedRef: lookup.ref,
              defaultLocale: defaultLocale(contentRuntime),
              contentRuntime,
              shape: false,
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
    const result = await callGinko('list', {
      collection: input.collection,
      locale,
      limit: plan.limit,
      cursor: undefined,
      ...(pathPrefix ? { pathPrefix } : {}),
      ...(sort ? { sort } : {}),
    })
    const rawEntries = result.entries || []
    const entries = (
      await Promise.all(
        rawEntries.map((entry) =>
          toContentEntry(entry, locale, {
            defaultLocale: defaultLocale(contentRuntime),
            contentRuntime,
            shape: false,
          }),
        ),
      )
    ).map((entry) => applyOnlyProjection(entry, plan.projection?.only))
    const data =
      plan.mode === 'first'
        ? { result: entries[0] || null }
        : {
            result: entries,
            skip: 0,
            limit: plan.limit || entries.length,
            total: entries.length,
            pageInfo: result.pageInfo,
          }
    const entryHints = rawEntries.map((entry, index) => cacheHintForEntry(entry, rawEntries[index]))
    return withContentCache(
      data,
      mergeCacheHints(collectionCacheHint(input.collection), ...entryHints),
    )
  },
  navigationQuery: async (event, input = {}, options = {}) => {
    assertProviderQuery(input)
    const contentRuntime = await contentRuntimeFromEvent(event)
    const filterState = collectPlanFilter(input.plan?.filter)
    const locale =
      options.resolveLocale?.locale || localeFromQuery(input, filterState, contentRuntime)
    return input.collection
      ? await contentProvider.navigation(event, input.collection, {
          locale,
          canonical: options.canonical,
          fields: options.fields || [],
        })
      : []
  },
  navigation: async (event, collection, fieldsOrOptions = []) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const options = Array.isArray(fieldsOrOptions) ? { fields: fieldsOrOptions } : fieldsOrOptions
    const locale = localeFromOptions(options, contentRuntime)
    const result = await callGinko('nav', { collection, locale })
    return withContentCache(
      (result.tree || []).map((node) =>
        toNavItem(node, options.fields || [], { defaultLocale: defaultLocale(contentRuntime) }),
      ),
      navigationCacheHint(collection, locale),
    )
  },
  surroundings: async (event, collection, path, options = {}) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = localeFromOptions(options, contentRuntime)
    const result = await callGinko('surround', {
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
              path: hrefFor(previous.route, locale, {
                defaultLocale: defaultLocale(contentRuntime),
              }),
              unprefixedPath: previous.route?.path,
            }
          : null,
        next
          ? {
              title: next.title,
              path: hrefFor(next.route, locale, { defaultLocale: defaultLocale(contentRuntime) }),
              unprefixedPath: next.route?.path,
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
        const result = await callGinko('search', {
          query,
          locale,
          collection,
        })
        const searchEntries = await Promise.all(
          (result.results || []).map((entry) =>
            toContentEntry(entry, locale, {
              defaultLocale: defaultLocale(contentRuntime),
              contentRuntime,
            }),
          ),
        )
        return searchEntries.map((content, index) => {
          return {
            path: content.path || content.unprefixedPath || '',
            title: content.title || '',
            excerpt: result.results?.[index]?.snippet || content.description || '',
            score: Math.max(1, searchEntries.length - index),
            locale: content.locale,
            collection: content.collection || result.results?.[index]?.collection || collection,
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
    const result = await callGinko('siteData', {
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
  page: async (event, collection, routeOrPath = '/', options = {}) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = localeFromOptions(options, contentRuntime)
    const result = await callGinko('page', {
      collection,
      locale,
      path: canonicalFromRoute(routeOrPath || options.fallbackRoute || '/', locale),
      ...(fallbackFromOptions(options) !== undefined
        ? { fallback: fallbackFromOptions(options) }
        : {}),
    })
    const entry =
      result.status === 'found' && result.page
        ? await toContentEntry(result.page, locale, {
            canonical: options.canonical,
            requestedRoute: routeOrPath || options.fallbackRoute || '/',
            defaultLocale: defaultLocale(contentRuntime),
            contentRuntime,
          })
        : null
    return withContentCache(
      entry,
      entry ? cacheHintForEntry(result.page, entry) : collectionCacheHint(collection),
    )
  },
  routeMeta: async (event, collection, routeOrPath = '/', options = {}) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const locale = localeFromOptions(options, contentRuntime)
    const result = await callGinko('routeMeta', {
      collection,
      locale,
      path: canonicalFromRoute(routeOrPath || options.fallbackRoute || '/', locale),
      ...(fallbackFromOptions(options) !== undefined
        ? { fallback: fallbackFromOptions(options) }
        : {}),
    })
    const page =
      result.status === 'found' && result.page
        ? await toContentEntry(result.page, locale, {
            canonical: options.canonical,
            includeBody: false,
            requestedRoute: routeOrPath || options.fallbackRoute || '/',
            defaultLocale: defaultLocale(contentRuntime),
            contentRuntime,
          })
        : null
    if (!page) return null
    return withContentCache(
      {
        title: page.title,
        description: page.description,
        path: page.path,
        unprefixedPath: page.unprefixedPath,
        locale: page.locale,
        defaultLocale: page.defaultLocale,
        variants: page.variants,
        localePaths: page.localePaths,
        resolved: page.resolved,
      },
      cacheHintForEntry(result.page, page),
    )
  },
  sitemapEntries: async (event, options = {}) => {
    const contentRuntime = await contentRuntimeFromEvent(event)
    const collections = enabledSitemapCollections(contentRuntime, options)
    const urls = []
    for (const collection of collections) {
      for (const locale of sitemapLocalesForCollection(
        contentRuntime,
        collection,
        options.locale,
      )) {
        let cursor = null
        do {
          const result = await callGinko('sitemap', {
            collection,
            locale,
            cursor,
          })
          urls.push(...(result.urls || []))
          cursor = result.pageInfo?.endCursor ?? null
        } while (cursor)
      }
    }
    const localeLanguages = await localeLanguageFromRuntime(event)
    const sitemapDefaultLocale = defaultLocale(contentRuntime)
    return withContentCache(
      urls.map((url) => {
        const xDefaultAlternative = url.xDefault
          ? [
              {
                hreflang: 'x-default',
                href: hrefFor(url.xDefault, url.xDefault.locale, {
                  preferStoredHref: false,
                  defaultLocale: sitemapDefaultLocale,
                }),
              },
            ]
          : []
        return {
          _sitemap:
            localeLanguages[url.route?.locale || ''] || url.route?.locale || sitemapDefaultLocale,
          loc: hrefFor(url.route, url.route?.locale, {
            preferStoredHref: false,
            defaultLocale: sitemapDefaultLocale,
          }),
          alternatives: [
            ...(url.alternates || []).map((alternate) => ({
              hreflang: alternate.hreflang || alternate.locale,
              href: hrefFor(alternate.route, alternate.route?.locale || alternate.locale, {
                preferStoredHref: false,
                defaultLocale: sitemapDefaultLocale,
              }),
            })),
            ...xDefaultAlternative,
          ],
          lastmod: url.lastmod,
        }
      }),
      sitemapCacheHint(),
    )
  },
}

export { contentProvider }
export default contentProvider
