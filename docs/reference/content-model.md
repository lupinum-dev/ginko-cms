# Content Model

This reference describes the Convex-backed content model implemented in
`packages/convex/src/schema.ts`. It is the source of truth for table names in
docs; older projection-run and Nuxt Content mapping sketches named tables that
are not part of the active schema.

## Ownership

- Host code owns collection definitions.
- Convex stores synced collection contract snapshots in `collections`.
- Studio and MCP inspect collection contracts and edit content under those
  contracts; they do not author schema.
- Public reads use published rows only. They do not read draft state.
- Derived data must be rebuildable from canonical entry, revision, asset, and
  collection state.

## Tables

Collection and contract state:

- `collections`: synced code-defined collection contracts.
- `collectionReindexJobs`: internal reindex work for collection refreshes.

Canonical editable content:

- `entries`: entry identity, tree/order state, draft metadata, publish pointers,
  dirty locales, stable IDs, and collection ownership.
- `entryDrafts`: draft shared/localized values, body content, route data, and
  public flags.
- `entryRevisions`: append-only editorial events: publish, unpublish, rollback,
  archive, and checkpoint.
- `redirects`: explicit public redirects.
- `siteData`: reusable data blocks.

Assets and derived references:

- `assets`: uploaded media and file metadata.
- `contentAssetRefs`: derived asset references found in drafts/public content;
  rebuildable from entry content and asset fields.

Public serving state:

- `publicEntries`: active published rows for page, list, search, nav, sitemap,
  singleton, and data-only reads.
- `publicRoutes`: route lookup rows for route-backed page and route metadata
  reads. Data-only collections do not create route rows.
- `outboxEvents`: operational revalidation delivery events with expanded previous
  and next affected paths/tags, delivery attempts, retry state, and retention.
- `revalidationTargets`: delivery configuration for cache invalidation.

Imports and backups:

- `collectionImportRuns`: persisted import preview/apply reports for Studio and
  operator inspection.
- `backupArtifacts`: completed backup exports and their checksums/storage refs.
  Restore preview reads these artifacts; restore apply is limited to missing
  asset-scoped artifacts and writes a fresh asset row/storage object.

Access, operations, and audit:

- `cmsSettings`: site-level CMS settings such as locale configuration and
  webhook definitions.
- `members`: Studio members and roles.
- `mcpCredentialSettings`: CMS-owned scopes, collection limits, safety mode, and
  owner mapping for Better Auth API-key credentials. Raw API keys are not stored
  here.
- `agentRuns`: bounded delegated agent work sessions.
- `reviewRequests`: agent-created requests for human review before public or
  destructive operations.
- `destructiveConfirmations`: gated destructive-operation confirmation tokens.
- `destructiveAuditLog`: executed destructive-operation audit records.
- `activity`: audit/event feed.

## Publish Shape

```txt
draft state
  -> validate collection contract, field data, routes, parents, relations
  -> create immutable entry revision
  -> upsert publicEntries
  -> upsert publicRoutes only for route-backed collections
  -> emit revalidation outbox event with previous and next paths/tags
```

Publishing is direct-row activation. There is no active projection-run table or
batch activation concept in the active model.

## Public Capability Rule

- Route-backed collections can serve page, route metadata, nav, surround,
  search, sitemap, and list reads.
- Data-only collections publish to `publicEntries`, are readable through list
  operations, and are rejected by route-only public operations.
- `routeMeta` is a provider-only operation for Nuxt content rendering. It is
  not exposed by the optional HTTP facade.

## Import Rule

Imports apply content under existing code-defined collections. They do not
create runtime schema. Import results report actual entry and publish outcomes:
created, updated, no-op, skipped, blocked, and published rows.

## Rebuild Rule

Any derived row must have a named canonical source and a rebuild path. Current
rebuildable derived surfaces are public rows, route rows, content asset refs, and
search text on public rows.

Revalidation outbox rows are operational delivery state, not a rebuildable read
model. They are created from publish/site-data events, retried, and eventually
cleaned up according to retention rules.

## Asset Metadata Policy

Asset metadata is snapshot-until-republish. Editing an asset's alt text,
caption, filename, or tags updates the asset manager record, but it does not
rewrite already published entry snapshots or enqueue public revalidation by
itself. Public pages that embedded asset metadata pick up those edits after the
affected entries are republished or after a deliberate projection rebuild.

## Related Pages

- [Public content API](./public-content-api.md)
- [Cache invalidation](../concepts/cache-invalidation.md)
