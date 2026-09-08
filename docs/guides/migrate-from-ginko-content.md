# Migrate From File-Backed Ginko Content

> **Status:** This workflow is available in the next Ginko CMS candidate. It is limited to verified
> local targets until the separate production procedure below is implemented and reviewed.

The migration keeps the existing file-backed site authoritative until imported drafts, reviewed
publications, and the real site's rendered output have passed acceptance. It reuses the Ginko
Content portable manifest, Ginko CMS import plan and receipts, and normal publication operations.
It does not introduce a second migration database or a hybrid content provider.

## Entry Point

Run the workflow from the existing Nuxt application. Use the project's package runner; for example,
Vite+ applications use `vp exec` and pnpm applications use `pnpm exec`:

```bash
pnpm exec ginko-cms migrate from-content . \
  --target local
```

The default invocation performs every safe pre-effect step that is currently missing from the
separate low-level commands:

1. calls the public Ginko Content filesystem assessment;
2. reports all incompatibilities together, with the source file, field, and resolution;
3. exports a verified portable v1 directory only when the assessment has no errors;
4. verifies that the selected deployment is explicitly nonproduction, has the matching installed
   contract, and recognizes the signed-in operator as a current CMS owner; and
5. creates an immutable draft-import plan and writes a redacted, derived local evidence file.

`--target local` is a selector, not the target identity. It resolves the deployment URL and
deployment ID from the normal local Convex configuration, then records those exact values and the
installed contract hash in the server import plan. Every write and resume revalidates them. The
workflow refuses a production deployment and refuses conflicting environment and local selectors.
It never trusts a caller-provided `nonproduction` label as proof of isolation.

The command prints the exact create, update, skip, asset, locale, and collection counts. It exits
without writing drafts or publishing content. The evidence file contains hashes, run identifiers,
paths, and summaries. It never contains a session cookie, password, deploy key, or asset bytes.
Its deterministic default is `.ginko/migrations/from-content.json`; `--evidence <file>` is needed
only for parallel or intentionally named migrations. The migration directory is private,
owner-readable, ignored by Git, and contains portable data and derived evidence. An existing file
for a different source, target, or run is a conflict, not an invitation to overwrite it.

After review, use the same entry point for the effectful phases:

```bash
pnpm exec ginko-cms migrate from-content --apply

pnpm exec ginko-cms migrate from-content --publish-preview

pnpm exec ginko-cms migrate from-content --publish <publication-sha256>

pnpm exec ginko-cms migrate from-content --status
```

`--apply` imports drafts through the existing immutable import plan and idempotent receipts.
`--publish-preview` pages through the complete imported revision set, records each exact entry ID,
locale, version, and draft hash in the evidence file, and prints its deterministic SHA-256 approval
value. `--publish <publication-sha256>` starts or resumes
that exact set. For each remaining entry, the CLI obtains and immediately redeems the normal
per-entry operation confirmation after revalidating the draft. The approval binds the target,
portable manifest, import plan, exact entry IDs and draft revision hashes. A newer edit makes the
stale item fail closed; the command never substitutes the newer draft or publishes unrelated
drafts. The non-secret evidence contains the approved set; existing publication state proves which
items completed. The same approval hash resumes without asking for approval again. A changed set
requires a new preview.
`--status` derives remaining work from the authoritative import and operation receipts and current
entry publication state.

For a fresh Content-only checkout, run `ginko-cms init` first. The migration then synchronizes its
generated setup files, validates them, and starts the supported Better Convex local setup when no
deployment is configured. It does not replace or reset an existing configured target. If no safe
local target can be selected, it fails with a concrete diagnostic and makes no remote change.

When target setup is ready, the command opens the normal Studio sign-in URL in the browser. After
the owner signs in and verifies the email, a one-time loopback callback relays the existing
short-lived operator Convex token to the waiting CLI. The callback accepts only the generated nonce
on loopback, holds the token in memory, and then closes. This composes the existing Better Auth
session and operator-token endpoint: it does not copy cookies, accept passwords in the CLI, persist
tokens, or create another identity authority. This workflow accepts only browser authorization; it
does not accept a configured noninteractive session.

## First Run And Retry

The first run must finish local assessment before it contacts the target. A failed assessment does
not create an export directory, remote plan, or remote content. Fix the listed source issues and run
the same command again.

Remote planning may create the existing server-side immutable plan rows and receipts, but it has no
draft or publication effect. An interrupted import reuses the existing plan and run ID. Already
committed documents and assets replay their receipts. An interrupted publication compares the
approved revision set with current
draft and published revisions, skips exact completed publications, and continues only unchanged
pending items. No command overwrites an edit made after review.

When the source files, resolved contract, selected target, or portable directory changes, preserve
the old evidence for diagnosis and start a new plan with `--evidence <new-file>`. The command never
silently overwrites evidence that approved another source snapshot or target.

## Failure Contract

The command uses these exit statuses:

- `0`: requested phase completed, including a fully compatible assessment or an idempotent retry;
- `2`: local source or contract incompatibility; no remote effect occurred;
- `3`: target, identity, membership, or permission preflight failed before the requested effects;
- `4`: reviewed evidence is stale because the source, contract, target, plan, or draft revision
  changed; and
- `1`: unexpected, interrupted, or partial execution. Every partial result prints committed,
  remaining, and conflicted counts, and `--status` reports the usable resume point.

The no-effect guarantee applies only to a failed local assessment or failed preflight before a
batch starts. Permission loss, stale revisions, or transport failure during an apply or publish may
occur after earlier bounded items committed; the result never describes that case as no-effect.

Diagnostics must not claim that static analysis proves arbitrary application queries are compatible.
They cover canonical Content semantics and the provider capabilities declared by the resolved
contract. The real consumer verifies application-specific query and render parity.

The workflow fails rather than silently dropping or changing:

- unsupported Markdown/MDC syntax or component semantics;
- collection identities, canonical keys, locale routes, parent relations, or ordering;
- navigation, search, sitemap, or visibility behavior;
- managed asset bytes or metadata; and
- literal code examples that happen to contain Markdown or component-like text.

The existing Content configuration remains the source of truth. The workflow does not assume a
default locale, slug layout, source directory, or application route convention.

## Target And Authentication

Migration accepts only an actual deployment verified as nonproduction. Normal `ginko-cms init`,
contract push, and deployment checks remain authoritative; the migration entry point composes their
diagnostics instead of creating an alternate setup path.

The operator signs in through the opened Better Auth browser flow and must have a current owner
membership. Expired identity, missing email verification, wrong deployment, and insufficient
permission are distinct preflight failures.

## Acceptance And Cutover

Before provider activation, verify a small two-locale fixture and the real site. Compare identities,
locales, relations, routes, navigation, search, sitemap, component bodies, assets, draft denial,
published updates, and the site's rendered public output. An ordinary supported site migration
should mainly change dependencies, setup, and the provider selection; it should not require query,
component, or routing rewrites.

Before production cutover, run an isolated application instance whose single global provider is
`cms` and whose target is the imported nonproduction deployment. Compare it with a separate source
instance whose single provider remains filesystem-backed. There is no mixed provider inside either
environment.

The local target proves migration behavior only. It is not an artifact that can be promoted to
production: deployment IDs, imported entry IDs, draft versions, and the publication approval hash
are target-specific.

A future reviewed production cutover must therefore be a fresh operation:

1. freeze file-backed content edits and record the freeze owner and time;
2. export and verify a fresh final source snapshot;
3. select the exact production deployment and installed contract, then prove backup and restore;
4. create a new production import plan and publication approval hash against that target;
5. import drafts, review them, and publish only the approved revisions;
6. switch the application's single provider to `cms` in a separate deliberate change; and
7. verify public output before ending the freeze.

If verification fails before the provider switch, keep filesystem content authoritative and repair
or discard the production drafts. After the switch, roll back the provider only if no CMS edits
have occurred. If editors have changed CMS content, export those changes first and choose an
explicit roll-forward or content reconciliation; blindly switching back would lose their work.
Keep the source tree and verified portable backup until cutover acceptance. The current migration
command does not authorize this production sequence, delete source files, enable a hybrid fallback,
dual-write, or switch a provider.

## Underlying Authorities

The composed workflow keeps these existing boundaries authoritative:

- Ginko Content owns filesystem assessment, normalization, contract semantics, and portable export;
- the portable v1 manifest and hashes bind the exported source;
- the Ginko CMS import plan and receipts bind and resume draft effects;
- Ginko CMS entry revisions and publication operations bind publish approval and progress; and
- the consumer application owns rendered public parity and the final provider cutover.

The lower-level `ginko-content portable` and `ginko-cms content` commands remain supported for
diagnosis and advanced operation. The migration entry point is not a cosmetic alias: it adds
aggregated assessment, target/auth preflight, evidence binding, resumable reviewed publication, and
one coherent status report.
