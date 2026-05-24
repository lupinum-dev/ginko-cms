# ADR 0015: Cache Invalidation Ownership

Status: Accepted

## Context

Ginko CMS publishes content into public projections consumed by Ginko Content.
Public sites may run on Vercel ISR, CDN caches, Redis-backed Nitro caches, or
single-instance development servers.

Cache invalidation is correctness-sensitive. A publish must not leave stale
public content behind, but Ginko CMS should not become tied to one hosting
platform.

## Decision

Ginko CMS owns content truth, public projections, publish impact, dependency
resolution, and durable revalidation delivery.

Ginko Content owns the provider-facing content contract, request-local cache hint
collection, the authenticated revalidation endpoint, and the host cache adapter
interface.

The deployed site owns the concrete cache adapter and platform credentials.
Provider invalidation only clears provider-owned caches and dependency state.
Host cache purging is performed by the app-level Ginko Content cache adapter.

CMS publish events must resolve changed content into canonical dependency tags
and, for path-only adapters such as Vercel ISR, exact affected paths before
delivery.

## Consequences

The CMS can support many hosts without hardcoding Vercel, Redis, Cloudflare, or
Fastly in its core publish path.

The publish outbox is required for production-grade reliability. A publish is
not fully operationally complete until revalidation is either completed or
durably queued with replay/diagnostic visibility.

Tag-only invalidation is valid as a CMS dependency model, but it must not be
sent to adapters that cannot resolve tags.
