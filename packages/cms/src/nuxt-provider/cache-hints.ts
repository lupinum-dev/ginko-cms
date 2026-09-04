import { contentTags, uniqueContentTags } from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import type { CmsPublicEntryWire } from '@lupinum/ginko-content/cms-contract'
import {
  createContentDataSourceCacheHint,
  type ContentDataSourceCacheHint,
  type ContentDataSourceResult,
} from '@lupinum/ginko-content/data-source'

import { defaultLocale, normalizeContentPath, publicEntryKey } from './content-shaping.js'

const createCacheHint = (input: {
  tags?: Array<string | null>
  paths?: string[]
  lastModified?: string | number
}): ContentDataSourceCacheHint =>
  createContentDataSourceCacheHint({
    tags: uniqueContentTags(input.tags || []),
    paths: uniqueContentTags((input.paths || []).map(normalizeContentPath)),
    lastModified: input.lastModified === undefined ? null : new Date(input.lastModified).valueOf(),
  })

export const cacheHintForEntry = (
  entry: CmsPublicEntryWire,
  content: Record<string, unknown>,
): ContentDataSourceCacheHint => {
  const locale = entry.locale.resolved || entry.locale.requested || defaultLocale()
  const routePath =
    typeof content.unprefixedPath === 'string'
      ? content.unprefixedPath
      : typeof content.path === 'string'
        ? content.path
        : entry.route.path
  const updatedAt = entry.updatedAt || content.updatedAt
  return createCacheHint({
    tags: [
      contentTags.collection(entry.collection),
      contentTags.entry(entry.collection, publicEntryKey(entry)),
      contentTags.entry(entry.collection, publicEntryKey(entry), locale),
      contentTags.route(routePath),
    ],
    paths: [routePath],
    ...(typeof updatedAt === 'string' || typeof updatedAt === 'number'
      ? { lastModified: updatedAt }
      : {}),
  })
}

export const collectionCacheHint = (collection: string): ContentDataSourceCacheHint =>
  createCacheHint({ tags: [contentTags.collection(collection)] })

export const navigationCacheHint = (
  collection: string,
  locale: string,
): ContentDataSourceCacheHint =>
  createCacheHint({
    tags: [contentTags.collection(collection), contentTags.nav(collection, locale)],
  })

export const searchCacheHint = (locale: string): ContentDataSourceCacheHint =>
  createCacheHint({ tags: [contentTags.search(locale)] })

export const siteDataCacheHint = (key: string, locale?: string): ContentDataSourceCacheHint =>
  createCacheHint({
    tags: [contentTags.siteData(key), locale ? contentTags.siteData(key, locale) : null],
  })

export const sitemapCacheHint = (): ContentDataSourceCacheHint =>
  createCacheHint({ tags: [contentTags.sitemap()] })

export const sourceResult = <T>(
  data: T,
  cache: ContentDataSourceCacheHint | false,
): ContentDataSourceResult<T> => ({ data, cache })
