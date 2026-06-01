# Ginko CMS Vision

Ginko CMS is a self-hosted CMS for Nuxt teams building structured websites with
Ginko, with first-class support for multilingual content.

It provides the CMS/admin layer that Ginko core intentionally does not own:
Studio, Convex-backed content storage, Better Auth, managed assets, published
public projections, filesystem migration, and MCP operations.

## Product Boundary

Ginko CMS sits on top of Ginko content:

- `ginko` is the provider-neutral Nuxt content engine.
- `ginko-cms` is the self-hosted CMS/admin layer for Ginko.
- `ginko-cms-convex` is the Convex-backed CMS implementation.
- `ginko-cms-contract` contains shared contracts, domain types, and validators.

The repo is not a generic backend, a schema builder, or a visual page builder.
The host Nuxt app owns its presentation and defines its content model in code.
Ginko CMS uses that model to provide editing, publishing, assets, diagnostics,
public projections, and agent-safe operations.

## Product Promise

Ginko CMS should make structured website content feel predictable:

- developers define collections and fields in code;
- editors manage drafts, locales, assets, routes, SEO, versions, and publishing;
- agents operate content workflows through MCP without touching raw tables;
- published website reads come from active public projections;
- Nuxt pages read content through the CMS provider rather than CMS internals.

Single-language sites should feel natural. Multilingual sites should not feel
bolted on. Locale-aware routing, translation readiness, canonical URLs,
`hreflang`, sitemap behavior, search, and navigation are part of the product
shape rather than optional afterthoughts.

## Non-Goals

Ginko CMS is not trying to be:

- a generic database admin UI;
- an arbitrary low-code business app platform;
- an enterprise DAM;
- a schema editor inside Studio;
- a visual page composition system;
- a hosted SaaS product.

It may compare well against adjacent tools for specific Nuxt content sites, but
the positioning should stay respectful: Ginko CMS is a different fit, not a
claim that other tools are bad.

## Scale Target

The v1 target is small to medium structured content sites: hundreds to low
thousands of entries, multiple locales, Convex-backed assets, published read
projections, and search suitable for editorial/site content.

Do not promise very large headless-CMS or DAM workloads until they are load
tested and operationally proven.
