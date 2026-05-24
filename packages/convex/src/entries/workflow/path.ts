import type { Doc } from '../../_generated/dataModel.js'
import { generateCanonicalKey } from '../../lib/cmsContract/index.js'

type WorkflowCollection = Pick<Doc<'collections'>, 'routing'> & {
  settings?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeRoutePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

function normalizePathPrefix(pathPrefix: string): string {
  const normalized = normalizeRoutePath(pathPrefix)
  return normalized === '/' ? '' : normalized
}

export function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function settingRecord(collection: WorkflowCollection | null | undefined) {
  return isRecord(collection?.settings) ? collection.settings : {}
}

function localizedString(
  settings: Record<string, unknown>,
  currentKey: string,
  locale?: string | null,
) {
  const values = isRecord(settings[currentKey]) ? settings[currentKey] : null
  const value = locale ? values?.[locale] : null
  return typeof value === 'string' && value.trim() ? value : null
}

export function pathPrefixForLocale(
  collection: WorkflowCollection | null | undefined,
  locale?: string | null,
): string {
  const settings = settingRecord(collection)
  const localized = localizedString(settings, 'localizedPathPrefixes', locale)
  return normalizePathPrefix(localized ?? collection?.routing?.pathPrefix ?? '')
}

function singletonPathForLocale(
  collection: WorkflowCollection | null | undefined,
  locale?: string | null,
): string | null {
  if (!collection?.routing?.singleton) return null

  const settings = settingRecord(collection)
  const localized = localizedString(settings, 'localizedSingletonPaths', locale)
  const fallback = settings.singletonPath
  const path = localized ?? (typeof fallback === 'string' && fallback.trim() ? fallback : null)

  return path ? normalizeRoutePath(path) : null
}

function needsStableId(collection: WorkflowCollection | null | undefined): boolean {
  const slugMode = collection?.routing?.slugMode ?? 'shared'
  return slugMode === 'stable' || slugMode === 'localizedStable'
}

function rootSlugForLocale(
  collection: WorkflowCollection | null | undefined,
  locale?: string | null,
): string | null {
  const settings = settingRecord(collection)
  const localized = localizedString(settings, 'localizedRootSlugs', locale)
  if (localized) return localized
  return collection?.routing?.rootSlug ?? null
}

export function entrySnapshotPath(
  collection: WorkflowCollection | null | undefined,
  args: {
    slug: string
    stableId?: string | null
    ancestorSlugs?: string[]
  },
): string {
  const segments = [...(args.ancestorSlugs ?? [])]
  const leafSlug = needsStableId(collection)
    ? args.stableId
      ? `${args.slug}-${args.stableId}`
      : args.slug
    : args.slug
  segments.push(leafSlug)
  const path = generateCanonicalKey(segments.flatMap(pathSegments))
  return path.startsWith('/') ? path : `/${path}`
}

export function publicPathForLocaleSnapshot(
  collection: WorkflowCollection | null | undefined,
  localePath: string,
  locale?: string | null,
): string {
  const singletonPath = singletonPathForLocale(collection, locale)
  if (singletonPath) return singletonPath

  const pathPrefix = pathPrefixForLocale(collection, locale)
  const rootSlug = rootSlugForLocale(collection, locale)
  if (rootSlug) {
    const rootPath = generateCanonicalKey(pathSegments(rootSlug))
    const localeRootPath = generateCanonicalKey(pathSegments(localePath))
    if (rootPath === localeRootPath) {
      return pathPrefix || '/'
    }
  }

  const pathFull = generateCanonicalKey([...pathSegments(pathPrefix), ...pathSegments(localePath)])
  return pathFull.startsWith('/') ? pathFull : `/${pathFull}`
}

export function localeSnapshotPathFromPublicPath(
  collection: WorkflowCollection | null | undefined,
  publicPath: string,
  locale?: string | null,
): string {
  const pathPrefix = pathPrefixForLocale(collection, locale)
  const prefixSegments = pathSegments(pathPrefix)
  const publicSegments = pathSegments(publicPath)
  const localeSegments =
    prefixSegments.length > 0 &&
    prefixSegments.every((segment, index) => publicSegments[index] === segment)
      ? publicSegments.slice(prefixSegments.length)
      : publicSegments
  if (!localeSegments.length) {
    const rootSlug = rootSlugForLocale(collection, locale)
    if (rootSlug) {
      const rootPath = generateCanonicalKey(pathSegments(rootSlug))
      return rootPath.startsWith('/') ? rootPath : `/${rootPath}`
    }
  }
  const path = generateCanonicalKey(localeSegments)
  return path.startsWith('/') ? path : `/${path}`
}
