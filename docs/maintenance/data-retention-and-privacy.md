# Data Retention And Privacy

Ginko CMS stores product content and a small set of operational records. The
application owner is the data controller for a deployment. These rules describe
the component's actual defaults; they are not a substitute for the owner's
privacy notice or legal obligations.

## Operational Record Inventory

| Record family                                          | Purpose and retained fields                                                                                                            | Visible to                                              | Default retention                                                              | CMS snapshot export        | Deletion rule                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `activity`                                             | Editorial history: operation kind, summary, content scope, actor/application identity, timestamp, and bounded detail                   | Authenticated Studio users with activity access         | 180 days                                                                       | Yes                        | Hourly indexed cleanup in batches of at most 100                                                               |
| `destructiveAuditLog`                                  | Security evidence for a confirmed destructive action: operation, caller/scope keys, hashes, confirmation id, execution path, and time  | Restricted backend/operator evidence                    | Indefinite security hold                                                       | No                         | No automatic deletion; remove only under an application-owner policy that preserves required security evidence |
| `agentRuns`                                            | Assisted-authoring evidence: credential id, delegated user, immutable scope snapshot, task, status, timestamps, and bounded error text | The delegated user and authorized Studio reviewers      | Ended runs for 180 days; active runs are retained                              | No                         | Hourly indexed cleanup in batches of at most 100; a run remains while a retained review references it          |
| `reviewRequests`                                       | Human/agent publish-review evidence: entry/locales, preview and hashes, requester/reviewer, decision, message, and timestamps          | Authorized Studio reviewers and the requesting workflow | Approved or rejected reviews for 180 days; pending reviews are retained        | No                         | Hourly indexed cleanup in batches of at most 100                                                               |
| `destructiveConfirmations`                             | One-use replay prevention: operation/caller/scope hashes, confirmation id, and expiry                                                  | Not user-visible                                        | Until expiry                                                                   | No                         | Indexed cleanup every ten minutes in batches of at most 100                                                    |
| `mcpCreateEntryReceipts`                               | Lost-response idempotency for MCP entry creation                                                                                       | Not user-visible                                        | 24 hours                                                                       | No                         | Expired rows are removed in bounded batches on the next MCP create                                             |
| `outboxEvents`                                         | Revalidation delivery evidence: paths/tags, status, bounded local error category, attempts, and timestamps                             | Operators through diagnostics                           | Delivered 30 days; terminal failures 90 days; pending/delivering rows retained | No                         | Hourly status/time-indexed cleanup in batches of at most 100                                                   |
| `backupArtifacts`                                      | Owner-created recovery/comparison manifest, scope, checksum, storage reference, counts, creator, and timestamp                         | Owners                                                  | Until explicit owner deletion                                                  | The artifact is the export | Confirmed owner deletion removes both manifest and stored archive                                              |
| portability plans, runs, stages, rosters, and receipts | Bounded import/export execution, restart, idempotency, and transfer capability state                                                   | Initiating owner/host workflow                          | Explicit run/plan expiry                                                       | No                         | Existing expiry indexes and bounded run-owned cleanup paths                                                    |

Content tables, revisions, members, assets, and policy are product state rather
than operational history. Their lifecycle follows explicit editorial/member
operations and the backup/recovery policy. Published revision history is not
silently removed by the operational cleanup cron.

## Sensitive Data Boundaries

- Raw API keys, auth secrets, revalidation secrets, and upload capabilities are
  never stored in CMS backup payloads.
- Operational records may contain stable user ids, API-key ids, paths, entry
  ids, and bounded error summaries. They must not contain bearer tokens or
  remote response bodies.
- The bounded CMS `snapshot` export includes members and activity because it is
  an owner-authenticated comparison/recovery artifact. It excludes MCP
  credential settings, agent runs, review requests, destructive audit rows,
  confirmations, and revalidation events.
- Official Convex deployment snapshots contain deployment data and must be
  protected, access-controlled, retained, and destroyed under the application
  owner's infrastructure policy.

## Access, Export, Correction, And Deletion Requests

The application owner should use this procedure for a request concerning a
person represented by a CMS member/user id:

1. Verify the requester's identity outside Ginko CMS and identify the exact
   deployment and user id. Do not search or disclose records using an
   unverified email address alone.
2. Export the user-visible member/content/activity facts through authenticated
   owner workflows. If operational evidence is required, inspect it through an
   authorized deployment/operator session; do not copy raw deployment data into
   support chat or logs.
3. Correct mutable member profile/role or authored content through the normal
   guarded CMS operations so the change remains auditable. Append a correction
   instead of rewriting immutable revision or security evidence.
4. Revoke API keys and active agent access before removing membership. Remove
   or anonymize mutable personal fields that the application owner is legally
   allowed to change.
5. Let the documented bounded cleanup remove activity, closed reviews, and
   ended runs at their retention boundary. Pending reviews and active runs must
   be closed or revoked first.
6. Do not delete `destructiveAuditLog` automatically. If the owner concludes it
   must be removed, record the legal/security decision and use an independently
   reviewed deployment maintenance procedure. Ginko CMS intentionally exposes
   no routine user-facing audit deletion path.
7. Delete obsolete CMS backup artifacts through the confirmed owner operation,
   and separately apply the infrastructure retention policy to official Convex
   snapshots and external copies.

After any deletion, run storage diagnostics and verify that no obsolete backup
archive or unreferenced storage object remains. Never mutate Convex tables
directly as a normal application workflow.

## Verification

The retention contract is executable in
`test/component/storage-maintenance.test.ts`. It proves boundary dates,
status-specific retention, preservation of active/pending records and security
audit rows, related-review preservation for agent runs, and bounded cleanup.

See also [Backup and recovery](./backup-and-recovery.md) and
[Authentication and roles](../reference/auth-and-roles.md).
