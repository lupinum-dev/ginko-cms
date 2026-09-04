---
name: ginko-cms
description: Use when Codex needs to install, configure, debug, document, test, or operate Ginko CMS in a Nuxt app, including @lupinum/ginko-cms, @lupinum/ginko-cms-convex, @lupinum/ginko-content provider setup, host-owned Convex setup files, Studio, installed-contract sync and transitions, owner-CLI content portability, public content reads, recovery boundaries, release checks, or changes inside the Ginko CMS repository itself.
---

# Ginko CMS

Use this skill to work with Ginko CMS without inventing setup, env vars, bridge
contracts, transition behavior, or public API shape. Ginko CMS is a self-hosted
CMS layer for Nuxt apps using Ginko Content. The host app owns rendering and
code-defined content contracts; Ginko CMS owns Studio, Convex-backed content
operations, publishing, assets, public projections, and MCP workflows.

## Start Here

1. Identify the reader/task before acting:
   - New app setup: read [references/setup-and-env.md](references/setup-and-env.md).
   - Collection/schema/content changes: read
     [references/content-contracts-and-transitions.md](references/content-contracts-and-transitions.md).
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
3. Prefer existing commands and generated setup paths. Do not add a second
   source of truth for collection contracts, env vars, public API fields, or
   transition state.

## Non-Negotiable Model

- Keep `content.config.ts` or `ginkoCms.collections` as the source of truth for
  the content model.
- Prefer `content.config.ts` when the app uses Ginko Content. Use
  `ginkoCms.collections` or `collectionsDir` only when that is already the app's
  direct CMS contract path.
- Run collection contract changes through `pnpm exec ginko-cms push --check`
  before pushing.
- Treat generated Convex setup files and root adapters as host-owned glue after
  `ginko-cms init`; do not move CMS policy into those files.
- Use `CONVEX_DEPLOY_KEY` only for contract sync and other admin CLI transport.
  Runtime identity comes from Better Auth through `@lupinum/better-convex-nuxt`.
- Do not claim the Nuxt provider reads drafts. It reads published public Convex
  projections.
- Database disaster recovery uses official Convex Backup & Restore. Content
  portability is an owner-session CLI workflow, and permanent asset purge uses
  a separate verified recovery artifact.
- Treat real sign-in provider configuration as host-owned Better Auth work in
  `convex/auth.config.ts`; do not invent OAuth or production auth details.

## Common Workflows

### Set Up A Host App

Read [references/setup-and-env.md](references/setup-and-env.md). The setup path
is install packages, define at least one collection, run `ginko-cms init`, make
Convex URL/site URL/deploy key/Better Auth secret/first owner available, then
run `ginko-cms deploy` and `ginko-cms deploy --check`.

### Change Collections Or Routes

Read
[references/content-contracts-and-transitions.md](references/content-contracts-and-transitions.md).
Start with `ginko-cms push --check`. Push only after the check reports safe
drift. If the guard reports content-incompatible drift, use the owner-only
`ginko-cms contract transition` stage/status/apply/activate workflow. Do not add
an old/new compatibility path.

### Use Published Content In Nuxt

Read [references/public-content-and-provider.md](references/public-content-and-provider.md).
Use the Ginko Content provider configuration, `NUXT_PUBLIC_CONVEX_URL` for
browser/server provider reads, and `CONVEX_URL` only as the server-side
fallback. Missing URL config fails with `provider_config_missing`.

### Work Through MCP

Treat MCP as supervised draft preparation. Agents may read content, edit drafts,
preview impact, and request review; they cannot publish, archive, restore,
delete, purge, or run content portability directly. A publisher or owner
approves a pinned review through the canonical operation path.

Read [references/mcp-agent-workflows.md](references/mcp-agent-workflows.md)
before advising or changing MCP authoring, publishing, media, diagnostics, or
destructive flows.

### Modify This Repository

Use Corepack pnpm. Run focused tests while working, then run the broader gate
before handoff when touching docs, package metadata, host setup generation, Convex
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
- State limitations plainly: no application-level database restore, no provider
  draft reads, no Studio or MCP portability writes, and no direct agent
  public-output operations.
- Keep examples runnable and include hidden setup: packages, env vars, host setup
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
