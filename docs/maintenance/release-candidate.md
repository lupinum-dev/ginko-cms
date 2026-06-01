# Release Candidate Checklist

Use this checklist before publishing Ginko CMS packages that include runtime,
bridge, contract, or Trellis integration changes. The goal is one repeatable
path from local packages to a clean consumer app.

## Release Stack

The release stack is recorded in `packages/cms/compatibility.json`. Treat that
file as the canonical package tuple; do not copy version tables by hand into
release notes.

Publish order is fixed: Content, Trellis, Trellis Bridge, CMS Contract, CMS
Convex, then CMS. Do not use recursive workspace publishing from this repo; the
workspace includes sibling checkouts for local development.

## Maintainer Release Gate

Run the package release gates from the Ginko CMS workspace:

```bash
pnpm run release:notes
pnpm run release:verify
```

After Trellis and Ginko Content release candidates are available from the
registry, also run:

```bash
pnpm run release:verify:registry
```

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
FORWARDING_KEY="$(openssl rand -base64 32)"
printf "\nCONVEX_IDENTITY_FORWARDING_KEY=%s\n" "$FORWARDING_KEY" >> .env.local
pnpm exec convex env set CONVEX_IDENTITY_FORWARDING_KEY "$FORWARDING_KEY"
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
- Publish or destructive preview flows work when the deployment exposes MCP
  destructive operations.

## Required Environment

The Nuxt app or server environment must provide:

```bash
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=prod:...
GINKO_FIRST_OWNER_EMAIL=owner@example.com
CONVEX_IDENTITY_FORWARDING_KEY=long-random-secret
# or:
GINKO_CMS_COMPONENT_FORWARDING_KEY=long-random-secret
```

`CONVEX_DEPLOY_KEY` is the Convex admin key used by setup and server operations.
The identity-forwarding key signs Ginko CMS bridge envelopes so generated host
functions can trust the CMS caller context. Do not expose either value through
`NUXT_PUBLIC_*`.

## Collection Contract Drift

`ginko-cms push` must fail when a collection has existing entries and the
code-defined contract changes fields, routing, locale shape, or type. That is
intentional: existing entries may not validate or project correctly after the
change.

Use this command to inspect drift:

```bash
pnpm exec ginko-cms push --check
```

For production or shared staging data, preserve a verified backup through an
owner-authenticated operator workflow and plan an explicit content migration
before pushing the new contract. Push only after `ginko-cms push --check` reports
safe drift. Do not clear CMS tables to force the push through.

For disposable local development only, a full CMS content reset is acceptable
after confirming the data can be discarded. Keep auth/member state separate
unless the test requires a completely fresh deployment.

For the user-facing workflow, safe/unsafe change matrix, migration recipes, and
recovery notes, see
[Changing collections](../guides/changing-collections.md),
[Migration recipes](../guides/migrations/recipes.md), and
[Migration recovery](../guides/migrations/recovery.md). For backup semantics,
see [Backup and recovery](./backup-and-recovery.md).
