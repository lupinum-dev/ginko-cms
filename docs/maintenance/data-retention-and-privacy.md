# Data Retention And Privacy

Ginko CMS stores product content and a small set of operational records. The
application owner is the data controller for a deployment. These rules describe
the component's actual defaults; they are not a substitute for the owner's
privacy notice or legal obligations.

## Operational Record Inventory

| Record family                       | Purpose and retained fields                                                                                                                                     | Visible to                                              | Default retention                                                              | Portability export | Deletion rule                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `activity`                          | Editorial history: operation kind, summary, content scope, application identity, timestamp, and bounded detail                                                  | Authenticated Studio users with activity access         | 180 days; minimal permanent-entry-deletion receipts use a legal hold           | No                 | Hourly indexed cleanup removes only standard-retention rows in batches of at most 100                          |
| `destructiveAuditLog`               | Security evidence for a confirmed destructive action: operation, caller/scope keys, hashes, confirmation id, execution path, and time                           | Restricted backend/operator evidence                    | Indefinite security hold                                                       | No                 | No automatic deletion; remove only under an application-owner policy that preserves required security evidence |
| `agentRuns`                         | Assisted-authoring evidence: OAuth delegation generation, client id, delegated user, immutable scope snapshot, task, status, timestamps, and bounded error text | The delegated user and authorized Studio reviewers      | Active runs expire within 24 hours; ended runs remain for 180 days             | No                 | Hourly indexed cleanup in batches of at most 100; a run remains while a retained review references it          |
| `reviewRequests`                    | Human/agent publish-review evidence: entry/locales, preview and hashes, requester/reviewer, decision, message, and timestamps                                   | Authorized Studio reviewers and the requesting workflow | Approved or rejected reviews for 180 days; pending reviews are retained        | No                 | Hourly indexed cleanup in batches of at most 100                                                               |
| `destructiveConfirmations`          | One-use replay prevention: operation/caller/scope hashes, confirmation id, and expiry                                                                           | Not user-visible                                        | Until expiry                                                                   | No                 | Indexed cleanup every ten minutes in batches of at most 100                                                    |
| `outboxEvents`                      | Revalidation delivery evidence: paths/tags, status, bounded local error category, attempts, and timestamps                                                      | Operators through diagnostics                           | Delivered 30 days; terminal failures 90 days; pending/delivering rows retained | No                 | Hourly status/time-indexed cleanup in batches of at most 100                                                   |
| Asset recovery artifacts            | Purge-bound asset manifest, exact bytes, byte length, checksums, creator, verification, and freshness                                                           | Owners                                                  | Until explicit owner deletion or documented expiry                             | No                 | Confirmed owner deletion removes both manifest and stored bytes                                                |
| portability runs, items, and assets | Bounded import/export execution, restart, idempotency, receipts, and transfer capability state                                                                  | Initiating owner CLI session                            | Explicit run expiry                                                            | No                 | Expiry indexes and bounded run-owned cleanup paths                                                             |

The installed contract, canonical content, revisions, members, and assets are
product state rather than operational history. Their lifecycle follows explicit
editorial/member operations and the recovery policy. Published revision history
is not silently removed by the operational cleanup cron.

## Permanent Entry Deletion

Permanent entry deletion is an owner-user-only guarded operation. The entry
must already be archived, have no public projection remnants, editorial
children, current inbound relations, entry-scoped assets, recovery artifacts,
active redirects, pending reviews, active transition payloads, or unexpired
portability artifacts. The owner must enter `DELETE <stable-id>`; the phrase,
actor, complete preview, and canonical dependency fences are rechecked in the
execution transaction.

One deletion is atomic and supports at most 1,500 direct children, 500 scoped
assets, 500 recovery artifacts, 500 redirects, 500 reviews, 100 transition
items, 100 portability items, 40 immutable revisions, 2,000 derived asset
references, and 500 activity rows. Exceeding an inventory limit returns a typed
blocker before deletion begins. The normal path is to resolve or expire retained
dependencies first; no partial purge is started.

An entry with more than 40 immutable revisions is not eligible for the routine
atomic operation. The owner must first preserve any legally required evidence,
apply an independently reviewed deployment-maintenance retention procedure to
the excess history, run projection/reference repair, and request a fresh delete
preview. The CMS never silently truncates history or converts this case into a
pagewise partial deletion.

The operation deletes the entry's drafts, revisions, rebuildable search/public
rows, reference rows, resolved reviews, obsolete receipts, terminal transition
payloads, expired portability payloads, and retired redirects in the same
transaction as its revalidation outbox event. Existing editorial activity is
retained under its normal policy with the deleted foreign key detached. One
minimal `entry.deleted` receipt and the guarded destructive receipt remain on a
legal/security hold. They retain only entry id, collection slug, stable id,
actor/time, operation hashes, and deletion counts; they do not retain draft or
revision content. The minimal activity receipt makes a repeated owner request
idempotent and distinguishes a previously deleted id from an unknown id.

## Sensitive Data Boundaries

- Raw API keys, auth secrets, revalidation secrets, and upload capabilities are
  never stored in portability or asset-recovery artifacts.
- Operational records may contain stable user ids, OAuth client/delegation ids, paths, entry
  ids, and bounded error summaries. They must not contain bearer tokens or
  remote response bodies.
- Content portability includes content documents and referenced portable asset
  payloads only. It excludes members, OAuth delegation settings, agent runs, review
  requests, security audit rows, confirmations, and revalidation events.
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
4. Revoke OAuth sessions, clients or delegations and active agent access before removing membership. Remove
   or anonymize mutable personal fields that the application owner is legally
   allowed to change.
5. Let the documented bounded cleanup remove activity, closed reviews, and
   ended runs at their retention boundary. Pending reviews and active runs must
   be closed or revoked first.
6. Do not delete `destructiveAuditLog` automatically. If the owner concludes it
   must be removed, record the legal/security decision and use an independently
   reviewed deployment maintenance procedure. Ginko CMS intentionally exposes
   no routine user-facing audit deletion path.
7. Delete obsolete asset recovery artifacts through the confirmed owner
   operation, and separately apply the infrastructure retention policy to
   official Convex backups and external portability copies.

After any deletion, run storage diagnostics and verify that no obsolete recovery
artifact or unreferenced storage object remains. Never mutate Convex tables
directly as a normal application workflow.

## Verification

The retention contract is executable in
`test/component/storage-maintenance.test.ts`. It proves boundary dates,
status-specific retention, preservation of active/pending records and security
audit rows, related-review preservation for agent runs, and bounded cleanup.

See also [Backup and recovery](./backup-and-recovery.md) and
[Authentication and roles](../reference/auth-and-roles.md).
