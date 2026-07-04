# Migration Recovery

Use this page when a collection drift check, content migration, or contract push
fails during a model change. Collection changes should be recoverable because
the risky part is explicit: stored content is transformed separately from
contract sync.

## Before Applying A Migration

Export or preserve a verified full backup through an owner-authenticated
operator workflow.

Keep the backup with the deploy or release notes for the change. Do not rely on
local development resets for shared staging or production data.

## If `push --check` Fails

No content was changed. The command only compared the active CMS contract with
the code-defined contract.

Next step:

1. Read the drift report.
2. If migration is required, create a migration scaffold.
3. Export a backup before changing data.

## If `ginko-cms push` Fails

If the failure is `COLLECTION_CONTRACT_CHANGE_REQUIRES_MIGRATION`, the CMS
blocked the contract sync before changing the incompatible contract. Existing
content is still protected by the old active contract.

Next step:

1. Run `pnpm exec ginko-cms push --check`.
2. Write an explicit content migration.
3. Run a backup.
4. Apply the content migration.
5. Run `pnpm exec ginko-cms push` again.

## If A Content Migration Fails

`ginko-cms migrate plan` writes nothing. `ginko-cms migrate apply` writes changed
entries in chunks and uses `draftVersion` to reject entries edited since the
plan was built.

Treat the migration as application code:

1. Stop the rollout.
2. Inspect which entries were changed.
3. Use the backup as the recovery source if the migration partially applied.
4. Fix the migration.
5. Re-run against a disposable deployment before retrying shared data.

There is no migration history table. The migration file, CLI output, backup,
and release notes are the audit trail.

## Use The Backup For Recovery

The CLI can export, download, and verify backups. It does not expose a backup
import command. Treat the backup file as the recovery source for an operator-led
restore or manual repair, not as a broad command you can apply over live data.

The component-level restore actions can dry-run any backup artifact and apply
only missing asset-scoped artifacts after the caller confirms the exact archive
checksum. Full, collection, and entry artifacts remain comparison sources for an
operator-led repair flow.

For production recovery:

1. Stop writes to the affected CMS deployment.
2. Preserve the failed migration output and the backup artifact/checksum.
3. Restore or inspect the backup in an isolated deployment or operator
   environment.
4. Repair live data only after comparing the backup with the partially migrated
   state.
5. Re-run the fixed migration against disposable data before retrying shared
   data.

Do not overwrite live CMS tables directly to force a recovery. That can destroy
entries written after the backup was created.

## Final Verification

After content and contract changes:

```bash
pnpm exec ginko-cms push --check
pnpm exec ginko-cms doctor
pnpm run typecheck
pnpm run build
```

Then verify the public pages affected by the change, especially:

- page routes
- navigation
- sitemap
- search
- relation displays
- localized fallback behavior

## Related Pages

- [Changing collections](../changing-collections.md)
- [Migration recipes](./recipes.md)
- [Backup and recovery](../../maintenance/backup-and-recovery.md)
