# Studio Product Model

Ginko Studio is a content operations UI for code-defined websites. It is not a
schema builder.

The UI is editor-first. It should frame work around drafts, translations,
readiness, website changes, publishing, affected pages, and public output. Raw
projection, cache, outbox, and version identifiers belong in developer
diagnostics, not in the primary editing path.

## Rules

- Collection definitions live in application code.
- Studio inspects only the installed `cmsContract` resolved from code.
- Studio edits content, localized content, routes, SEO, navigation placement, assets, drafts, versions, and publish state.
- Studio does not create, update, delete, import, or reorder collection schema.
- MCP follows the same rule: agents may inspect contracts and operate content workflows, but they do not mutate schema or config.
- Owner-CLI portability imports apply content under the installed code-defined
  contract.
- Unknown collections, unknown fields, unresolved assets, and unresolved relations are reported as blockers or warnings. They never create schema implicitly.
- Public website reads use active public-output rows only.
- Draft saves, CLI portability plans, and readiness previews never change public
  output.
- Publishing creates immutable published versions and activates public output atomically.

## What Studio Owns

Studio owns editor-facing workflows:

- browse collections and entries
- edit shared and localized fields
- edit MDC body content
- create and update locale variants
- inspect public visibility diagnostics
- preview website changes
- publish, unpublish, archive, restore drafts, and roll back published versions with explicit confirmation
- inspect delegated agent runs and review requests
- approve or reject review-gated agent public-output changes when the current
  role allows it
- inspect active public-output state

Filesystem portability is intentionally outside Studio. Owners validate, plan,
apply, inspect, and resume bounded content imports through the CLI.

## What Code Owns

Application code owns content contracts:

- collection slugs and labels
- route-backed versus data-only capability
- field definitions
- field layout hints
- validation rules
- locales
- route settings
- public profiles
- search, sort, filter, sitemap, and navigation flags

When the code contract changes, the host app installs one read-only
`cmsContract` with separate content and presentation hashes. Studio shows the
installed state and mismatch diagnostics; a mismatch remains readable but
blocks editorial writes.

## Editor Mental Model

Editors should not need to know Convex tables, projections, or provider internals. The Studio workflow is:

```txt
open work queue
  -> edit draft
  -> review locale readiness
  -> preview website changes
  -> publish with confirmation
  -> verify active public output and revalidation state
```

If content is not public, Studio must explain why with actionable diagnostics.

If content is public, Studio must make clear which public output currently feeds the website.

## Related Pages

- [Studio UX model](./ux-model.md)
- [Studio workflows](./workflows.md)
