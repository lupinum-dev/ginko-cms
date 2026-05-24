# Public Content API

This document describes the production public content surface for
Ginko CMS. Older experimental knobs such as `include`, `depth`, `fields.omit`,
`collection()`, public schema/admin reads, and public stable-id resolution are
intentionally not part of the runtime API.

## Product Shape

Ginko public reads are website-shaped, not database-shaped:

- `page`
- `list`
- `nav`
- `surround`
- `search`
- `sitemap`
- `singleton`
- `siteData`

The public runtime API serves published content only. Studio, preview,
diagnostics, schema inspection, route validation, MCP operations, and build/admin
tools are separate authenticated surfaces.

## Nuxt Website API

Nuxt website pages should read content through the provider-neutral Ginko content
engine APIs from `@lupinum/ginko-content`. ginko-cms supplies the provider;
application page code should stay the same whether the active provider is
filesystem or CMS.

```ts
const page = await one(docs, { by: { route: route.path } })
const posts = await many(blog, { sort: { publishedAt: 'desc' } })
const navTree = await tree(docs)
```

## Route Capability

Collections have an explicit public mode:

- `route`: participates in `page`, `nav`, `surround`, `sitemap`, route
  diagnostics, SEO, and public visibility checks.
- `none`: data-only; published rows are usable through `list` and relations,
  but route-only public methods reject the collection.

Route-backed capability is enforced at runtime and exposed in generated types so
route-only methods reject data-only collections at type level when the generated
contract is available.

## Provider Shape

The CMS provider exposes the same website-shaped primitives to the content
engine:

```ts
page
list / query
nav
surround
search
sitemap
```

`list` is collection-scoped and supports both route-backed and data-only
collections. `page`, `nav`, `surround`, `search`, and `sitemap` are
route-backed surfaces; they reject data-only collections instead of returning
silent empty results.

Public runtime reads do not expose schema/admin methods. Build/admin tooling owns
schema inspection, route diagnostics, publish-impact preview, and generated type
drift checks.

## HTTP Facade

External consumers can opt into a Nitro HTTP facade over the same Convex public
queries:

```ts
export default defineNuxtConfig({
  ginkoCms: {
    publicContent: {
      api: true,
      sitemap: true,
    },
  },
})
```

`api: true` registers these published-read endpoints under `/api/ginko/v1`:

- `/api/ginko/v1/page?collection=docs&locale=de&path=/doku/start`
- `/api/ginko/v1/list?collection=blog&locale=en&limit=20`
- `/api/ginko/v1/nav?collection=docs&locale=de`
- `/api/ginko/v1/surround?collection=blog&locale=en&path=/blog/hello`
- `/api/ginko/v1/search?query=api&locale=en&collection=docs`
- `/api/ginko/v1/sitemap?locale=de&collection=docs`
- `/api/ginko/v1/singleton?name=siteSettings&locale=en`
- `/api/ginko/v1/site-data?key=banner&locale=de`

Route metadata is a provider/bridge operation for Nuxt content rendering, not an
HTTP facade endpoint. The HTTP facade intentionally exposes page and list-style
published reads only; route metadata stays inside the content provider contract
unless a separate external consumer need proves otherwise.

Use a custom route when needed:

```ts
publicContent: {
  api: { route: '/content-api' },
}
```

The HTTP facade is a transport only. It does not introduce a second data model,
projection language, or admin surface.

## Result Contracts

### Page

`page()` returns a discriminated result:

```ts
type PageResult<Entry> =
  | { status: 'found'; page: Entry; seo: SeoResult; redirectTo: null }
  | { status: 'redirect'; page: null; seo: null; redirectTo: GinkoRoute }
  | { status: 'not-found'; page: null; seo: null; redirectTo: null }
```

The provider-neutral Nuxt page helper handles redirects and not-found states.

### List And Search

`list()` and `search()` are paginated:

```ts
{
  entries: [],
  pageInfo: {
    hasNextPage: boolean,
    endCursor: string | null,
  },
}
```

Search returns `results` instead of `entries` and uses the same `pageInfo`
shape. Raw empty search is invalid; callers should avoid submitting empty
queries.

### Nav

`nav()` returns a recursive tree:

```ts
{
  tree: [
    {
      entry,
      children: [],
    },
  ],
}
```

Fallback-only and unroutable locale rows are excluded.

### Surround

`surround()` returns arrays:

```ts
{
  previous: [],
  next: [],
}
```

The caller may request more than one previous or next item.

### Sitemap And SEO

Sitemap entries include canonical route data, alternates, `xDefault`, `lastmod`,
and cache tags where available. SEO alternates only include routable/indexable
locales.

Nuxt integrates this through the CMS sitemap source and prerender route
generation; route lists should not be hardcoded in app config.

## i18n Rules

Route fallback and field fallback are different concepts.

- Route-backed content is strict: a locale route exists only when that locale is
  published and routable.
- `list`, `nav`, `surround`, `search`, and `sitemap` exclude fallback-only
  routes.
- Route-backed public reads do not silently render another locale's required
  fields.
- Data-only localized reads may use transparent fallback, but returned locale
  metadata must report fallback fields.

Every public entry carries locale metadata and translation summaries so language
switchers and SEO can reason about published, missing, and non-routable locales.

## Relation Policy

Public reads return stable IDs for relation fields. Runtime relation expansion is
not part of v1. If payload shape needs to change, it should be handled through
schema-owned public profiles and generated types, not caller-provided projection
knobs.

## Diagnostics Boundary

Public runtime clients do not expose diagnostics. Studio, MCP, admin/build tools,
and CI use the diagnostics layer for:

- route vs route collisions
- route vs redirect collisions
- rendered href collisions after locale prefixing
- missing localized routes
- missing translated parents
- missing required localized fields
- sitemap/search/nav exclusion reasons
- publish-impact preview

Diagnostics must include actionable context such as collection, entry id, locale,
path or href, code, severity, and message.

## Verification Baseline

The migrated production surface is covered by:

```bash
pnpm --filter @lupinum/ginko-cms-contract typecheck
pnpm --filter @lupinum/ginko-cms-convex typecheck
pnpm --filter @lupinum/ginko-cms typecheck
pnpm run test:public-content -- --reporter=dot
pnpm -C playground exec ginko-cms bridge check
pnpm -C playground build
pnpm run format:check
git diff --check
```
