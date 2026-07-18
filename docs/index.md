# Ginko CMS Docs

Ginko CMS is a self-hosted CMS for Nuxt apps that use Ginko Content. The CMS
owns Studio, Convex-backed content operations, assets, publishing, public-read
projections, and MCP workflows. The Nuxt app owns rendering and defines the
content model in code.

Use these docs by reader task:

- New app setup: start with [Quickstart](./getting-started/quickstart.md), then
  [Next collections](./getting-started/next-collections.md) and
  [Environment](./getting-started/environment.md).
- Content model changes: use
  [Changing collections](./guides/changing-collections.md), then the contract
  transition [recipes](./guides/contract-transitions/recipes.md) and
  [recovery guide](./guides/contract-transitions/recovery.md).
- Website reads: use the
  [public content API reference](./reference/public-content-api.md) and
  [Nuxt content provider reference](./reference/nuxt-content-provider.md).
- Product model: read [Positioning](./concepts/positioning.md),
  [Content model](./reference/content-model.md), and
  [Studio workflows](./concepts/studio/workflows.md).
- Auth and roles: use [Auth and roles](./reference/auth-and-roles.md) for the
  Better Auth, CMS member, MCP credential, agent-run, and review-request model.
- Agent workflows: use [MCP agent workflows](./guides/mcp-agent-workflows.md)
  for the current supervised MCP tool surface.
- Release and recovery work: use the
  [release candidate checklist](./maintenance/release-candidate.md) and
  [backup and recovery](./maintenance/backup-and-recovery.md).
- Deployment privacy operations: use the
  [data retention and privacy inventory](./maintenance/data-retention-and-privacy.md).
- Agent-assisted setup or maintenance: use the repo-local
  [Ginko CMS Codex skill](../skills/ginko-cms/SKILL.md).

## File Tree

```text
docs/
  index.md
  getting-started/
    quickstart.md
    next-collections.md
    environment.md
  guides/
    changing-collections.md
    content-portability.md
    mcp-agent-workflows.md
    theming-the-studio.md
    contract-transitions/
      recipes.md
      recovery.md
  reference/
    auth-and-roles.md
    content-model.md
    nuxt-content-provider.md
    public-content-api.md
  concepts/
    cache-invalidation.md
    mdc-body-contract.md
    positioning.md
    relations.md
    tailwind-v4-integration.md
    studio/
      product-model.md
      ux-model.md
      workflows.md
  maintenance/
    backup-and-recovery.md
    convex-component-diagnostics-issue.md
    data-retention-and-privacy.md
    release-candidate.md
skills/
  ginko-cms/
    SKILL.md
    agents/
      openai.yaml
    references/
      setup-and-env.md
      content-contracts-and-transitions.md
      public-content-and-provider.md
      mcp-agent-workflows.md
      operations-and-maintenance.md
      repo-development.md
```

The tree follows the usual Docusaurus docs shape: getting started, guides,
reference, concepts, and maintenance. Do not add empty category pages; add a
page only when it has a real reader task.
