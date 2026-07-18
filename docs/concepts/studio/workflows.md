# Studio Workflows

Ginko Studio is the authenticated human editing surface for Ginko CMS. It is a
content operations UI for code-defined websites, not a schema builder.

For the product boundary, see [Studio product model](./product-model.md). For
the editor-facing UI model and vocabulary, see [Studio UX model](./ux-model.md).

## Workflow Principles

- Show collection contracts as read-only app-defined truth.
- Let editors operate content, routes, SEO, navigation, assets, drafts, versions,
  publish state, and site data.
- Explain why content is or is not public.
- Keep public-output facts visible before publishing.
- Share operation and diagnostic semantics with MCP where possible.
- Keep advanced terms like projection, bridge, contract, cache tags, and outbox
  ids out of the primary editing path unless the user is inspecting developer
  diagnostics.

## Entry Editing

An entry workflow should make these states obvious:

- collection and route mode;
- active locale and translation availability;
- required shared/localized fields;
- draft versus published values;
- route and slug state;
- SEO/canonical/alternate output;
- asset references;
- relation references;
- public visibility blockers.

Saving a draft does not change public output. Publishing validates the active
content model and refreshes public output only when the operation succeeds.

## Publishing

Publishing should be preview-first:

1. Validate required fields, routes, parents, locale readiness, relation
   references, and asset references.
2. Show website changes: affected pages, SEO, sitemap/search/nav inclusion,
   translation alternates, redirects, and public-output refresh facts.
3. Require confirmation for the actual publish operation.
4. Create immutable published versions and refresh public output atomically.

Failed publish attempts must leave the previous public output active.

## Assets

Assets are Convex-backed for v1. Studio should make upload, replacement,
attachment, usage, deletion, and restoration safe and explicit.

Deleting or purging assets should surface usage impact before destructive
actions. Reference status is `used`, `unused-verified`, or `unknown-stale`;
Studio must never translate missing or stale derived-reference proof into an
“unused” claim. Search, filters, location, sorting, sidebar counts, and keyset
pagination are one backend query contract. Client-side filtering of a loaded
page is not an asset-discovery path.

## Portability

Filesystem portability is an owner-controlled CLI workflow. It validates,
plans, applies, and resumes bounded draft imports under the installed contract;
Studio and MCP intentionally expose no import execution surface.

## MCP Parity

Studio and MCP should expose the same truth:

- contract inspection;
- entry read/write operations;
- draft and version diagnostics;
- public visibility explanation;
- publish-impact preview;
- route validation;

MCP is opt-in as an external server, but its operation model is part of the CMS
architecture.

## Agent Review

Agent work is visible as CMS workflow state, not as unexplained side effects.
Studio exposes:

- the current member's agent runs;
- pending review requests for publishers and owners;
- publish-impact previews and stale-request state;
- approve/reject controls that call canonical backend operations.

Agents can prepare drafts and request review. Public-output changes still need a
publisher or owner approval unless a later trusted-direct mode is explicitly
designed, tested, and documented.
