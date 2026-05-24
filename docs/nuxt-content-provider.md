# Ginko Nuxt Content Provider

`@lupinum/ginko-cms/nuxt-provider` is the production-facing provider module for
Nuxt content-engine integration. It keeps Ginko CMS neutral: Nuxt applications
continue to call the content engine APIs, while this provider reads published
content through the installed Convex public bridge.

## Configure

```ts
export default defineContentConfig({
  provider: 'ginko',
  providers: {
    ginko: '@lupinum/ginko-cms/nuxt-provider',
  },
  collections: {
    // Keep collection names and schemas here so app code remains typed.
  },
})
```

Required environment:

```bash
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
GINKO_CONTENT_PROVIDER_SITE=your-site-key
```

Missing required environment fails with `provider_config_missing`; the provider
does not silently fall back to filesystem or non-CMS data.

The Convex public function prefix is fixed at `ginkoCms/public:`. Locale
defaults come from the published Ginko CMS collection data, not from provider
environment variables.

## Behavior

- `page`, `query`, `navigation`, `surroundings`, `searchResults`, and
  `sitemapEntries` read from Ginko public Convex queries.
- `routeMeta` is implemented for the Nuxt content provider so route-backed page
  rendering can load localized route metadata without loading rendered body
  content. It is not part of the optional HTTP facade.
- `query`/public list reads support route-backed and data-only collections.
  Page, navigation, surroundings, search, and sitemap reads are route-backed
  surfaces and reject data-only collections deliberately.
- Draft/editor tables are not read by the provider.
- Unsupported query operators fail with `unsupported_query_operator`.
- Ginko owns published route, nav, sitemap, and page content. The Nuxt app owns
  presentation adapters and layout.

## Current Limits

- `query` is intentionally limited to public list reads and simple operator
  validation. Broad filesystem-only query shapes are not made portable by
  pretending they work.
- `searchSections` is intentionally not exposed by the CMS provider. Host apps
  must use the CMS search engine for published search instead of rebuilding a
  frontend-owned section index from public rows.
