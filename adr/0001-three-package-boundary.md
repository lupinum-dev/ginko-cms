# ADR 0001: Three Package Boundary

Status: Accepted

## Context

Ginko CMS has browser/runtime code, framework-neutral contract code, and Convex
component code. Mixing those concerns makes dependency direction fragile and can
leak Nuxt, Vue, Studio, or Convex-generated implementation details into places
that need to stay portable.

## Decision

Use three v1 packages:

- `@lupinum/ginko-cms` for the Nuxt module, Studio host, public routes,
  migration tooling, CMS provider integration, and setup manifest.
- `@lupinum/ginko-cms-contract` for shared domain contracts, public-content
  types, validators, and schema helpers.
- `@lupinum/ginko-cms-convex` for the Convex-backed CMS implementation.

## Consequences

The contract package must remain implementation-neutral. The Convex package must
not depend on Studio or Nuxt runtime code. The CMS package may compose the public
integration surface, but generated host files remain thin bridge bindings.
