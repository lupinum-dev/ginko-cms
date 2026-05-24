# Current Content Model

This document describes the current Convex-backed content model. It replaces
older projection-run and Nuxt Content mapping sketches; those documents named
tables that are not part of the active schema.

## Ownership

- Host code owns collection definitions.
- Convex stores synced collection contract snapshots in `collections`.
- Studio and MCP inspect collection contracts and edit content under those
  contracts; they do not author schema.
- Public reads use published rows only. They do not read draft state.
- Derived data must be rebuildable from canonical entry, revision, asset, and
  collection state.

## Tables

Canonical editable content:

- `collections`: synced code-defined collection contracts.
- `entries`: entry identity, tree/order state, draft metadata, publish pointers,
  dirty locales, stable IDs, and collection ownership.
- `entryDrafts`: draft shared/localized values, body content, route data, and
  public flags.
- `entryRevisions`: immutable published snapshots.
- `assets`: uploaded media and file metadata.
- `contentAssetRefs`: derived asset references found in drafts/public content;
  rebuildable from entry content and asset fields.
- `redirects`: explicit public redirects.
- `siteDataBlocks`: reusable data blocks.
- `activity`: audit/event feed.

Public serving state:

- `publicEntries`: active published rows for page, list, search, nav, sitemap,
  singleton, and data-only reads.
- `publicRoutes`: route lookup rows for route-backed page and route metadata
  reads. Data-only collections do not create route rows.
- `outboxEvents`: revalidation delivery events with already-expanded old and
  new affected paths/tags.
- `revalidationTargets` and `revalidationJobs`: delivery configuration and job
  status for cache invalidation.

Import state:

- `collectionImportRuns`: persisted import preview/apply reports for Studio and
  operator inspection.

## Publish Shape

```txt
draft state
  -> validate collection contract, field data, routes, parents, relations
  -> create immutable entry revision
  -> upsert publicEntries
  -> upsert publicRoutes only for route-backed collections
  -> emit revalidation outbox event with old and new paths/tags
```

Publishing is direct-row activation. There is no active projection-run table or
batch activation concept in the current model.

## Public Capability Rule

- Route-backed collections can serve page, route metadata, nav, surround,
  search, sitemap, and list reads.
- Data-only collections publish to `publicEntries`, are readable through list
  operations, and are rejected by route-only public operations.
- `routeMeta` is a provider/bridge operation for Nuxt content rendering. It is
  not exposed by the optional HTTP facade.

## Import Rule

Imports apply content under existing code-defined collections. They do not
create runtime schema. Import results report actual entry and publish outcomes:
created, updated, no-op, skipped, blocked, and published rows.

## Rebuild Rule

Any derived row must have a named canonical source and a rebuild path. Current
derived surfaces are public rows, route rows, content asset refs, search text on
public rows, and revalidation events.

## Asset Metadata Policy

Asset metadata is snapshot-until-republish. Editing an asset's alt text,
caption, filename, or tags updates the asset manager record, but it does not
rewrite already published entry snapshots or enqueue public revalidation by
itself. Public pages that embedded asset metadata pick up those edits after the
affected entries are republished or after a deliberate projection rebuild.
