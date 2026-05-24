# Release Candidate Checklist

Use this checklist before publishing Ginko CMS packages that include runtime,
bridge, contract, or Trellis integration changes. The goal is one repeatable
path from local packages to a clean consumer app.

## Release Stack

| Package                       | Version |
| ----------------------------- | ------: |
| `@lupinum/ginko-cms`          | `0.1.0` |
| `@lupinum/ginko-cms-convex`   | `0.1.0` |
| `@lupinum/ginko-cms-contract` | `0.1.0` |
| `@lupinum/ginko-content`      | `0.1.0` |
| `@lupinum/trellis`            | `0.1.0` |
| `@lupinum/trellis-bridge`     | `0.1.0` |

Publish order is fixed: Content, Trellis, Trellis Bridge, CMS Contract, CMS
Convex, then CMS. Do not use recursive workspace publishing from this repo; the
workspace includes sibling checkouts for local development.

## Maintainer Release Gate

Run the full foundation gate from the Ginko CMS workspace:

```bash
GINKO_CMS_TEST_EMAIL=owner@example.com \
GINKO_CMS_TEST_PASSWORD=replace-me \
pnpm run foundation:verify -- --release
```

Choose a private consumer app explicitly when running the foundation gate. The
OSS repo does not name or require any private app:

```bash
GINKO_CMS_CONSUMER_ROOT=/path/to/app pnpm run foundation:verify -- --release
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
pnpm exec convex dev --once --typecheck disable --tail-logs disable
pnpm exec ginko-cms push
pnpm exec ginko-cms push --check
pnpm run typecheck
pnpm run build
```

Then open Studio and verify:

- `/studio` loads without a server error.
- The configured test user can register or sign in.
- The Studio shell shows configured collections.
- An author can be created.
- A post can be created with image metadata, author relation, date, title,
  description, body, and badge.
- Reopening the post shows the saved values.
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

For production or shared staging data, plan an explicit content migration before
pushing the new contract. Do not clear CMS tables to force the push through.

For disposable local development only, a full CMS content reset is acceptable
after confirming the data can be discarded. Keep auth/member state separate
unless the test requires a completely fresh deployment.

For the user-facing workflow, safe/unsafe change matrix, migration recipes, and
recovery notes, see [`changing-collections.md`](./changing-collections.md),
[`migration-recipes.md`](./migration-recipes.md), and
[`migration-recovery.md`](./migration-recovery.md).
