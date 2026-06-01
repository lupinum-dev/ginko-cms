# Public Content And Provider

Use this reference when wiring Nuxt reads, documenting public content behavior,
debugging provider errors, or changing public query code. Canonical docs:

- `docs/reference/nuxt-content-provider.md`
- `docs/reference/public-content-api.md`
- `docs/concepts/cache-invalidation.md`
- `docs/concepts/tailwind-v4-integration.md`
- `docs/guides/theming-the-studio.md`

## Contents

- [Provider Setup](#provider-setup)
- [Public Auth Boundary](#public-auth-boundary)
- [Provider Behavior](#provider-behavior)
- [Public Query Shape](#public-query-shape)
- [Current Public Limits](#current-public-limits)
- [Route-Backed Vs Data-Only](#route-backed-vs-data-only)
- [Cache And Revalidation](#cache-and-revalidation)
- [Studio Styling](#studio-styling)

## Provider Setup

Configure Ginko Content to use the CMS provider:

```ts
export default defineContentConfig({
  provider: 'cms',
  collections: {
    // Keep typed collection definitions here.
  },
})
```

Required:

```bash
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

`CONVEX_URL` can be a server-side fallback. Missing URL config fails with
`provider_config_missing`; there is no silent filesystem fallback.

`GINKO_CONTENT_PROVIDER_SITE` is reserved. The provider reads it and defaults to
`default`, but current public Convex queries are not partitioned by site.

## Public Auth Boundary

The Nuxt provider is for published website reads. It calls the installed
`ginkoCms/public:` Convex bridge and does not use Studio, member, MCP, or
Better Auth state. It cannot read drafts, preview unpublished changes, inspect
collection admin state, or publish content.

Use Studio, generated editor bridges, CLI commands, or MCP for authenticated
editing and diagnostics. Do not add auth bypasses or draft switches to the
provider path.

## Provider Behavior

- Reads published public Convex projections.
- Does not read draft/editor tables.
- Supports `page`, `query`, `navigation`, `navigationQuery`, `surroundings`,
  `search`, `siteData`, `routeMeta`, and `sitemapEntries`.
- Keeps Ginko CMS neutral: Nuxt uses content-engine APIs while the provider
  calls the installed Convex public bridge.
- Fails unsupported query operators with `unsupported_query_operator`.

## Public Query Shape

Provider `query` is intentionally limited to public list reads. Supported
`where` clauses are:

- `_draft: false` or `_draft: { $ne: true }`
- `_partial: false` or `_partial: { $ne: true }`
- `_locale: '<locale>'`
- `_path: { $prefix: '/prefix' }`
- `path: { $prefix: '/prefix' }`

Supported operators are `$eq`, `$ne`, `$in`, `$contains`, `$icontains`,
`$prefix`, `$and`, and `$or`, but field-level filtering is still restricted to
the public visibility predicates above. Other fields fail with
`unsupported_query_shape`; unsupported operators fail with
`unsupported_query_operator`.

Provider sort accepts `orderKey`, `entryCreatedAt`, `firstPublishedAt`, and
`lastPublishedAt` with `asc`, `desc`, `1`, or `-1`. `_stem` sort hints are
ignored because they are filesystem ordering hints. Path-prefix list queries use
path-index order and reject explicit public sort.

Cursor pagination is supported. Positive numeric `skip`, `count`, and `without`
projections are rejected. Use explicit select projections when the content
engine passes `only`.

## Current Public Limits

- Public list default limit: 20. Max: 100.
- Public search default limit: 10. Max: 50. Scan cap: 500 rows.
- Sitemap default limit: 500. Max: 1000.
- Navigation reads cap at 1000 rows and can fail with `PUBLIC_NAV_TOO_LARGE`.
- Surround default is 1 sibling on each side. Max: 10.

Public list sort supports only:

- `orderKey`
- `entryCreatedAt`
- `firstPublishedAt`
- `lastPublishedAt`

Do not document `path` as an explicit public sort. Path-index order is internal
to `pathPrefix` list queries.

## Route-Backed Vs Data-Only

- `query` / public list reads support route-backed and data-only collections.
- Page, navigation, surroundings, search, and sitemap reads are route-backed
  surfaces.
- Data-only collections should not be documented as page or sitemap sources.

## Cache And Revalidation

Public reads produce tags for collection, entry, route, nav, search, sitemap,
and site-data surfaces. Revalidation target tokens are configured per target by
stored `secretEnv` names. Do not invent a fixed global revalidation token env
var.

Local revalidation targets require:

```bash
GINKO_CMS_ALLOW_LOCAL_REVALIDATION=1
```

Remote revalidation targets require an allowlist:

```bash
GINKO_CMS_REVALIDATION_ALLOWED_HOSTS=www.example.com
```

## Studio Styling

Studio is isolated from host app styling. Do not claim host `--sidebar-*`
variables automatically drive Studio. Use `--ginko-cms-sidebar-*` and
`--ginko-cms-dark-sidebar-*`, or explicitly map host tokens in the host app.
