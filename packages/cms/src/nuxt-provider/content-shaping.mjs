import { normalizeProviderDocument } from '@lupinum/ginko-content/provider'

import { callGinkoAsset, providerError } from './transport.mjs'

export const defaultLocale = (runtime = {}) =>
  runtime?.defaultLocale ||
  runtime?.i18n?.defaultLocale ||
  process.env.GINKO_CONTENT_DEFAULT_LOCALE ||
  process.env.NUXT_PUBLIC_GINKO_CONTENT_DEFAULT_LOCALE ||
  'en'

export const normalizeContentPath = (path) => {
  const value = String(path ?? '').trim()
  if (!value || value === '/') return '/'
  const pathWithoutSlashes = value.replace(/^\/+|\/+$/g, '')
  return pathWithoutSlashes ? `/${pathWithoutSlashes}` : '/'
}

export const routePathname = (path = '/') => {
  const raw = String(path || '/')
  try {
    return normalizeContentPath(new URL(raw, 'https://ginko.local').pathname)
  } catch {
    return normalizeContentPath(raw.split(/[?#]/)[0] || '/')
  }
}

export const canonicalFromRoute = (path = '/', locale = defaultLocale()) => {
  const normalized = routePathname(path)
  if (locale && normalized === `/${locale}`) return '/'
  if (locale && normalized.startsWith(`/${locale}/`)) {
    return normalized.slice(locale.length + 1) || '/'
  }
  return normalized
}

export const publicEntryKey = (entry) => {
  if (typeof entry?.stableId === 'string' && entry.stableId.length > 0) return entry.stableId
  throw providerError(
    'provider_stable_id_missing',
    'Published content is missing its stable identity. Republish the entry to rebuild its public projection.',
    500,
    { collection: entry?.collection, entryId: entry?.id },
  )
}

const publishedTranslations = (entry) =>
  (entry?.translations || []).filter(
    (translation) => translation?.status === 'published' && translation.route?.path,
  )

const emptyBody = () => ({ type: 'root', props: {}, children: [] })

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

const looksLikeAssetId = (value) => {
  if (typeof value !== 'string') return false
  if (/^[a-z0-9]{20,40}$/i.test(value)) return true
  return (
    /^[a-z0-9]+;[a-z_]+$/i.test(value) && (value.endsWith(';assets') || value.endsWith(';_storage'))
  )
}

const collectAssetIds = (value, out = new Set()) => {
  if (typeof value === 'string') {
    if (looksLikeAssetId(value)) out.add(value)
  } else if (Array.isArray(value)) {
    for (const child of value) collectAssetIds(child, out)
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectAssetIds(child, out)
  }
  return out
}

const replaceAssetIds = (value, urls) => {
  if (typeof value === 'string') return urls.get(value) || value
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((child) => replaceAssetIds(child, urls))
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, replaceAssetIds(child, urls)]),
  )
}

const resolvePublicAssetIds = async (event, values = []) => {
  const assetIds = [...new Set(values.flatMap((value) => [...collectAssetIds(value)]))]
  if (assetIds.length === 0) return new Map()
  const entries = await Promise.all(
    assetIds.map(async (assetId) => [
      assetId,
      await callGinkoAsset(event, 'getAssetUrl', { assetId }),
    ]),
  )
  return new Map(entries.filter(([, url]) => typeof url === 'string' && url.length > 0))
}

const variantEntriesFor = (entry, locale, route) =>
  [{ locale, route }, ...publishedTranslations(entry)]
    .filter((variant) => variant.locale && variant.route?.path)
    .filter(
      (variant, index, list) => list.findIndex((item) => item.locale === variant.locale) === index,
    )

export const toContentEntry = async (
  event,
  entry,
  requestedLocale = defaultLocale(),
  options = {},
) => {
  const data = entry?.data && typeof entry.data === 'object' ? entry.data : {}
  const assetUrls = await resolvePublicAssetIds(event, [data, entry?.bodyAst, data.bodyAst])
  const publicData = replaceAssetIds(data, assetUrls)
  const hasMarkdownBody = hasStoredParsedBody(entry, data) || hasLegacyMarkdownBody(entry, data)
  const route = entry?.route || {}
  const locale =
    entry?.locale?.resolved || entry?.locale?.requested || route.locale || requestedLocale
  const path = route.path || data.path || '/'
  const entryKey = publicEntryKey(entry)

  return normalizeProviderDocument({
    ...publicData,
    id: entry.id,
    collection: entry.collection,
    type: hasMarkdownBody ? 'markdown' : 'yaml',
    contentPath: path,
    locale,
    canonicalKey: `${entry.collection}:${entryKey}`,
    routeVariants: variantEntriesFor(entry, locale, route).map((variant) => ({
      locale: variant.locale,
      contentPath: variant.route.path,
    })),
    ref: entry.ref || entryKey,
    title: entry.title,
    description: publicData.description || publicData.excerpt || '',
    body: replaceAssetIds(
      parsedBodyFromData(entry, data, {
        required: options.includeBody !== false && hasMarkdownBody,
      }),
      assetUrls,
    ),
    stableId: entryKey,
    updatedAt: entry.updatedAt || entry.publishedAt,
  })
}

export const routeFactFor = (entry) => ({
  collection: entry.collection,
  canonicalKey: `${entry.collection}:${publicEntryKey(entry)}`,
  locale:
    entry.locale?.resolved || entry.locale?.requested || entry.route?.locale || defaultLocale(),
  contentPath: entry.route?.path || '/',
})
