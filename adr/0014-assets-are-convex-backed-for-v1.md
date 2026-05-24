# ADR 0014: Assets Are Convex-Backed For V1

Status: Accepted

## Context

Managed assets are part of the CMS product, not an unrelated adapter layer.
Premature storage abstraction would add surface area before a second real
backend exists.

## Decision

Ginko CMS stores and serves managed assets through the Convex-backed CMS
implementation for v1.

## Consequences

Document assets as Convex-backed. Do not promise storage-provider abstraction
until the product needs it and the implementation exists.
