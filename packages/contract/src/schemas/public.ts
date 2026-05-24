import { v } from 'convex/values'

import { defineArgs } from '../args.js'

const localeFallbackArg = v.optional(v.union(v.boolean(), v.array(v.string())))

export const list = defineArgs({
  description: 'List published CMS entries with cursor pagination.',
  args: {
    collection: v.string(),
    locale: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    sort: v.optional(v.string()),
    pathPrefix: v.optional(v.string()),
  },
})

export const page = defineArgs({
  description: 'Load a published CMS page with the locked public content contract.',
  args: {
    collection: v.string(),
    locale: v.string(),
    path: v.optional(v.string()),
    ref: v.optional(v.string()),
    fallback: localeFallbackArg,
  },
})

export const routeMeta = defineArgs({
  description: 'Load published CMS route metadata without requiring rendered body content.',
  args: {
    collection: v.string(),
    locale: v.string(),
    path: v.optional(v.string()),
    ref: v.optional(v.string()),
    fallback: localeFallbackArg,
  },
})

export const search = defineArgs({
  description: 'Search published CMS entries.',
  args: {
    query: v.string(),
    locale: v.string(),
    collection: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
})

export const nav = defineArgs({
  description: 'Load the published navigation tree with the locked public content contract.',
  args: {
    collection: v.string(),
    locale: v.string(),
  },
})

export const surround = defineArgs({
  description: 'Load surrounding published pages with previous/next counts.',
  args: {
    collection: v.string(),
    locale: v.string(),
    path: v.string(),
    previous: v.optional(v.number()),
    next: v.optional(v.number()),
  },
})

export const sitemap = defineArgs({
  description: 'Load public sitemap entries.',
  args: {
    collection: v.string(),
    locale: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
})

export const singleton = defineArgs({
  description: 'Load a public singleton entry.',
  args: {
    name: v.string(),
    locale: v.optional(v.string()),
  },
})

export const siteData = defineArgs({
  description: 'Load a public site data block with locale metadata.',
  args: {
    key: v.string(),
    locale: v.optional(v.string()),
  },
})
