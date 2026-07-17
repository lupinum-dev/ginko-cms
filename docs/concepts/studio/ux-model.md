# Studio UX Model

Ginko Studio is an editor-first content operations UI for code-defined Nuxt
websites. It is not a schema builder, database admin, or visual page builder.

## Primary Workflow

The primary Studio loop is:

```txt
open work queue
  -> continue a draft or fix a blocker
  -> review translation readiness
  -> preview website changes
  -> publish with confirmation
  -> verify public output and revalidation state
```

Editors should see website-facing language first. Developer-facing operational
facts stay available, but behind diagnostics disclosure.

## Navigation Model

- Dashboard: work queue, blockers, translations, revalidation, recent
  publishing, and activity.
- Content: collection inventory and entry lists with public-output readiness.
- Entry editor: draft editing, locale readiness, website changes, publish, and
  verification.
- Assets: managed assets with usage-aware destructive actions.
- Content model: read-only collection, field, routing, locale, and public
  behavior inspection.
- Activity: editorial, publish, portability, asset, and revalidation history.
- Settings: members, locales, revalidation targets, MCP, and project settings.

## Vocabulary

Use editor-facing labels in primary UI:

- Content model, not contract.
- Public output, not projection.
- Website changes, not publish impact.
- Affected pages, not paths.
- Readiness issues, not diagnostics, unless in a diagnostics panel.

Use developer-facing labels only in diagnostics:

- Cache tags.
- Events.
- Projection run ids.
- Version ids.
- Outbox/revalidation event ids.

## Product Boundary

Studio may inspect code-defined content model state and operate content
workflows. It must not create, update, delete, import, or reorder schema.

The Nuxt app owns presentation. Studio owns content operations: drafts,
localized content, routes, SEO, navigation placement, assets, versions,
public-output readiness, publishing, revalidation visibility, and activity.

## Related Pages

- [Studio product model](./product-model.md)
- [Studio workflows](./workflows.md)
