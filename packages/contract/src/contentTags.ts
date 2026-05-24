export type ContentTagInput = string | number | null | undefined

const normalizeSegment = (value: ContentTagInput): string => {
  const segment = String(value ?? '').trim()
  if (!segment) {
    throw new Error('Content cache tag segments must be non-empty.')
  }
  return segment.replace(/[:\s]+/g, '-')
}

export const normalizeContentPath = (path: ContentTagInput): string => {
  const value = String(path ?? '').trim()
  if (!value || value === '/') return '/'
  return `/${value.replace(/^\/+/, '')}`
}

export const uniqueContentTags = (tags: Array<ContentTagInput>): string[] => [
  ...new Set(tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)),
]

export const contentTags = {
  entry(collection: ContentTagInput, id: ContentTagInput, locale?: ContentTagInput): string {
    const base = `entry:${normalizeSegment(collection)}:${normalizeSegment(id)}`
    return locale ? `${base}:${normalizeSegment(locale)}` : base
  },

  collection(collection: ContentTagInput): string {
    return `collection:${normalizeSegment(collection)}`
  },

  route(path: ContentTagInput): string {
    return `route:${normalizeContentPath(path)}`
  },

  nav(collection: ContentTagInput, locale: ContentTagInput): string {
    return `nav:${normalizeSegment(collection)}:${normalizeSegment(locale)}`
  },

  search(locale: ContentTagInput): string {
    return `search:${normalizeSegment(locale)}`
  },

  sitemap(): string {
    return 'sitemap'
  },

  siteData(key: ContentTagInput, locale?: ContentTagInput): string {
    const base = `site-data:${normalizeSegment(key)}`
    return locale ? `${base}:${normalizeSegment(locale)}` : base
  },

  asset(id: ContentTagInput): string {
    return `asset:${normalizeSegment(id)}`
  },
}
