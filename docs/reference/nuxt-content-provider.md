# Ginko Nuxt Content Provider

`@lupinum/ginko-cms/nuxt-provider` is the production-facing provider module for
Nuxt content-engine integration. It keeps Ginko CMS neutral: Nuxt applications
continue to call the content engine APIs, while this provider reads published
content through the installed Ginko CMS Convex component.

## Configure

```ts
export default defineContentConfig({
  provider: 'cms',
  collections: {
    // Keep collection names and schemas here so app code remains typed.
  },
})
```

`@lupinum/ginko-cms` registers the `cms` provider implementation with
`@lupinum/ginko-content`; applications should not wire the provider import
string themselves.

Required environment:

```bash
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

`CONVEX_URL` can be used as the server-side fallback when
`NUXT_PUBLIC_CONVEX_URL` is not set. Missing Convex URL configuration fails with
`provider_config_missing`; the provider does not silently fall back to
filesystem or non-CMS data.

The Convex public function prefix is fixed at `ginkoCms/public:`. If a call does
not pass a locale, the provider uses `en`.

## Behavior

- Provider queries, navigation, surroundings, search, site data, and bounded
  route enumeration read from Ginko public Convex queries.
- The public Convex operation is `surround`; `surroundings` is only the Ginko
  Content provider method name. The provider maps CMS `previous` / `next`
  results into the provider contract.
- `query` receives the Ginko Content 0.3 provider wire (`{ v: 2, collection,
plan }`) and pattern-matches the closed query plan AST. It no longer accepts
  legacy builder-param objects at the provider boundary.
- Public list reads support route-backed and data-only collections.
  Page, navigation, surroundings, search, and sitemap reads are route-backed
  surfaces and reject data-only collections deliberately.
- Draft/editor tables are not read by the provider.
- Unsupported query operators fail with `unsupported_query_operator`.
- Ginko owns published route, nav, sitemap, and page content. The Nuxt app owns
  presentation adapters and layout.

## Current Limits

- `query` is intentionally limited to public list reads. Supported public plan
  filters are `draft: false`, `partial: false`, `locale`, and `path` prefix
  comparisons.
- Public sort supports `orderKey`, `entryCreatedAt`, `firstPublishedAt`, and
  `lastPublishedAt`.
- Positive numeric `skip`, `count`, and `without` projections are rejected.
- Query results are raw Ginko Content 0.3 provider documents. They expose one
  structural route model through `contentPath`, `canonicalKey`, and
  `routeVariants`; route resolution and locale policy remain owned by the
  content engine.
- `searchSections` is intentionally not exposed by the CMS provider. Host apps
  must use `content.search.engine = 'provider'` with `useContentSearch()` from
  `@lupinum/ginko-content/client` instead of rebuilding a frontend-owned section
  index from public rows.

## Related Pages

- [Public content API](./public-content-api.md)
- [Environment](../getting-started/environment.md)
