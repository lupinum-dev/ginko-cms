# Cache And Invalidation

Ginko CMS uses Ginko Content as the website-facing provider contract. The CMS
owns public projections, dependency resolution, publish impact, and durable
revalidation delivery. The deployed Nuxt app owns the host cache adapter.

## Ownership

```txt
Ginko CMS:
  public projections, dependency graph, publish impact, outbox, retry state

Ginko Content:
  provider contract, request cache hints, authenticated revalidation endpoint,
  cache adapter lifecycle

Site app:
  concrete cache adapter, platform credentials, route rules
```

`provider.invalidate()` is only for provider-owned caches and dependency state.
It must not directly purge Vercel, Cloudflare, Fastly, Redis, or another host
cache. Host cache purging happens through the configured Ginko Content cache
adapter when `/api/_content/revalidate` is called.

## Canonical Entry Identity

Public dependency tags use a `publicEntryKey`.

```ts
type PublicEntryKey = stableId | ref | entryId
```

Rules:

- Prefer CMS `stableId` when present.
- Use a human-authored `ref` only when it is guaranteed unique and stable within
  the collection.
- Use immutable CMS `entryId` only as a fallback.
- Never use title, slug, route path, or locale-specific translated slug as entry
  identity.
- Old/internal tag forms are migration aliases only. New code must emit the
  canonical vocabulary below.

## Canonical Tags

| Tag                                   | Meaning                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `entry:{collection}:{publicEntryKey}` | One public content entry across locales               |
| `collection:{collection}`             | Any list/query over a collection                      |
| `route:{path}`                        | One public route path                                 |
| `nav:{collection}:{locale}`           | Navigation tree for a collection/locale               |
| `search:{locale}`                     | Search sections or provider search index for a locale |
| `sitemap`                             | Sitemap output                                        |
| `site-data:{key}:{locale}`            | Shared site data                                      |
| `asset:{id}`                          | Rendered asset dependency                             |

For locale-specific entry invalidation, add a locale tag only when the CMS can
prove a change is isolated to that locale:

```txt
entry:{collection}:{publicEntryKey}:{locale}
```

The non-locale entry tag remains the safe default.

## Publish Flow

MVP publish behavior:

```txt
publish mutation
-> activate public projections
-> compute changed tags
-> compute direct and aggregate affected paths
-> insert durable outbox event
-> deliver to site /api/_content/revalidate
-> site calls provider.invalidate() and cacheAdapter.invalidate()
```

Path-only adapters such as Vercel ISR require concrete paths. The CMS must
resolve tags to paths before delivery.

## Dependency Graph

Projection/publish-time dependencies are the primary graph because a route may
need invalidation before it has ever been rendered by ISR.

Request-time render hints can enrich the graph when app route code reads
additional content during render, but they are not the only source of truth.

## Secrets

Revalidation secrets live in environment or secret storage. Studio may display
connection status or a fingerprint, but it must not expose raw secret values.
