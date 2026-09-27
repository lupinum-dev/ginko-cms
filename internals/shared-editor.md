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

The Studio adapter preserves the old recovery JSON before reopening. Old
schema recovery can be converted with `readCollaborationRecovery`; same-schema
old epoch/policy recovery needs `collaborationRecoveryToMarkdown`. Conversion is
for deliberate merging and must never automatically overwrite accepted source.

Recovery lives in this tab's session storage under the authenticated principal,
entry and locale. Closing a session flushes its last pending operations to that
original key before a new principal or locale can open. If browser storage
becomes full, the latest copy survives in a tab-lifetime owner under the old key;
transport still closes on forced retirement. Returning as that principal shows
a memory-only warning and requires export before reopening. A reload warning
protects this fallback, but it cannot survive a browser crash or forced exit.
The explicit export-and-reopen action closes the old session, archives its
JSON under the same principal/document/locale ownership, and only then removes
the active pending copy. A browser download click is not evidence that a file
was saved. Archived copies remain downloadable after reopening or remounting,
never replay into a room, and are deduplicated by exact JSON. If archiving fails,
the existing memory fallback retains the latest bytes and reopening stops;
download-only remains usable even when browser storage is full. These copies
last only for the current browser tab/session. Editing controls are disabled per
field so permission loss does not disable recovery download buttons.

Only the installed contract's top-level body field opens a shared room. Nested
richtext and structured-page fields keep their scalar field identity. Both
Studio and the backend use the shared contract resolver for that distinction.
The scalar writer strips the active room's body from its patch and comparison
base. Preview, review, publication and navigation flush the registered editors;
preview responses become obsolete when the draft or publication scope changes.

Source writes atomically invalidate the room's source hash. This also fences
A → B → A replacements between requests. Metadata-only saves preserve the room.
The shared writer installs its newly accepted hash in that same transaction.

## Local evidence

The first backend layer passed 52 focused tests (room protocol/migration/retry/
revocation/history, contract validation and scalar collaborative drafts), Convex
typecheck and four generator tests. A separate read-only source review found no
material backend defect. These results are not browser or hosted acceptance.

The Studio layer has focused Vue/Editor tests for immediate close, principal and
locale switches, revoked edit permission, schema/epoch/policy recovery, explicit
export/reopen, stale preview responses, flush-before-publish, scalar body
exclusion and structured/nested field binding. Current Editor preview `f8887e0`
also passes the CMS late-image-URL repaint tests. These run in jsdom; actual
two-user authentication and browser convergence remain separate acceptance.

The disposable authority for this checkout is anonymous and loopback-only. Its
previous `.env.local` and `.convex` remain in ignored owner-only
`.tmp/preservation/before-overnight-2026-09-28`; never copy those accounts into the
new environment. No cloud or production data was changed.
