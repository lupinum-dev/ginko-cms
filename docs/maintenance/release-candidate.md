# Release Candidate Checklist

Use this checklist before publishing Ginko CMS packages that include runtime,
component, contract, or host integration changes. The goal is one repeatable
path from local packages to a clean consumer app.

## Release Stack

The release stack is recorded in `packages/cms/compatibility.json`. Treat that
file as the canonical package tuple; do not copy version tables by hand into
release notes.

Publish order is fixed: Content, CMS Contract, CMS Convex, then CMS.
`better-convex-nuxt` must already be available at the compatibility-matrix
version. Do not use recursive workspace publishing from this repo; the workspace
includes sibling checkouts for local development.

## Maintainer Release Gate

Run the package release gates from the Ginko CMS workspace:

```bash
pnpm run release:notes
pnpm run candidate:pack
GINKO_CONTENT_TARBALL=/absolute/path/to/ginko-content.tgz \
BETTER_CONVEX_NUXT_TARBALL=/absolute/path/to/better-convex-nuxt.tgz \
pnpm run release:verify:candidate
```

`candidate:pack` requires the clean upstream commits and hashes recorded in
`packages/cms/compatibility.json`, then packs the three CMS packages twice and
rejects any archive or content-manifest difference. Candidate verification
installs those exact artifacts, takes expected hashes only from compatibility,
and rejects workspace or link resolution. Review
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
