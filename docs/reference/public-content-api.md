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
import { navigation, paginate, useContentSearch } from '@lupinum/ginko-content/client'

const { page, previous, next } = await useContentPage(docs, {
  surround: { select: ['description'] },
})

const { data: posts } = await useAsyncData('blog-posts', () =>
  paginate(blog, {
    mode: 'cursor',
    locale: 'en',
  }),
)

const { data: navTree } = await useAsyncData('docs-navigation', () =>
  navigation(docs, { locale: 'en' }),
)
```

CMS-backed search is provider-backed. Configure the CMS search engine and use
Ginko Content search-result helpers instead of static section-data helpers:

```ts
export default defineNuxtConfig({
  content: {
    search: {
      engine: 'provider',
      collections: ['docs'],
    },
  },
})
```

```ts
const { query, results, pending, error } = await useContentSearch({
  collection: 'docs',
  locale,
})
```

## Route Capability

Collections have an explicit public mode:

- `route`: participates in `page`, `nav`, `surround`, `sitemap`, route
  diagnostics, SEO, and public visibility checks.
- `none`: data-only; published rows are usable through `list` and relations,
  but route-only public methods reject the collection.

Route-backed capability is enforced at runtime. Ginko Content owns the typed
website query surface and its sitemap/prerender integration; CMS does not
generate a parallel website API contract.

Path inputs remain URL-shaped, but the CMS does not store full-path route rows.
It resolves indexed `collection + locale + parent + slug` segments through the
active `publicEntries` tree. Page lookup, navigation, search, sitemap, and
locale alternates therefore share the same structural route truth. Moving or
renaming a live parent changes descendant effective URLs atomically and creates
a validated prefix redirect without republishing descendant drafts.

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

## Delivery Ownership

Ginko Content is the only website-facing query and prerender owner. Ginko CMS
publishes the raw, published-only Convex provider functions used by the Content
provider, but it does not register a second Nitro HTTP facade and it does not
add CMS-owned prerender routes. A future non-Ginko consumer requires an
explicitly versioned product contract rather than an option on the CMS module.

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

Public per-request limits and paging behavior:

- `list`: default `20`, maximum `100`.
- `search`: default `10`, maximum `50`, with an indexed continuation cursor and
  no first-500-row scan ceiling.
- `sitemap`: default `500`, maximum `1000`, with an indexed continuation cursor.
- `nav`: reads the indexed navigation-included scope; unrelated public rows do
  not consume a global 1,000-row budget.
- `routes`: maximum `250` per generation-fenced keyset page.
- `surround`: `previous` and `next` default to `1` and max out at `10`.

The certified content fixture is 1,500 entries across three locales, 500
assets, a five-level tree, a large live subtree, and long MDC documents. Public
route enumeration is also tested across 5,105 rows to prove it does not retain
the former 5,000-row cliff. These are evidence boundaries, not a promise of a
larger untested product envelope.

Public list sorting supports `orderKey`, `entryCreatedAt`, `firstPublishedAt`,
and `lastPublishedAt` with `:asc` or `:desc`. Path-prefix list queries derive
effective paths from the tree in stable-identity order and cannot be combined
with explicit sort.

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
pnpm -C playground exec ginko-cms doctor
pnpm -C playground build
pnpm run format:check
git diff --check
```

## Related Pages

- [Nuxt content provider](./nuxt-content-provider.md)
- [Content model](./content-model.md)
- [Relations](../concepts/relations.md)
