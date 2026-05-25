# Ginko CMS Positioning

Ginko CMS is a self-hosted CMS for Nuxt teams building structured websites with
Ginko, with first-class support for multilingual content.

It sits between Git/file-based content workflows and broad general-purpose CMS
platforms. If Nuxt Studio feels too Git/workflow-oriented for client editing
needs, or Directus feels heavier than a Nuxt content site requires, Ginko CMS
may be a better fit.

## Category

Ginko CMS is a website CMS for Ginko-powered Nuxt apps.

It is not:

- a generic database admin UI;
- a low-code internal-tool platform;
- a visual page builder;
- a hosted SaaS product;
- a schema builder inside Studio.

The host app owns rendering and defines the content model in code. Ginko CMS
owns content operations: Studio, Convex-backed content storage, Better Auth,
assets, public output, migration tooling, and MCP.

## Target Users

The primary users are Nuxt developers and teams building public websites where
structured content, routing, SEO, publishing, assets, and localization matter.

The secondary users are content editors working with pages, docs, posts, legal
content, reusable site data, media, translations, drafts, versions, and publish
state.

Single-language sites are valid and should feel natural. Multilingual content is
first-class, but it is not mandatory.

## Differentiation

Against simpler file/Git-based workflows, Ginko CMS adds a real editing and
publishing surface: auth, Studio, assets, drafts, versions, public output, MCP
operations, and content diagnostics.

Against broad CMS/data platforms, Ginko CMS is intentionally narrower. It is
optimized for app-owned Nuxt websites, provider integration with Ginko, typed
contracts, website-shaped public reads, route-aware content, and localization.
Studio should express that focus as a content operations cockpit: work queues,
translation readiness, website changes, public-output verification, imports,
assets, activity, and diagnostics for developer-facing operational details.

The message should remain respectful:

> Different tools fit different content operations. Ginko CMS is for teams that
> want a focused CMS for structured Ginko/Nuxt websites without adopting a broad
> general-purpose data platform.

## Product Principles

### App-Owned Presentation

Ginko CMS stores and manages structured content. The Nuxt app owns layouts,
components, styling, and interactions.

### Code-Defined Content Model

Collections and schemas live in app code. Studio and MCP inspect those
contracts and operate content through them; they do not mutate schema.

### Published Projection Reads

Public website reads come from active published projections. Draft/editor state,
preview, diagnostics, Studio, MCP, and build/admin tooling are separate surfaces.

### Ginko Provider First

Nuxt websites should read CMS content through the Ginko provider. The public HTTP
API is supported for published-read integrations, but it is not the main Nuxt
happy path.

### Convex-Backed V1 Foundation

Ginko CMS v1 is Convex-backed and uses Better Auth. Managed assets are
Convex-backed as part of the CMS product foundation.

## Related Pages

- [Quickstart](../getting-started/quickstart.md)
- [Content model](../reference/content-model.md)
- [Studio product model](./studio/product-model.md)
