# Backup And Recovery

Use this page when you need a recovery source before migrations, destructive
asset work, or release validation. Backups are owner-authenticated operational
artifacts; they are not a second content model and they are not an automatic
rollback system.

## What Backup Commands Cover

The CLI accepts backup helper commands:

```bash
pnpm exec ginko-cms backup export --scope full --out ./ginko-backup.json
pnpm exec ginko-cms backup verify --artifact-id <id>
pnpm exec ginko-cms backup download --artifact-id <id> --out ./ginko-backup.json
```

Supported export scopes are:

| Scope        | Required argument      |
| ------------ | ---------------------- |
| `full`       | none                   |
| `collection` | `--collection-id <id>` |
| `entry`      | `--entry-id <id>`      |
| `asset`      | `--asset-id <id>`      |

The backing Convex actions require a CMS owner identity. Unlike `push` and
`migrate`, the current backup CLI path is not deploy-key setup/admin transport.
Do not put these commands in a headless migration runbook unless the host has
deliberately provided owner-authenticated execution for the backup actions.

## Verify Semantics

`backup verify` checks two things:

- `checksumMatches`: the stored archive still matches the recorded checksum.
- `currentDataMatches`: the live data still matches the backup scope.

An old backup can still have `checksumMatches: true` while
`currentDataMatches: false`. That means the archive is intact, but live data has
changed since the backup was created.

## No Import Command

The CLI can export, download, and verify backup artifacts. It does not expose an
import or restore command for backup artifacts. Treat a backup as a recovery
source for an operator-led restore, comparison, or manual repair in an isolated
environment.

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

## Related Pages

- [Migration recovery](../guides/migrations/recovery.md)
- [Release candidate checklist](./release-candidate.md)
