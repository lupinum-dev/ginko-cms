# Migration Recovery

Use this page when a collection drift check, content migration, or contract push
fails during a model change. Collection changes should be recoverable because
the risky part is explicit: stored content is transformed separately from
contract sync.

## Before Applying A Migration

Create and independently verify an official Convex deployment snapshot. A
Ginko CMS `snapshot` export may also help compare rows, but it is not a complete
disaster-recovery source.

Keep the backup with the deploy or release notes for the change. Do not rely on
local development resets for shared staging or production data.

## If `push --check` Fails

No content was changed. The command only compared the active CMS contract with
the code-defined contract.

Next step:

1. Read the drift report.
2. If migration is required, create a migration scaffold.
3. Verify the pre-migration Convex deployment snapshot.

## If `ginko-cms push` Fails

If the failure is `COLLECTION_CONTRACT_CHANGE_REQUIRES_MIGRATION`, the CMS
blocked the contract sync before changing the incompatible contract. Existing
content is still protected by the old active contract.

Next step:

1. Run `pnpm exec ginko-cms push --check`.
2. Write an explicit content migration.
3. Verify the pre-migration Convex deployment snapshot.
4. Apply the content migration.
5. Finalize it with an explicit `preserve`, `rebuild`, or `unpublish` public
   strategy.
6. Activate the exact single-use approval.

## If A Content Migration Fails

`ginko-cms migrate plan` writes nothing. `ginko-cms migrate apply` writes changed
entries in 50-entry transactions. Each transaction records input/output hashes,
an entry receipt, and the run cursor atomically. Retrying skips committed
receipts; an entry edited after planning or application stops with a conflict.

Treat the migration as application code:

1. Stop the rollout.
2. Inspect which entries were changed.
3. Resume from the durable run receipts after fixing the cause.
4. Fix the migration.
5. Re-run against a disposable deployment before retrying shared data.

Finalization validates every stored entry against the exact target contract and
creates an expiring single-use approval. Activation rejects changed entries,
changed migration source, a different contract hash, or an expired approval.

## Use The Backup For Recovery

The deploy-key CLI does not expose owner-authenticated backup actions. Treat a
custom export as comparison data for operator-led repair, not as a broad command
you can apply over live data.

The component-level restore actions can dry-run any backup artifact and apply
only missing, currently unreferenced asset-scoped artifacts after the caller
confirms the exact archive checksum. Snapshot, collection, and entry artifacts
remain comparison sources for an operator-led repair flow.

For production recovery:

1. Stop writes to the affected CMS deployment.
2. Preserve the failed migration output and the backup artifact/checksum.
3. Restore the independently verified Convex deployment snapshot to an isolated
   deployment, or inspect the custom export in an operator environment.
4. Repair live data only after comparing the backup with the partially migrated
   state.
5. Re-run the fixed migration against disposable data before retrying shared
   data.

Do not overwrite live CMS tables directly to force a recovery. That can destroy
entries written after the backup was created.

Downgrade from data written by `0.2.x` to `0.1.3` is unsupported. Recover with a
forward fix or restore a Convex deployment snapshot taken before the upgrade.

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
