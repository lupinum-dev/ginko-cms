# Public Content API

This reference describes the production public content surface for Ginko CMS.
Older experimental knobs such as `include`, `depth`, `fields.omit`,
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
const { page, previous, next } = await useContentPage(docs, {
  surround: { fields: ['description'] },
})

const { data: posts } = await useContentMany(blog, {
  sort: { lastPublishedAt: 'desc' },
})

const { data: navTree } = await useContentTree(docs)
```

CMS-backed search is provider-backed. Configure the CMS search engine and use
Ginko Content search-result helpers instead of static section-data helpers:

```ts
export default defineNuxtConfig({
  content: {
    search: {
      engine: 'cms',
      collections: ['docs'],
    },
  },
})
```

```ts
const { results, pending, error } = await useContentSearchResults(query, {
  locale,
})
```

## Route Capability

Collections have an explicit public mode:

- `route`: participates in `page`, `nav`, `surround`, `sitemap`, route
  diagnostics, SEO, and public visibility checks.
- `none`: data-only; published rows are usable through `list` and relations,
  but route-only public methods reject the collection.

Route-backed capability is enforced at runtime. Generated types constrain the
currently generated page and nav inputs when the generated contract is
available.

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

The HTTP facade validates input before calling Convex:

- `collection`, `name`, and `key` are at most 80 characters.
- `locale` is at most 32 characters.
- `query` is at most 256 characters.
- other string query values are at most 512 characters.
- numeric query values must be integers.

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
  | {
      status: 'found'
      page: Entry
      collection: string
      locale: GinkoLocaleResolution
      breadcrumbs: Array<{ title: string; route: GinkoRoute; routable: boolean }>
      seo: SeoResult
    }
  | {
      status: 'redirect'
      page: null
      collection: string
      locale: GinkoLocaleResolution
      breadcrumbs: []
      seo: null
      redirectTo: GinkoRoute
      redirectedFrom: string
    }
  | {
      status: 'not-found'
      page: null
      collection: string
      locale: GinkoLocaleResolution
      breadcrumbs: []
      seo: null
    }
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

Public limits and failure behavior:

- `list`: default `20`, maximum `100`.
- `search`: default `10`, maximum `50`; each request scans at most `500` rows.
- `sitemap`: default `500`, maximum `1000`.
- `nav`: scans at most `1000` rows before returning `PUBLIC_NAV_TOO_LARGE`.
- `surround`: `previous` and `next` default to `1` and max out at `10`.

Public list sorting supports `orderKey`, `entryCreatedAt`, `firstPublishedAt`,
and `lastPublishedAt` with `:asc` or `:desc`. Path-prefix list queries use path
index order and cannot be combined with explicit sort.

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

`surround()` returns semantic previous and next arrays. It is not a positional
tuple:

```ts
{
  previous: [],
  next: [],
}
```

The caller may request more than one previous or next item.

### Singleton

`singleton()` returns one published entry for a collection configured with
`routing.singleton: true`:

```ts
{
  name: string,
  singleton: Entry | null,
  locale: GinkoLocaleResolution,
  failure:
    | null
    | 'missing_locale'
    | 'unknown_collection'
    | 'not_singleton'
    | 'mode_mismatch'
    | 'no_published_entry',
}
```

A missing or unpublished singleton returns `singleton: null` with a `failure`
value instead of throwing.

### Site Data

`siteData()` returns public site data blocks:

```ts
{
  key: string,
  data: unknown | null,
  locale: GinkoLocaleResolution,
}
```

Missing, private, or locale-missing blocks return `data: null`. Localized blocks
walk the configured locale fallback chain and report fallback fields in the
locale metadata.

### Sitemap And SEO

Sitemap entries include canonical route data, alternates, `xDefault`, and
`lastmod`. SEO alternates only include published route variants.

Nuxt integrates this through the Ginko Content provider sitemap source. The CMS
module only supplies published data; route lists should not be hardcoded in app
config.

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

## Related Pages

- [Nuxt content provider](./nuxt-content-provider.md)
- [Content model](./content-model.md)
- [Relations](../concepts/relations.md)
