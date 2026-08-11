# Portable Content Export And Import

`ginko-cms content` exports and imports content through the versioned Ginko Content portable
directory format. Export reads published revisions only. Import writes drafts
only: it never creates collection definitions and never publishes content.

The local resolved Content contract must match the contract installed in the
deployment. Run these commands as an authenticated CMS owner. MCP OAuth callers
and deploy keys cannot use the bulk portability operations.

## Operator Environment

The CLI reads the normal host configuration plus an operator's current Better
Auth session:

```bash
export CONVEX_URL=https://your-deployment.convex.cloud
export CONVEX_DEPLOYMENT=prod:your-deployment-name
export SITE_URL=https://your-cms.example
export GINKO_CMS_SESSION_COOKIE='better-auth.session_token=...'
```

Set `GINKO_CMS_SESSION_COOKIE` in the invoking shell or a secret manager-backed
process environment. Do not commit it or copy it into the portable directory or
plan. The CLI lazily exchanges it once per operator context through the exact
`SITE_URL` host origin. Current CMS membership and capabilities remain
authoritative for every operation; Better Auth session revocation is observed
when the next operator context performs its exchange. Asset byte transfers use
the same authorized context through the CMS host origin.

## Export And Verify

```bash
pnpm exec ginko-cms content export --out ./portable-content
pnpm exec ginko-cms content verify ./portable-content
```

Export refuses an existing destination and captures an immutable roster before
writing. It exports every local collection by default; restrict the scope with
`--collections posts,pages`. The completed directory is verified locally before
the server run is completed.

There is deliberately no working-copy or draft export mode. An export contains
published revision data and the managed image bytes referenced by that frozen
roster. Canonical external HTTPS asset references remain external; they are not
downloaded or converted into managed assets.

## Plan, Review, And Apply An Import

Planning has no draft effects. It verifies the directory, inspects exact current
draft hashes, and seals an immutable server-side plan:

```bash
pnpm exec ginko-cms content import ./portable-content --plan ./import-plan.json
```

Review the printed create/update/skip and asset counts and the plan file. Apply
only that reviewed plan with the separate confirmation command:

```bash
pnpm exec ginko-cms content import --apply ./import-plan.json
```

Keep the plan and its source directory unchanged until the run completes. Apply
revalidates the plan and document hashes locally before any network effect.
Changing the deployment, installed contract, item payload, asset metadata, or
expected current draft hash fails closed instead of overwriting newer work.

Apply writes drafts in dependency order and records idempotent item and terminal
receipts. If the process is interrupted or loses a successful response, run the
same `--apply` command again. Already committed uploads and items replay their
receipts rather than writing twice. Publishing remains a separate normal Studio
workflow.

Inspect a durable run without changing it, or explicitly resume a failed or
interrupted import worker:

```bash
pnpm exec ginko-cms content status <run-id>
pnpm exec ginko-cms content status <run-id> --items failed
pnpm exec ginko-cms content status <run-id> --items blocked
pnpm exec ginko-cms content status <run-id> --items skipped
pnpm exec ginko-cms content status <run-id> --items all
pnpm exec ginko-cms content resume <run-id>
```

Status reports the current phase and generation, item and asset progress,
bounded recent item receipts, retry timing, and the redacted last error. The
optional item filter walks the complete history through indexed 100-row keyset
pages without creating another receipt store. Resume uses the same generation
fence and idempotent receipts as the original apply; it never asks an operator
to edit database rows or discard receipts.

## Current Boundary

- The CLI rejects more than 5,000 localized documents, more than three locales,
  or more than 500 assets before starting a run. The exact limits are accepted;
  limit-plus-one is rejected.
- Only Ginko Content portable directories are accepted. The removed generic
  Markdown/JSON/YAML scanner and caller-provided apply adapter are not retained.
- Imports create or update drafts. Publishing remains a separate normal CMS
  workflow.
- Local PNG, JPEG, GIF, and WebP blobs are hash-addressed, staged once, and
  structurally rewritten to managed CMS asset IDs. Changed or unsupported
  bytes block apply.
- External asset references must already be canonical HTTPS references in the
  portable document.
- Import planning and worker mutations are bounded to 250 items per page. The
  immutable plan binds the source manifest, source and target contracts,
  deployment, scope, item hashes, and expected current draft hashes.
- Export and import require a current owner session and current bulk portability
  permission. Studio and MCP do not expose alternate bulk-write authority.

## Related Pages

- [Changing collections](./changing-collections.md)
- [Contract transition recipes](./contract-transitions/recipes.md)
- [Contract transition recovery](./contract-transitions/recovery.md)
