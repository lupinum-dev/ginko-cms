import { v } from 'convex/values'
import type { Validator } from 'convex/values'

import { jsonObjectValidator, jsonValueValidator, publicBodyAstValidator } from './foundation.js'

export const ginkoRouteValidator = v.object({
  slug: v.string(),
  path: v.string(),
  locale: v.string(),
  source: v.literal('published'),
  href: v.optional(v.string()),
})

export const ginkoLocaleResolutionValidator = v.object({
  requested: v.string(),
  resolved: v.string(),
  policy: v.union(v.literal('strict'), v.literal('transparent')),
  fallbacks: v.object({
    fields: v.array(v.object({ path: v.string(), from: v.string() })),
  }),
})

export const ginkoPublicAssetFactValidator = v.object({
  fieldPath: v.string(),
  assetId: v.string(),
  url: v.string(),
  expiresAt: v.union(v.number(), v.null()),
  mediaType: v.union(
    v.literal('image/png'),
    v.literal('image/jpeg'),
    v.literal('image/gif'),
    v.literal('image/webp'),
  ),
  bytes: v.number(),
  sha256: v.string(),
})

export const ginkoPublicEntryValidator = v.object({
  id: v.string(),
  collection: v.string(),
  route: ginkoRouteValidator,
  translations: v.array(
    v.object({
      locale: v.string(),
      route: ginkoRouteValidator,
      status: v.union(v.literal('published'), v.literal('missing')),
    }),
  ),
  locale: ginkoLocaleResolutionValidator,
  title: v.string(),
  data: v.record(v.string(), jsonValueValidator),
  bodyAst: v.optional(publicBodyAstValidator),
  toc: v.optional(jsonValueValidator),
  publishedAt: v.string(),
  updatedAt: v.string(),
  revision: v.string(),
  stableId: v.string(),
  assetFacts: v.array(ginkoPublicAssetFactValidator),
})

export const ginkoBreadcrumbValidator = v.object({
  title: v.string(),
  route: ginkoRouteValidator,
  routable: v.boolean(),
})

export const ginkoPublicNavigationEntryValidator = v.object({
  id: v.string(),
  collection: v.string(),
  route: ginkoRouteValidator,
  translations: v.array(
    v.object({
      locale: v.string(),
      route: ginkoRouteValidator,
      status: v.union(v.literal('published'), v.literal('missing')),
    }),
  ),
  locale: ginkoLocaleResolutionValidator,
  title: v.string(),
  data: v.record(v.string(), jsonValueValidator),
  publishedAt: v.string(),
  updatedAt: v.string(),
  revision: v.string(),
  stableId: v.string(),
  assetFacts: v.array(ginkoPublicAssetFactValidator),
})

function createGinkoNavNodeValidator(depth: number): Validator<unknown, 'required', string> {
  return v.object({
    entry: ginkoPublicNavigationEntryValidator,
    children:
      depth > 0 ? v.array(createGinkoNavNodeValidator(depth - 1)) : v.array(jsonObjectValidator),
  }) as Validator<unknown, 'required', string>
}

export const ginkoNavNodeValidator = createGinkoNavNodeValidator(12)

export const ginkoPageResultValidator = v.union(
  v.object({
    status: v.literal('found'),
    page: ginkoPublicEntryValidator,
    collection: v.string(),
    locale: ginkoLocaleResolutionValidator,
    breadcrumbs: v.array(ginkoBreadcrumbValidator),
    seo: v.object({
      title: v.string(),
      description: v.string(),
      canonical: v.string(),
      alternates: v.array(
        v.object({
          locale: v.string(),
          hreflang: v.string(),
          route: ginkoRouteValidator,
        }),
      ),
      xDefault: v.union(ginkoRouteValidator, v.null()),
    }),
  }),
  v.object({
    status: v.literal('redirect'),
    page: v.null(),
    collection: v.string(),
    locale: ginkoLocaleResolutionValidator,
    breadcrumbs: v.array(ginkoBreadcrumbValidator),
    seo: v.null(),
    redirectTo: ginkoRouteValidator,
    redirectedFrom: v.string(),
  }),
  v.object({
    status: v.literal('not-found'),
    page: v.null(),
    collection: v.string(),
    locale: ginkoLocaleResolutionValidator,
    breadcrumbs: v.array(ginkoBreadcrumbValidator),
    seo: v.null(),
  }),
)

export const ginkoPageInfoValidator = v.object({
  hasNextPage: v.boolean(),
  endCursor: v.union(v.string(), v.null()),
})

export const ginkoRoutesResultValidator = v.object({
  routes: v.array(
    v.object({
      collection: v.string(),
      stableId: v.string(),
      locale: v.string(),
      path: v.string(),
      sitemapIncluded: v.boolean(),
      lastmod: v.string(),
    }),
  ),
  pageInfo: ginkoPageInfoValidator,
  snapshot: v.string(),
})

export const ginkoListResultValidator = v.object({
  entries: v.array(ginkoPublicEntryValidator),
  pageInfo: ginkoPageInfoValidator,
  collection: v.string(),
  locale: ginkoLocaleResolutionValidator,
})

export const ginkoNavResultValidator = v.object({
  tree: v.array(ginkoNavNodeValidator),
  collection: v.string(),
  locale: ginkoLocaleResolutionValidator,
})

export const ginkoSurroundResultValidator = v.object({
  previous: v.array(ginkoPublicEntryValidator),
  next: v.array(ginkoPublicEntryValidator),
  collection: v.string(),
  locale: ginkoLocaleResolutionValidator,
})

export const ginkoSearchResultValidator = v.object({
  results: v.array(ginkoPublicEntryValidator),
  pageInfo: ginkoPageInfoValidator,
  locale: ginkoLocaleResolutionValidator,
})

export const ginkoSitemapResultValidator = v.object({
  urls: v.array(
    v.object({
      collection: v.string(),
      id: v.string(),
      route: ginkoRouteValidator,
      alternates: v.array(
        v.object({
          locale: v.string(),
          hreflang: v.string(),
          route: ginkoRouteValidator,
        }),
      ),
      xDefault: v.union(ginkoRouteValidator, v.null()),
      lastmod: v.string(),
    }),
  ),
  pageInfo: ginkoPageInfoValidator,
})

export const ginkoSingletonResultValidator = v.object({
  name: v.string(),
  singleton: v.union(ginkoPublicEntryValidator, v.null()),
  locale: ginkoLocaleResolutionValidator,
  failure: v.union(
    v.literal('missing_locale'),
    v.literal('unknown_collection'),
    v.literal('not_singleton'),
    v.literal('mode_mismatch'),
    v.literal('no_published_entry'),
    v.null(),
  ),
})

export const ginkoSiteDataResultValidator = v.object({
  key: v.string(),
  data: v.union(jsonValueValidator, v.null()),
  locale: ginkoLocaleResolutionValidator,
})
