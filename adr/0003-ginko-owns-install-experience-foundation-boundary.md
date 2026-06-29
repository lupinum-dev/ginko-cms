# ADR 0003: Ginko Owns Install Experience And Foundation Boundary

Status: Superseded by the better-convex-nuxt hard cutover

## Context

Ginko CMS depends on generic Nuxt, Convex, and Better Auth plumbing, but those
foundation primitives must not become CMS product semantics. Host apps should
install and reason about Ginko CMS as the product integration.

## Decision

Ginko CMS owns the user-facing installation, setup, and validation experience.
better-convex-nuxt may power generic app plumbing, but docs and commands should
be framed around Ginko CMS wherever possible.

## Consequences

Public docs should keep foundation concepts narrow. Ginko-owned bridge,
operation, Studio, MCP, permission, and content concepts should not move into
better-convex-nuxt.
