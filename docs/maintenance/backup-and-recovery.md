# Backup And Recovery

Use this page when you need a recovery source before migrations, destructive
asset work, or release validation. Backups are owner-authenticated operational
artifacts; they are not a second content model and they are not an automatic
rollback system.

## What Component Backups Cover

The Convex component exposes backup actions to authenticated CMS owners. The
deploy-key CLI deliberately does not wrap those actions: a setup/admin key must
not impersonate an owner.

Supported export scopes are:

| Scope        | Required argument      |
| ------------ | ---------------------- |
| `snapshot`   | none                   |
| `collection` | `--collection-id <id>` |
| `entry`      | `--entry-id <id>`      |
| `asset`      | `--asset-id <id>`      |

`snapshot` is a bounded CMS data export for comparison and narrow recovery
workflows. It is not a deployment disaster-recovery snapshot.

## Verify Semantics

Backup verification checks two things:

- `checksumMatches`: the stored archive still matches the recorded checksum.
- `currentDataMatches`: the live data still matches the backup scope.

An old backup can still have `checksumMatches: true` while
`currentDataMatches: false`. That means the archive is intact, but live data has
changed since the backup was created.

## Restore Semantics

The Convex component exposes owner-authenticated restore actions for the narrow
safe v1 case:

- `backup.previewRestoreBackup` dry-runs a restore from an artifact and reports
  the affected tables without writing.
- `backup.restoreBackup` applies only asset-scoped artifacts whose backed-up
  asset row is missing and whose archive checksum matches the caller-provided
  `expectedChecksum`.

Restore apply stores fresh asset bytes in Convex storage and creates a new asset
row. It does not overwrite existing rows, preserve the old Convex document id,
or apply `snapshot`, `collection`, or `entry` artifacts over live data.

Do not overwrite live CMS tables directly from a backup. That can destroy content
written after the backup was created.

## Destructive Operations

Some destructive operations require a matching backup artifact. Asset purge, for
example, rejects a missing or stale backup artifact. The expected flow is:

1. Export a backup for the affected scope.
2. Verify the artifact.
3. Preview the destructive operation.
4. Execute only after the preview confirms the backup is valid for the current
   data.

For deployment disaster recovery, use official Convex deployment snapshots.
Package downgrades are unsupported: recover by deploying a forward fix, or by
restoring a deployment snapshot taken before the upgrade.

## Related Pages

- [Migration recovery](../guides/migrations/recovery.md)
- [Data retention and privacy](./data-retention-and-privacy.md)
- [Release candidate checklist](./release-candidate.md)
