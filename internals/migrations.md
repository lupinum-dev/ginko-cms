# Active migrations

## Content and Editor local candidate overrides

- Why it exists: Studio uses the standalone Editor with Content's parser, structured-page and authoring contracts. This disposable integration branch uses unpublished Content beta.10 and Editor 0.1.0 previews. Source checks do not prove registry adoption, a fresh-clone install, B1 acceptance, or merge readiness.
- Introduced: 2026-09-22; supersedes the beta.8 override introduced on 2026-09-09.
- Owner: CMS integration coordinator.
- Depends on it: local source checks, Studio builds, the CMS experience pilot, and packed consumer checks. Host applications consume the built Studio; they do not need to install Editor separately.
- Exact identities: `packages/cms/compatibility.json` records archive hashes and source commits with `local-source-candidate-only` certification. Archives live under ignored `.pack/upstream/`; package manifests retain portable version specifiers.
- Removal condition: after independent review and separately authorized upstream publication, select compatible registry Content and Editor versions, remove both `.pack/upstream` workspace overrides, regenerate the lockfile solely from the registry, and pass source, Studio, packed-consumer and fresh-clone checks against that exact tuple. Repeat collaboration and image acceptance on those installed bytes before B1 can pass. No publication is authorized by this migration entry.
- Rollback: before contract deployment, revert this integration tuple and reinstall the earlier lockfile. After deploying a structured-page contract, first migrate entries using the reviewed contract rollback procedure; do not run an older consumer against unsupported contracts. No persisted document format is migrated by Editor adoption itself.
- Tracking issue: none; autonomous CMS goal and integration acceptance checklist track this local release gate.

### Reproduce the 2026-09-28 local checkpoint

The matching archives are preserved outside the checkout at
`/Users/matthias/Git/_planning/preservation/cms-2026-09-28/upstream/`.
These local files are not a portable dependency source or public registry proof.
They reproduce the backend checkpoint `bf303b3`. Copy them into this checkout's
ignored `.pack/upstream/`. Apply the newer Editor preview below for the current
browser integration, verify SHA-256 against `packages/cms/compatibility.json`, then
run `corepack pnpm install --frozen-lockfile`. Do not run that command in an
unrelated worktree. The original source identities are
Content `49286505140a7df7ef0d4537ad826fcb115b89a1` and Editor
`b88c658d733feb25c6808ecc3ecf83f91d0aa571`:

- `lupinum-ginko-content-1.0.0-beta.10.tgz`: `3e97784303cd5f9aa5da00c530a07d62e401a115aba2585c90ea638bb945ebc5`
- `lupinum-ginko-editor-0.1.0.tgz`: `6c8b9542e8a6875529359bbc16fa6e5dcbf9c4854d302a21ef00be4052fec005`

The browser layer updates Editor to `f8887e0` to refresh images when the stable
host asset provider changes its URL resolver, without aborting pending uploads.
Copy its `lupinum-ginko-editor-0.1.0.tgz` over the original from
`/Users/matthias/Git/_planning/preservation/cms-2026-09-28/upstream-f8887e0/`.
Its SHA-256 is `6f9f592b25285d0ea2ac4daf32591e36f8c22644763432e572dce48de8ea7896`.

Rebuilding from the two source commits is also possible with each repository's
documented build and pack command, but new archive bytes require updating the
recorded integrity, lockfile and checks. Later preview updates must retain this
checkpoint instead of overwriting its preservation directory.

## Draft save concurrency opt-in

- Why it exists: published host adapters, MCP clients and older Studio consumers use aggregate `expectedDraftVersion` plus replacement maps. The new shared editing session supplies `concurrency: { requestId, base, localeDraftIds }` to the same canonical writer; changing old replacement semantics would lose data.
- Introduced: 2026-09-22.
- Owner: CMS editorial domain and its shared editing session.
- Depends on it: existing `saveEntryDraft` clients that omit `concurrency`, including owner tooling and generated host adapters used with older contract versions.
- Removal condition: inventory all supported consumers, migrate each to explicit baselines and stable retry identifiers, then remove the legacy invocation in a reviewed major contract change. Until then the optional argument is an additive public API, not a second datastore.
- Locale identities: the new, unreleased concurrency block includes the actual draft-row IDs exposed by `getEntry`. A removed/recreated language cannot accept queued edits from its former row, even when values match. No data backfill is needed.
- Rollback: old clients continue writing canonical entries and locale drafts; stop sending `concurrency` to return to aggregate version checks. Retain `draftSaveReceipts` while requests may still be retried. Its rows store only member-bound request digests and acknowledgments, never content. Do not drop receipts during a frontend rollback: replaying an old request must not overwrite later work. After authoritative entry deletion, the internal receipt cleanup runs in 256-row batches and rechecks that the entry is missing in every batch. Contentless receipts do not enter the atomic content-deletion inventory; they never expire while the entry exists.
- Tracking issue: none; `plans/2026-09-22-autonomous-cms-goal.md` owns local acceptance.

## Translation review provenance

- Introduced: 2026-09-22. Owner: CMS editorial domain (`entries/translationReview.ts`).
- This is an additive table, not a compatibility writer or content migration. Existing locale drafts are untouched and have unknown provenance until someone chooses a source or explicitly marks independent authorship. Newly copied locale variants record the explicitly chosen source immediately, with unreviewed status; copying never counts as translation review. Imported or recreated locale drafts must be reviewed again; numeric versions alone never transfer approval to a new draft identity.
- `entryTranslationReviews` records immutable source/target snapshots and the exact draft identities and versions that were reviewed. Current readiness is derived from canonical working rows. Source relationships never publish content or block independent locale publication.
- Rollback: restore the previous Studio client while retaining the table/schema and records. Public reads and existing draft writes do not depend on review records. Never convert missing provenance into reviewed status. No reverse data migration is required; re-enabling the client derives current review status again from the retained records.
- Retention: confirmed permanent entry deletion inventories and deletes review snapshots; previews fail closed beyond the existing atomic deletion envelope (40 translation records). The deletion preview also fences these records so a new review invalidates a stale purge confirmation. No automatic history pruning is introduced.
- There is no temporary compatibility path to remove. Review provenance is CMS editorial metadata; the existing portable content format remains unchanged, and importing content starts with unknown provenance rather than claiming an unverifiable review.

## Structured page contract adoption

- Introduced: 2026-09-22. `type: 'page', body: false` is opt-in. Existing article definitions, stored `bodyMdc` strings and public routes keep their behavior; bodyless pages store an empty canonical body and expose `bodyAst: null`.
- Changing an existing article collection to structured fields requires the existing reviewed contract-transition workflow. Direct contract installation rejects that change. Before apply, cancellation leaves the original drafts and contract unchanged.
- Nonempty article text must be preserved explicitly in a named richtext field by the reviewed transition. Bodies containing managed-media references are blocked until an explicit media migration is provided: generic field storage must not hide those references from asset-purge protection or portability.
- Rollback uses an inverse reviewed transition that restores the article body from the preserved field and restores the original contract. The existing transition requirement to unpublish affected entries still applies; active public snapshots are never silently reinterpreted.
- No destructive table migration or duplicate content store is introduced. Empty stored bodies remain the canonical representation for structured pages.

## Local Nuxt esbuild preload

- Why it exists: the pinned Nuxt/Nitro development stack on macOS with Node 24 can fail with `spawn EBADF` when Nitro starts esbuild after Nuxt installs terminal handlers. `scripts/initialize-nuxt-esbuild.cjs` starts Nitro's own service before those handlers, only on that platform/runtime combination.
- Introduced: 2026-09-22. Owner: CMS local development tooling.
- Depends on it: `scripts/dev-playground.mjs`, through its local `--require` and `--no-fork` launch. Consumer and production bundles do not import it.
- Removal condition: the supported pinned Nuxt/Nitro/Node combination starts the normal local Studio and playground reliably without this preload; verify a clean start, authenticated Studio navigation and a development rebuild, then remove the preload file and its invocation together.
- Rollback: remove the preload invocation and return to the standard Nuxt development command on a runtime verified not to exhibit the descriptor failure. It does not change content or persisted state.
- Tracking issue: none; this integration workstream records the local runtime evidence.
