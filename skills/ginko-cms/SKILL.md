---
name: ginko-cms
description: Use when Codex needs to install, configure, debug, document, test, or operate Ginko CMS in a Nuxt app, including @lupinum/ginko-cms, @lupinum/ginko-cms-convex, @lupinum/ginko-content provider setup, generated Convex bridge files, Studio, collection contract sync, migrations, filesystem import, public content reads, backups, release checks, or changes inside the Ginko CMS repository itself.
---

# Ginko CMS

Use this skill to work with Ginko CMS without inventing setup, env vars, bridge
contracts, migration behavior, or public API shape. Ginko CMS is a self-hosted
CMS layer for Nuxt apps using Ginko Content. The host app owns rendering and
code-defined content contracts; Ginko CMS owns Studio, Convex-backed content
operations, publishing, assets, public projections, and MCP workflows.

## Start Here

1. Identify the reader/task before acting:
   - New app setup: read [references/setup-and-env.md](references/setup-and-env.md).
   - Collection/schema/content changes: read
     [references/content-contracts-and-migrations.md](references/content-contracts-and-migrations.md).
   - Website reads or Nuxt provider behavior: read
     [references/public-content-and-provider.md](references/public-content-and-provider.md).
   - MCP agent workflows, content authoring, publishing, media, or diagnostics:
     read [references/mcp-agent-workflows.md](references/mcp-agent-workflows.md).
   - Backups, diagnostics, release, or production recovery: read
     [references/operations-and-maintenance.md](references/operations-and-maintenance.md).
   - Changes inside this repo: read [references/repo-development.md](references/repo-development.md).
2. Choose the source of truth for the workspace:
   - In the Ginko CMS repo, read the canonical docs under `docs/` before
     changing facts.
   - In a host Nuxt app, use these bundled references, installed package source
     or generated bridge files, and the host app's own config/docs. Do not treat
     an unrelated `docs/` directory as Ginko CMS truth.
3. Prefer existing commands and generated bridge paths. Do not add a second
   source of truth for collection contracts, env vars, public API fields, or
   migration state.

## Non-Negotiable Model

- Keep `content.config.ts` or `ginkoCms.collections` as the source of truth for
  the content model.
- Prefer `content.config.ts` when the app uses Ginko Content. Use
  `ginkoCms.collections` or `collectionsDir` only when that is already the app's
  direct CMS contract path.
- Run collection contract changes through `pnpm exec ginko-cms push --check`
  before pushing.
- Treat generated Convex bridge files as host-owned generated glue after
  `ginko-cms init`; do not move CMS policy into bridge files.
- Use `CONVEX_DEPLOY_KEY` for contract sync/admin CLI operations and a matching
  forwarding key in both the app/server environment and Convex deployment.
- Do not claim the Nuxt provider reads drafts. It reads published public Convex
  projections.
- Do not claim backup CLI commands are headless deploy-key operations. Backup
  actions require CMS owner identity.
- Treat real sign-in provider configuration as host-owned Better Auth work in
  `convex/auth.config.ts`; do not invent OAuth or production auth details.

## Common Workflows

### Set Up A Host App

Read [references/setup-and-env.md](references/setup-and-env.md). The setup path
is install packages, define at least one collection, run `ginko-cms init`, make
Convex URL/deploy key/forwarding key/first owner available, deploy generated
Convex files, then run `ginko-cms push` and `ginko-cms push --check`.

### Change Collections Or Routes

Read
[references/content-contracts-and-migrations.md](references/content-contracts-and-migrations.md).
Start with `ginko-cms push --check`. Push only after the check reports safe
drift. If the guard reports migration-required drift, transform stored content
first and rerun the check before pushing.

### Use Published Content In Nuxt

Read [references/public-content-and-provider.md](references/public-content-and-provider.md).
Use the Ginko Content provider configuration, `NUXT_PUBLIC_CONVEX_URL` for
browser/server provider reads, and `CONVEX_URL` only as the server-side
fallback. Missing URL config fails with `provider_config_missing`.

### Work Through MCP

Treat MCP as a remote control over Studio-backed CMS operations. Use direct CMS
tools, inspect collection capability first, preview publish/destructive actions
before execution, and execute only after explicit user confirmation with the
returned token.

Read [references/mcp-agent-workflows.md](references/mcp-agent-workflows.md)
before advising or changing MCP authoring, publishing, media, diagnostics, or
destructive flows.

### Modify This Repository

Use Corepack pnpm. Run focused tests while working, then run the broader gate
before handoff when touching docs, package metadata, bridge generation, Convex
auth, Studio workflow, MCP, or release scripts.

```bash
corepack pnpm run check
corepack pnpm run release:verify
```

If nested workspace scripts resolve the wrong `pnpm`, use a temporary wrapper
that delegates to Corepack, then rerun the same command.

## Documentation Rules

- Ground every docs claim in source, tests, generated files, or current docs.
- Prefer linking to the canonical docs under `docs/` over copying long reference
  sections.
- State limitations plainly: no backup import command, no provider draft reads,
  no current public-query partition by `GINKO_CONTENT_PROVIDER_SITE`, and no
  headless hard-cutover path when collection drift remains unsafe.
- Keep examples runnable and include hidden setup: packages, env vars, bridge
  generation, Convex deploy/dev, push, and first-owner setup when relevant.

## Validation

For skill changes, run:

```bash
python3 /Users/matthias/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/ginko-cms
```

For repo changes, prefer:

```bash
corepack pnpm run format:check
corepack pnpm exec eslint packages test
corepack pnpm run check
```
