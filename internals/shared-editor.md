# Shared body integration

The backend port uses the current Editor runtime (`ginko-editor-2`, protocol 1)
and the same package bytes in Studio and the component. This local branch is
not a release. Better Convex auth migration, two-user browser acceptance,
presence and on-site bindings still need their own proof.

## Stored rooms and recovery

Heads, arguments, replies and room records accept optional literal protocol 1;
an absent value means 1. Same-schema rooms keep their epoch and operation log.
An old schema or changed policy/source rebuilds from the accepted locale draft
on authorized open, with a new epoch, version zero and bounded cleanup of the
old log. It does not republish the document or replay a browser's source copy.

The Studio adapter must preserve the old recovery JSON before reopening. Old
schema recovery can be converted with `readCollaborationRecovery`; same-schema
old epoch/policy recovery needs `collaborationRecoveryToMarkdown`. Conversion is
for deliberate merging and must never automatically overwrite accepted source.

Source writes atomically invalidate the room's source hash. This also fences
A → B → A replacements between requests. Metadata-only saves preserve the room.
The shared writer installs its newly accepted hash in that same transaction.

## Local evidence

The first backend layer passed 45 focused tests (room protocol/migration/retry/
revocation/history, contract validation and scalar collaborative drafts), Convex
typecheck and four generator tests. A separate read-only source review found no
material backend defect. These results are not browser or hosted acceptance.

The disposable authority for this checkout is anonymous and loopback-only. Its
previous `.env.local` and `.convex` remain in ignored owner-only
`.tmp/preservation/before-overnight-2026-09-28`; never copy those accounts into the
new environment. No cloud or production data was changed.
