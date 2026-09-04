# Release Candidate Checklist

Use this checklist before publishing Ginko CMS packages that include runtime,
component, contract, or host integration changes. The goal is one repeatable
path from local packages to a clean consumer app.

## Release Stack

The release stack is recorded in `packages/cms/compatibility.json`. Treat that
file as the canonical package tuple; do not copy version tables by hand into
release notes.

Publish order is fixed: Content, CMS Contract, CMS Convex, then CMS.
The complete Better Convex Nuxt, Vue, and MCP family must already be available
at the compatibility-matrix versions. Do not use recursive workspace publishing
from this repo; the workspace includes sibling checkouts for local development.

Ordinary CI separately checks out the exact `sourceRehearsal` Better Convex
commit for the packed-source consumer. The root install stays frozen against
the registry-backed lockfile. That proves current-source compatibility without
an install override; it does not create, approve, or replace an immutable
release candidate.

The earlier Better Convex rehearsal tuples are superseded. RC.2 is source-tested
against the Nuxt/Vue beta.3 commit recorded in the compatibility authority.
The authority records the published registry URLs, per-artifact provenance
commits, hashes, integrity values, and Nuxt runtime fingerprint. The MCP beta
comes from an earlier source commit than the Nuxt/Vue pair; this is explicit
provenance, not a shared-source assumption.

The coordinated runtime uses exactly Nuxt `4.5.2`, Vite `8.1.5`, and Vue
`3.5.40`. Clean pnpm and strict npm consumers are both mandatory. Never use
`--legacy-peer-deps`, `--force`, relaxed peer checks, or an override.

The corrected `@napi-rs/wasm-runtime@1.2.1` has aged through the mandatory
24-hour supply-chain policy. No release-age exclusion is retained for Better
Convex or the WASM runtime. Both clean consumers must resolve the corrected
graph under their ordinary strict policies.

The former `unctx@3.0.0` / `unplugin@1.16.1` failure was traced to Ginko
implicitly installing `nuxt-i18n-micro` as a production dependency. That hidden
host-runtime ownership was deleted: Ginko bundles its Studio dictionaries, and
host apps explicitly install any optional site localization module they choose.
Do not inject consumer dependencies, override peers, or weaken strict resolution
to make either consumer gate pass.

## Maintainer Release Gate

The canonical hosted gate is `.github/workflows/release-candidate.yml`, triggered
manually or by a `v*-*` prerelease tag. It downloads upstream registry artifacts,
packs Ginko once, verifies the uploaded bytes with mandatory pnpm and strict
npm. Manual runs stop there so their immutable artifact can undergo the full
local live proof. Only an approved annotated tag enters the tag-restricted
`ginko-release` environment for disposable Convex staging. Tag runs then
publish the original contract, Convex, and CMS archives sequentially through
OIDC under `next-staging`, download them again, and compare all three registry
archives byte for byte. No job repacks.

Use the manual workflow first. Download its `ginko-candidate-<commit>`
artifact, run and finalize the full disposable live proof against those exact
bytes, and retain the resulting proof directory. Publication tags must be
annotated and bind both files:

```bash
candidate_sha256="$(shasum -a 256 .pack/candidate/candidate-artifact.json | awk '{print $1}')"
proof_path="reports/refactor-proof/$(git rev-parse --short=12 HEAD)/live/proof.json"
proof_sha256="$(shasum -a 256 "$proof_path" | awk '{print $1}')"
git tag -a v0.2.0-rc.2 -m "Ginko RC.2 approval

candidate-artifact-sha256: ${candidate_sha256}
live-proof-sha256: ${proof_sha256}"
git push origin v0.2.0-rc.2
```

The tag workflow deterministically recreates the candidate and refuses to
publish unless its complete candidate manifest matches the approved hash.
Lightweight tags, changed candidate bytes, or missing live-proof bindings fail
closed.

For an equivalent local rehearsal, run the package release gates from the Ginko
CMS workspace:

```bash
pnpm run release:notes
pnpm run candidate:pack
pnpm run release:verify:candidate
```

`candidate:pack` requires the clean upstream commits and hashes recorded in
`packages/cms/compatibility.json`, then packs the three CMS packages twice and
rejects any archive or content-manifest difference. Candidate verification
installs those exact artifacts, takes expected hashes only from compatibility,
resolves the recorded tarball names from `.pack/candidate`, and rejects workspace
or link resolution. Review
`.pack/candidate/candidate-artifact.json` and the generated release evidence.

After Ginko Content release candidates are available from the
registry, also run:

```bash
pnpm run release:verify:registry
```

For the greenfield reliability refactor, the additional disposable-deployment,
exact packed-consumer, role-account, target-scale, performance, and cleanup
contract is documented in
[Refactor reliability certification](./refactor-certification.md). The live
lane fails if its Browser base URL cannot attest the exact tarball tuple.

For a private consumer app drill, run the foundation gate with the consumer app
root and browser smoke credentials in the same command:

```bash
GINKO_CMS_CONSUMER_ROOT=/path/to/app \
GINKO_CMS_TEST_EMAIL=owner@example.com \
GINKO_CMS_TEST_PASSWORD=replace-me \
pnpm run foundation:verify -- --release
```

Release mode requires the browser smoke credentials and fails on known bad
consumer build output, including unsupported content query operators, unhandled
request errors, provider body conversion failures, invalid sort errors, and
collection contract sync failures.

## Staging App Drill

For a clean staging app, run these commands in order:

```bash
pnpm install
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
pnpm exec convex deployment token create ginko-cms-staging-admin --save-env .env.local
pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL owner@example.com
pnpm exec ginko-cms deploy
pnpm exec ginko-cms deploy --check
pnpm run typecheck
pnpm run build
```

Then open Studio and verify:

- `/studio` loads without a server error.
- The configured test user can register or sign in.
- The Studio shell shows configured collections.
- Test entries can be created for the configured collections, including at
  least one relation field and one rich body field when the app defines them.
- Reopening the entries shows the saved values.
- Publish, unpublish, archive, restore, and rollback use the Studio guarded
  preview/confirm/execute flow. MCP has no direct public-output or destructive
  operation path.

## Required Environment

The Nuxt app or server environment must provide:

```bash
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=prod:...
GINKO_FIRST_OWNER_EMAIL=owner@example.com
```

`CONVEX_DEPLOY_KEY` is the Convex admin key used by setup and collection
contract sync. Do not expose it through `NUXT_PUBLIC_*`.

## Collection Contract Drift

`ginko-cms push` must fail when a collection has existing entries and the
code-defined contract changes fields, routing, locale shape, or type. That is
intentional: existing entries may not validate or project correctly after the
change.

Use this command to inspect drift:

```bash
pnpm exec ginko-cms push --check
```

For production or shared staging data, create and verify an official Convex
deployment backup before risky contract work. Presentation-only and compatible
content changes may install directly when `ginko-cms push --check` reports them
safe. Content-incompatible changes must use the bounded owner-only contract
transition workflow; do not clear CMS tables to force a push through.

For a transition, explicitly unpublish affected live entries, then stage,
inspect, apply, and atomically activate the exact run:

```bash
pnpm exec ginko-cms contract transition stage ginko/transitions/<file>.ts --yes
pnpm exec ginko-cms contract transition status <run-id>
pnpm exec ginko-cms contract transition apply <run-id> --yes
pnpm exec ginko-cms contract transition activate <run-id> --yes
```

Studio writes remain locked from staging through activation. A run can be
cancelled only before apply begins; after that point it is resume-only.

For disposable local development only, a full CMS content reset is acceptable
after confirming the data can be discarded. Keep auth/member state separate
unless the test requires a completely fresh deployment.

For the user-facing workflow, safe/unsafe change matrix, transition recipes,
and recovery notes, see
[Changing collections](../guides/changing-collections.md),
[Contract transition recipes](../guides/contract-transitions/recipes.md), and
[Contract transition recovery](../guides/contract-transitions/recovery.md). For recovery boundaries,
see [Backup and recovery](./backup-and-recovery.md).
