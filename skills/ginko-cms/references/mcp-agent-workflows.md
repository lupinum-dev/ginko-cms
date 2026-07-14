# MCP Agent Workflows

Use this reference when an agent works through Ginko CMS MCP tools, resources,
or prompts. Canonical sources:

- `packages/cms/src/server/mcp/resources/agent/authoring-guide.ts`
- `packages/cms/src/server/mcp/resources/agent/publish-safety-guide.ts`
- `packages/cms/src/server/mcp/resources/agent/rich-media-guide.ts`
- `packages/cms/src/server/mcp/resources/public/capabilities-guide.ts`
- `packages/cms/src/server/mcp/resources/public/diagnostics-guide.ts`
- `packages/cms/src/cli/mcp-doctor.ts`

## Runtime Requirements

Run the MCP doctor from the host app:

```bash
pnpm exec ginko-cms mcp-doctor
```

It checks:

- a Convex URL and Better Auth HTTP action origin
- `secure-exec` as a host dependency for Nuxt MCP code mode
- generated Convex setup/root adapter files and direct dependencies

Normal MCP calls authenticate with Better Auth API keys, exchange them for a
Convex token through `better-convex-nuxt`, and then enforce current CMS
membership and credential scopes. They do not use `CONVEX_DEPLOY_KEY`.

## Authoring Flow

Use canonical CMS tools directly. MCP is a remote control over the same
operation layer Studio uses, not a separate workflow engine.

Default authoring loop:

1. Read `app://ginko-cms/agent-authoring-guide`.
2. Inspect `get-collection` and determine route-backed versus data-only
   capability.
3. Create content with `create-entry`.
4. Write drafts with `save-entry-draft`; preserve current draft data when
   sending partial updates.
5. Inspect `get-entry` with `compact: true` unless full state is needed.
6. Verify public readiness with `page`, `list`, `search`, `nav`, `sitemap`, and
   `explain-public-visibility`.

Agents may inspect collection fields, route mode, locales, and public
capability. They must not create, update, delete, import, or reorder collection
contracts through MCP.

## Publish And Destructive Safety

Publishing, unpublishing, deleting, archiving, and other destructive actions are
operation-backed. First call the tool without `_confirmationToken` to receive a
preview. Read `allowed`, `blockers`, `warnings`, and `effects`.

Execute only after explicit user approval by repeating the same arguments with
`preview.confirmation.token`. Rerun the preview if arguments, draft state, target
state, or caller changed.

Permanent entry delete is backup-gated: call `export-backup` with
`scope: "entry"` first, then pass the returned artifact id as
`exportArtifactId` to `delete-entry`.

## Public Diagnostics

Use diagnostics before changing or publishing content. Important tools:

- `explain-public-visibility`: explains route, sitemap, search, and nav
  readiness for one entry and locale.
- `publish-entry` without `_confirmationToken`: previews blockers and public
  changes without publishing.
- `get-entry` and `get-collection`: inspect draft state and capability.

Data-only collections can be listed publicly, but agents must not call page,
nav, surround, search, or sitemap tools for them.

## Media Limits

MCP cannot upload, fetch, or browse new media. Add files through Studio/browser
upload or a trusted migration path, then use MCP to inspect and reuse registered
assets.

Use `get-asset` and `resolve-asset-urls` when existing asset ids are known.
Asset tools never edit entry drafts. Place asset ids with `save-entry-draft`.

For rich text, insert Markdown image references into `bodyMdc` through
`save-entry-draft`; the canonical draft save path rebuilds content asset
references.
