# ADR 0016: Direct Convex And Better Auth Cutover

Status: Accepted

## Context

Ginko CMS started with Trellis-generated bridges, forwarding keys, and operation
registries. The current product does not need the generic Trellis layer: it is a
single CMS product with one Convex component, Better Auth identity, and direct
Nuxt integration.

## Decision

Ginko CMS uses direct Convex, Better Auth, and `better-convex-nuxt`.

- Host apps own normal Convex setup files and generated `#convex/api` /
  `#convex/server` aliases.
- `better-convex-nuxt` owns Nuxt runtime wiring for Convex and Better Auth.
- Ginko CMS owns CMS domain policy, setup validation, Studio, public reads, MCP,
  CLI commands, and destructive confirmation invariants.
- The Convex component remains the source of truth for authorization,
  publishing, assets, backups, migrations, and projections.

Generated Trellis bridges, Trellis forwarding keys, and generated operation
handles are removed. Stale `convex/ginkoCms*` files are cleanup blockers, not
migration inputs.

`CONVEX_DEPLOY_KEY` is setup/admin transport authority for narrow internal
setup, sync, migration, and package verification paths. It is not CMS
member/editor/publisher authority.

## Consequences

Current install docs must mention Convex, Better Auth, `better-convex-nuxt`, and
the Ginko CMS packages as direct dependencies. They must not document Trellis as
a live requirement.

Compatibility paths, shims, dual bridge/direct modes, and regenerated Trellis
wrappers are intentionally excluded from the cutover.
