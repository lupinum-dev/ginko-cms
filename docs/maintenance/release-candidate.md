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
commit, packs temporary tarballs, and deletes them with the runner. That proves
current-source compatibility only. It does not create, approve, or replace an
immutable release candidate.

The earlier Better Convex rehearsal tuples are superseded. RC.2 consumes the immutable
beta.28/beta.16 candidate bytes and Nuxt runtime fingerprint recorded in the
compatibility authority. Those Better packages must be published under
`next-staging` before the Ginko tag workflow starts.

The coordinated runtime uses exactly Nuxt `4.5.1`, Vite `8.1.5`, and Vue
`3.5.40`. RC.2 support is pnpm-first. The clean pnpm consumer remains mandatory.
The strict npm consumer is observational for RC.2: success is accepted, and
only the already reproduced Oxc/`@emnapi` resolution failure is accepted as a
known limitation. Any other npm failure blocks publication. Never use
`--legacy-peer-deps`, `--force`, relaxed peer checks, or an override.

Publication is blocked by the mandatory strict pnpm consumer. With Nuxt `4.5.1`
and Vite `8.1.5`, the fresh graph resolves `@napi-rs/wasm-runtime@1.2.0` beside
the incompatible `@emnapi/*@1.11.x` versions pinned by Rolldown/Oxc. A separate
isolated `@nuxt/kit` context resolves `unctx@3.0.0` beside
`unplugin@1.16.1`, outside its `^3.3.0` peer range. Upstream has published the
corrected wasm runtime `1.2.1`, but the 24-hour supply-chain policy does not
select it yet. Do not inject consumer dependencies, override peers, or weaken
strict resolution to make this gate pass.

## Maintainer Release Gate

The canonical hosted gate is `.github/workflows/release-candidate.yml`, triggered
manually or by a `v*-*` prerelease tag. It downloads upstream registry artifacts,
packs Ginko once, verifies the uploaded bytes with mandatory pnpm and
observational strict npm, and then enters the tag-restricted `ginko-release`
environment for disposable Convex staging. Tag runs publish the original
contract, Convex, and CMS archives sequentially through OIDC under
`next-staging`, then download and compare all three registry archives byte for
byte. No job repacks.

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
