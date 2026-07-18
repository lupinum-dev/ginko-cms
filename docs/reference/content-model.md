# Canonical Content Model

This reference describes the greenfield Convex model. Every important concept
has one canonical owner; projections are explicitly derived and rebuildable.

## Installed Contract

`cmsContract` is the only installed CMS contract. It contains collection
schemas keyed by stable slug, configured locales, content policy, and editorial
presentation. Separate content and presentation hashes let presentation-only
changes install without starting a contract transition.

Host code supplies the expected hashes. A mismatch remains readable and
diagnosable but locks editorial writes until the installed contract agrees.
Studio never combines this row with a separate collections, policy, locale, or
settings store.

## Canonical State

- `entries` owns stable identity, collection slug, shared draft fields, shared
  placement, lifecycle, shared draft version, and each locale's active revision
  pointer.
- `entryLocaleDrafts` owns locale-specific values, MDC source, locale slug, and
  locale draft version.
- `entryRevisions` is append-only. A publication revision is a complete immutable
  snapshot of shared values, localized values, placement, relations, asset facts,
  and contract content hash.
- `reviewRequests` pins exact draft versions and a publish-preview hash.
- `redirects` owns exact or prefix redirects, target entry, locale, origin,
  lifecycle, and audit facts.
- `siteData`, `assets`, `members`, MCP credential settings, agent runs, and
  activity each own their respective product facts.
- Guarded operation, contract-transition, portability, and recovery runs own
  durable cursors, generations, item receipts, and outcomes for work that cannot
  fit in one transaction.

There is no second collection registry, editable locale settings row, policy
overlay, persisted composite readiness, or public-path payload copy.

## Derived State

- `publicEntries` has at most one row per live entry and locale. It records the
  source revision, collection slug, locale slug, parent entry, order, and public
  payload. It does not store a full path.
- Draft/public search text and `contentAssetRefs` are derived from canonical
  drafts and immutable publication revisions.
- Revalidation outbox rows are transactional delivery records. They carry an
  idempotency key, retry state, delivery generation, and lease token.

Every derived row identifies the canonical revision or version that produced
it. Repair deletes and rebuilds derived state from canonical rows, and invariant
tests compare the rebuilt bytes with the original projection.

## Editorial Lifecycle

```text
entry shared draft + locale draft
  -> one backend readiness computation
  -> guarded publish preview bound to versions and route generation
  -> immutable complete revision
  -> locale active-revision pointer + one bounded, body-free publicEntries row
  -> activity + revalidation outbox in the same transaction
```

Publishing one locale changes only that locale's active pointer and public row.
Editing a shared field advances the shared draft version and makes every live
locale show unpublished changes without changing public output. Publishing all
ready locales commits all selected locale activations atomically.

Restoring history copies a compatible revision into drafts and leaves public
output untouched. Rolling back public output creates and activates a new
revision through the normal guarded publication operation.

## Structural Public Routing

Route resolution walks the `publicEntries` tree through the indexed key
`collection + locale + parentEntryId + slug`. Lists, navigation, search,
sitemap, and alternates derive effective paths from the same tree.

Renaming or moving a live parent updates one public node and creates a validated
prefix redirect atomically. Descendant URLs therefore change without publishing
descendant drafts or rewriting every descendant row. Unpublishing or archiving
a parent makes descendants unreachable through the public tree while preserving
their editorial records.

Redirect validation rejects source collisions, unsafe targets, loops, and
chains. Redirects can be retired without deleting their audit history.

## Assets and Recovery

Asset references are derived from canonical drafts and publication revisions.
Upload sessions expire; finalization verifies the stored bytes before creating
an asset. Permanent purge requires a current verified artifact containing the
complete bytes, byte length, manifest, and checksums, and remains blocked while
canonical content references the asset.

Studio asset discovery applies filename search, kind, upload-time window,
size, exact tag, deleted state, ownership location, usage certainty, and stable
sorting on the backend before keyset pagination. The full supported 500-asset
set is fenced into each cursor, so a changed result set returns a stale-cursor
error instead of losing or duplicating rows across a page boundary. Sidebar
counts come from the same bounded backend read; Studio never filters or sorts a
partially loaded page.

Usage is intentionally three-state. `used` means a concrete derived reference
exists or the current verification proof includes the asset.
`unused-verified` is available only when the latest zero-issue repair run proves
the current canonical generation contains no reference. Missing or stale proof
is `unknown-stale`, never “unused.” Trash and permanent purge fail closed when
an asset has neither a known reference nor current unreferenced proof.

Database recovery uses official Convex Backup & Restore. Content portability
uses deterministic owner-CLI exports and draft-only imports. Neither introduces
application-level database recovery state.

## Portability

The owner CLI validates, plans, applies, and resumes generation-fenced runs with
stable keyset cursors and per-item receipts. The supported envelope is 5,000
localized documents, three locales, and 500 assets. Studio and MCP expose no
portability write endpoint.

## Related Pages

- [Public content API](./public-content-api.md)
- [Cache invalidation](../concepts/cache-invalidation.md)
- [Recovery boundaries](../maintenance/backup-and-recovery.md)
