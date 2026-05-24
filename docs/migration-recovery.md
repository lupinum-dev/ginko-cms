# Migration Recovery

Collection changes should be recoverable because the risky part is explicit:
stored content is transformed separately from contract sync.

## Before Applying A Migration

Export a full backup:

```bash
pnpm exec ginko-cms backup export --scope full --out ./ginko-backup.json
```

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
3. Restore from the backup if the migration partially applied.
4. Fix the migration.
5. Re-run against a disposable deployment before retrying shared data.

There is no migration history table. The migration file, CLI output, backup,
and release notes are the audit trail.

## Restore From Backup

Backup import is intentionally gated:

```bash
pnpm exec ginko-cms backup import --file ./ginko-backup.json --empty-only
```

The import command requires `--empty-only` because restoring over live data can
destroy current CMS state. For production recovery, prefer restoring into a
fresh deployment first, verify, then promote or manually repair.

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
