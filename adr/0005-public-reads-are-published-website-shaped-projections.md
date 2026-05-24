# ADR 0005: Public Reads Are Published Website-Shaped Projections

Status: Accepted

## Context

Website runtime reads need stable, fast, public-safe shapes. Draft/editor tables
contain operational state that should not leak into public pages.

## Decision

Public website reads use active published projections. They are shaped around
website needs: pages, lists, navigation, search, surround, sitemap, singletons,
and site data.

Studio, preview, diagnostics, schema inspection, route validation, MCP, admin,
and build tooling are separate authenticated or operational surfaces.

## Consequences

Draft saves and import previews do not change public output. Publishing creates
or updates immutable published versions and activates public projections.
