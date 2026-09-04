import type { CmsPublicEntryWire } from '@lupinum/ginko-content/cms-contract'
import { createContentDataSourceError } from '@lupinum/ginko-content/data-source'
import type { ProviderDocumentInput } from '@lupinum/ginko-content/provider'

type ContentRuntime = {
  defaultLocale?: string
  i18n?: { defaultLocale?: string }
}

type ParsedBodyOptions = { required?: boolean }

export const defaultLocale = (runtime: ContentRuntime = {}): string =>
  runtime?.defaultLocale ||
  runtime?.i18n?.defaultLocale ||
  process.env.GINKO_CONTENT_DEFAULT_LOCALE ||
  process.env.NUXT_PUBLIC_GINKO_CONTENT_DEFAULT_LOCALE ||
  'en'

export const normalizeContentPath = (path: unknown): string => {
  const value = String(path ?? '').trim()
  if (!value || value === '/') return '/'
  const pathWithoutSlashes = value.replace(/^\/+|\/+$/g, '')
  return pathWithoutSlashes ? `/${pathWithoutSlashes}` : '/'
}

export const routePathname = (path = '/'): string => {
  const raw = String(path || '/')
  try {
    return normalizeContentPath(new URL(raw, 'https://ginko.local').pathname)
  } catch {
    return normalizeContentPath(raw.split(/[?#]/)[0] || '/')
  }
}

export const canonicalFromRoute = (path = '/', locale = defaultLocale()): string => {
  const normalized = routePathname(path)
  if (locale && normalized === `/${locale}`) return '/'
  if (locale && normalized.startsWith(`/${locale}/`)) {
    return normalized.slice(locale.length + 1) || '/'
  }
  return normalized
}

export const publicEntryKey = (entry: CmsPublicEntryWire): string => {
  if (typeof entry?.stableId === 'string' && entry.stableId.length > 0) return entry.stableId
  throw createContentDataSourceError('BACKEND_FAILURE')
}

const publishedTranslations = (entry: CmsPublicEntryWire) =>
  (entry?.translations || []).filter(
    (translation) => translation?.status === 'published' && translation.route?.path,
  )

const emptyBody = () => ({ type: 'root', props: {}, children: [] })

const clonePureData = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const applyAssetFacts = (entry: CmsPublicEntryWire) => {
  const data = clonePureData(entry.data)
  const bodyAst = entry.bodyAst === undefined ? undefined : clonePureData(entry.bodyAst)
  const roots: Record<string, unknown> = { data, bodyAst }

  for (const fact of entry.assetFacts) {
    const segments = [...fact.fieldPath.matchAll(/([\w-]+)|\[(\d+)\]/g)].map((match) =>
      match[2] === undefined ? match[1]! : Number(match[2]),
    )
    let current: unknown = roots
    for (let index = 0; index < segments.length - 1; index++) {
      const segment = segments[index]!
      if (!current || typeof current !== 'object') {
        throw createContentDataSourceError('BACKEND_FAILURE')
      }
      current = (current as Record<string | number, unknown>)[segment]
    }
    const terminal = segments.at(-1)!
    if (
      !current ||
      typeof current !== 'object' ||
      (current as Record<string | number, unknown>)[terminal] !== fact.assetId
    ) {
      throw createContentDataSourceError('BACKEND_FAILURE')
    }
    ;(current as Record<string | number, unknown>)[terminal] = fact.url
  }
  return { data, bodyAst }
}

const parsedBodyFromData = (
  entry: CmsPublicEntryWire,
  data: Record<string, unknown>,
  options: ParsedBodyOptions = {},
): object => {
  const value = entry.bodyAst || data.bodyAst
  if (value && typeof value === 'object') return value
  if (options.required === false) return emptyBody()
  throw createContentDataSourceError('BACKEND_FAILURE')
}

const hasStoredParsedBody = (entry: CmsPublicEntryWire, data: Record<string, unknown>): boolean =>
  Boolean(
    (entry.bodyAst && typeof entry.bodyAst === 'object') ||
    (data.bodyAst && typeof data.bodyAst === 'object'),
  )

const variantEntriesFor = (
  entry: CmsPublicEntryWire,
  locale: string,
  route: CmsPublicEntryWire['route'],
) =>
  [{ locale, route }, ...publishedTranslations(entry)]
    .filter((variant) => variant.locale && variant.route?.path)
    .filter(
      (variant, index, list) => list.findIndex((item) => item.locale === variant.locale) === index,
    )

export const toContentEntry = async (
  entry: CmsPublicEntryWire,
  requestedLocale = defaultLocale(),
): Promise<ProviderDocumentInput> => {
  const resolvedAssets = applyAssetFacts(entry)
  const data = resolvedAssets.data
  const publicData = data
  const entryWithResolvedBody = { ...entry, bodyAst: resolvedAssets.bodyAst }
  const hasMarkdownBody = hasStoredParsedBody(entryWithResolvedBody, data)
  const route = entry.route
  const locale =
    entry?.locale?.resolved || entry?.locale?.requested || route.locale || requestedLocale
  const path = route.path
  const entryKey = publicEntryKey(entry)

  return {
    ...publicData,
    id: entry.id,
    collection: entry.collection,
    type: hasMarkdownBody ? 'markdown' : 'yaml',
    contentPath: path,
    locale,
    canonicalKey: entryKey,
    routeVariants: variantEntriesFor(entry, locale, route).map((variant) => ({
      locale: variant.locale,
      contentPath: variant.route.path,
    })),
    ref: entryKey,
    title: entry.title,
    description:
      typeof publicData.description === 'string'
        ? publicData.description
        : typeof publicData.excerpt === 'string'
          ? publicData.excerpt
          : '',
    body: parsedBodyFromData(entryWithResolvedBody, data, {
      required: hasMarkdownBody,
    }) as ProviderDocumentInput['body'],
    stableId: entryKey,
    updatedAt: entry.updatedAt || entry.publishedAt,
  }
}

export const routeFactFor = (entry: CmsPublicEntryWire) => ({
  collection: entry.collection,
  canonicalKey: publicEntryKey(entry),
  locale:
    entry.locale?.resolved || entry.locale?.requested || entry.route?.locale || defaultLocale(),
  contentPath: entry.route?.path || '/',
})
