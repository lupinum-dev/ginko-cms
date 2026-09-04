# Ginko CMS Architecture

Ginko CMS is a self-hosted CMS/admin layer for Ginko-powered Nuxt websites. The
core architecture is intentionally narrow: code-defined content models, a
Convex-backed CMS implementation, a standalone Studio app, published read
projections, and provider integration with Ginko core.

## Package Boundaries

The v1 architecture has three packages:

- `@lupinum/ginko-cms`: Nuxt module, Studio host, auth pages, public API routes,
  owner-CLI content portability and contract-transition tooling, CMS provider
  integration, and host setup templates.
- `@lupinum/ginko-cms-contract`: framework-neutral shared domain contracts,
  public-content types, Convex validators, and schema helpers.
- `@lupinum/ginko-cms-convex`: Convex component implementation for content,
  assets, auth integration, public projections, members, the installed
  contract, guarded operations, and MCP-backed operations.

Keep domain contracts free of Nuxt, Vue, Studio, and package implementation
details. Keep the Convex component free of Studio and Nuxt runtime dependencies.
Keep host-generated Convex setup files thin.

## Runtime Shape

```mermaid
flowchart LR
  App["Nuxt app"] --> Provider["CMS provider"]
  Provider --> Projections["Published public projections"]
  Studio["Ginko Studio"] --> Ops["CMS operations"]
  MCP["MCP tools/prompts/resources"] --> Ops
  Ops --> Convex["Convex CMS component"]
  Convex --> Projections
  Convex --> Assets["Convex-backed assets"]
  Contract["Installed CMS contract"] --> Studio
  Contract --> Ops
```

The app defines one CMS contract in code. Ginko CMS installs it as operational
truth, including collection schemas, locales, content policy, and editorial
presentation. Studio and MCP inspect that contract; they do not mutate schema.

## Setup Boundary

The host application owns Better Auth identities, provider choices, and its
Convex app. `@lupinum/better-convex-nuxt` owns Nuxt-side Convex lifecycle, SSR callers,
auth synchronization, route protection, and token exchange. Ginko CMS composes
that foundation and owns only CMS product policy.

The durable rule is:

> Host setup files expose the CMS component; they do not duplicate identity,
> authorization, or CMS domain policy.

## Studio Boundary

Studio is a standalone Vite SPA hosted by the Nuxt module. It is not a Nuxt
layer and should not be treated as part of the host app's public rendering
surface.

The Nuxt module owns:

- the Studio route and host page;
- auth pages and route protection;
- runtime config passed into the Studio host bridge;
- serving the built Studio bundle;
- Tailwind source registration for module-owned UI.

The Studio app owns authenticated CMS workflows: collection inspection, entry
editing, assets, settings, site data, versions, publishing, and diagnostics.

## Public Reads

Public website reads are published-only and website-shaped. They read active
public projections, not draft/editor tables.

The primary Nuxt integration is:

```text
Nuxt site -> CMS provider -> published projections
```

The public HTTP API is a supported integration surface for published reads and
advanced consumers, but it is not the default Nuxt developer experience.

## Admin And Agent Operations

Studio and MCP share the same product boundary:

- inspect contracts;
- operate drafts, localized fields, assets, members, settings, diagnostics, and
  publishing workflows;
- explain public visibility and publish impact;
- avoid raw database/table mutation;
- avoid schema/config mutation.

MCP is a first-class CMS surface, but it is opt-in through module configuration.
Core tables, generated types, and host setup glue may exist regardless of route
registration; the externally exposed MCP server should not be enabled
implicitly.

## Storage Foundations

Convex is the hard v1 backend foundation for this repo. Better Auth is the hard
v1 auth foundation. Managed assets are Convex-backed for v1.

Raw MDC is the canonical editable body source. Studio editor state, TipTap,
previews, parsed ASTs, table of contents, search text, and public render shapes
are derived/adapted representations.

Relations store stable references. Runtime expansion, depth, and include-style
query APIs are not part of the v1 public contract.
