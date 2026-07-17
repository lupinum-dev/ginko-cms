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

## Operational Rule

Before risky work, record which of the three mechanisms covers the failure being
planned for. If none does, stop. Never edit live CMS tables or recovery receipts
to force an operation through a blocker.

## Related Pages

- [Contract transition recovery](../guides/migrations/recovery.md)
- [Filesystem portability](../guides/filesystem-migration.md)
- [Data retention and privacy](./data-retention-and-privacy.md)
