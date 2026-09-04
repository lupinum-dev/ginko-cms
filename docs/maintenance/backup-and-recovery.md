# Recovery Boundaries

Ginko CMS deliberately has no application-level database backup or full-table
restore system. Recovery has three separate mechanisms. Do not present one as a
substitute for another.

| Recovery need                   | Canonical mechanism                                                                 | What it restores                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Deployment or database disaster | [Official Convex Backup & Restore](https://docs.convex.dev/database/backup-restore) | Convex table data and, when selected, file storage                                   |
| Content portability             | Owner-only `ginko-cms content` commands                                             | Validated published-content exports reapplied as drafts under the installed contract |
| Permanent asset purge           | Verified asset recovery artifact                                                    | The exact purged bytes and validated asset manifest only                             |

## Deployment Recovery

Create and verify an official Convex backup before risky deployment or contract
work. Select file storage when the recovery plan requires stored files. Convex
backup restore is destructive, so take a fresh backup of the current state
before replacing a deployment.

Convex backups do not contain application source, deployed function code,
environment variables, or pending scheduled functions. Preserve and restore
those through the normal source-control and deployment runbooks.

No Ginko CMS table, Studio screen, MCP tool, or owner API claims to reproduce
this capability.

## Content Portability

Content export and import are owner-only CLI workflows:

```bash
pnpm exec ginko-cms content export --out ./portable-content
pnpm exec ginko-cms content verify ./portable-content
pnpm exec ginko-cms content import ./portable-content --plan ./import-plan.json
pnpm exec ginko-cms content import --apply ./import-plan.json
```

Exports are deterministic and checksummed. Imports validate against the active
contract, create or update drafts, and never publish implicitly. The supported
envelope is 5,000 localized documents, three locales, and 500 assets. A content
export is not a deployment snapshot and cannot restore arbitrary CMS tables.

## Asset Purge Recovery

Permanent purge is allowed only when a current verified artifact contains:

- the asset manifest and identity;
- the complete stored bytes;
- the exact byte length;
- matching checksums; and
- evidence that the artifact still matches the asset being purged.

Purge rejects missing, incomplete, corrupt, stale, mismatched, or referenced
artifacts. Restore verifies the artifact again, stores a fresh object, and must
reproduce the original bytes exactly. It does not overwrite an existing asset
or restore unrelated content.

Create the artifact while the source asset still exists, record its returned
checksum, and download a locally rechecked copy before purge:

```bash
pnpm exec ginko-cms asset recovery create <asset-id>
pnpm exec ginko-cms asset recovery verify <artifact-id>
pnpm exec ginko-cms asset recovery download <artifact-id> --out ./asset-recovery.json
```

After the original asset is absent, preview the restore. Apply only the current
preview checksum with explicit confirmation:

```bash
pnpm exec ginko-cms asset recovery preview <artifact-id>
pnpm exec ginko-cms asset recovery restore <artifact-id> --checksum <sha256> --yes
```

The restore command previews again immediately before execution and refuses a
blocked or changed receipt.

## Derived State Repair

Public/search projections and content-to-asset references are derived from the
canonical contract, drafts, revisions, and active publications. Owners can run
one bounded worker that repairs both kinds of derived state and then verifies
the rebuilt rows:

```bash
pnpm exec ginko-cms repair start <run-id>
pnpm exec ginko-cms repair status <run-id>
pnpm exec ginko-cms repair resume <run-id>
```

Each page commits a durable cursor and generation. `--manual` disables automatic
continuation for controlled failure testing; `--page-size` accepts 1 through 25.
There is no second repair table or direct endpoint for reference mutations.
Permanent asset purge fails closed until one complete, zero-issue verification
run has scanned the current canonical drafts and immutable revisions. Any later
canonical reference change makes that proof stale and requires another run.

Abandoned upload storage is retried automatically with bounded backoff. A task
that exhausts its retries remains visible to owners instead of disappearing:

```bash
pnpm exec ginko-cms asset cleanup list
pnpm exec ginko-cms asset cleanup retry <task-id> --generation <n> --yes
```

Retry always uses the generation shown by the current inventory and a fresh
guarded preview. Older confirmations and worker completions are rejected.

For a read-only deployment check, run `ginko-cms doctor --deployment`. It verifies
the current owner session, the installed content and presentation hashes against
the host configuration, the contract transition state, and that terminal asset
cleanup inventory is empty.

## Operational Rule

Before risky work, record which of the three mechanisms covers the failure being
planned for. If none does, stop. Never edit live CMS tables or recovery receipts
to force an operation through a blocker.

## Related Pages

- [Contract transition recovery](../guides/contract-transitions/recovery.md)
- [Content portability](../guides/content-portability.md)
- [Data retention and privacy](./data-retention-and-privacy.md)
