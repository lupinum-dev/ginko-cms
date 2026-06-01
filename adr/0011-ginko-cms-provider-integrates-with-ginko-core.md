# ADR 0011: Ginko CMS Provider Integrates With Ginko Core

Status: Accepted

## Context

Ginko core is the provider-neutral content engine for Nuxt. Ginko CMS should not
force application pages to read CMS internals directly.

## Decision

The primary Nuxt website integration is the CMS provider backed by published
CMS projections.

The public HTTP API is a supported integration surface for published reads and
advanced consumers, but it should not replace the CMS provider as the default
Nuxt developer experience.

## Consequences

Nuxt page code should stay provider-neutral where possible. CMS-specific
diagnostics, preview, admin, and MCP surfaces remain separate from public
website reads.
