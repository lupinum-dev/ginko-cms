# Filesystem Migration

`@lupinum/ginko-cms/migration` provides the filesystem-to-Ginko CMS migration
boundary. Use it when moving existing Markdown, MDC, JSON, or YAML content into
existing code-defined CMS collections. The workflow is deliberately split into
plan and apply stages.

Migration imports content into existing code-defined collection contracts. It is
not a schema generator and must not mutate collection definitions.

## Before You Start

Use this workflow after the target collections have been defined in app code and
pushed into Ginko CMS. Preview and apply call the CMS import operations, which
require an owner or another caller with collection-management permission.

Expected source layout:

```text
collections/
  posts.json
content/
  posts/
    hello-world.md
```

The collection JSON files describe the incoming source shape. The active
code-defined CMS contract remains the authority that accepts or blocks the
import.

## Plan, Preview, Upload, Apply

```ts
import {
  applyFilesystemMigration,
  createFilesystemMigrationPlan,
  previewFilesystemMigration,
  uploadFilesystemMigrationAssets,
  rewriteFilesystemMigrationAssetReferences,
} from '@lupinum/ginko-cms/migration'

const plan = await createFilesystemMigrationPlan({
  rootDir: process.cwd(),
  collectionsDir: 'collections',
  contentDir: 'content',
  defaultLocale: 'en',
})

await previewFilesystemMigration(plan, {
  previewImport: async (payload) => {
    // call Ginko previewImport with { collections, entries }
  },
})

const { plan: uploadedPlan } = await uploadFilesystemMigrationAssets(plan, async (asset) => {
  // CLI, Studio, or MCP owns auth and confirmation around the upload operation.
  return await uploadAssetAndReturnUrl(asset.sourcePath)
})

await applyFilesystemMigration(uploadedPlan, {
  applyImport: async (payload) => {
    // call Ginko applyImport with { collections, entries }
    // pass { ...payload, publish: true } only when the migration should publish
    // the imported locales atomically after import validation succeeds
    return await convex.mutation(api.ginkoCms.imports.applyImport, payload)
  },
})
```

If assets are already uploaded, use explicit replacements instead of
`uploadFilesystemMigrationAssets`:

```ts
const rewrittenPlan = rewriteFilesystemMigrationAssetReferences(plan, [
  { sourcePath: '/assets/guide.png', replacement: 'https://assets.example/guide.png' },
])
```

Then pass `rewrittenPlan` to `applyFilesystemMigration(...)`.

The planner reports:

- collection JSON definitions to match against code-defined contracts
- markdown/MDC entries grouped by collection
- JSON/YAML entries for explicit data-only collections
- stable IDs derived from source paths
- route paths derived from collection `routing.pathPrefix`
- localized title/description/body payloads
- unambiguous relation fields rewritten to stable IDs
- asset references found in frontmatter/body values
- warnings for missing content directories and content without collection config

Preview is intentionally plan-shaped. It lets callers inspect the filesystem
payload before executing writes.

Apply is target-shaped. `applyFilesystemMigration()` forwards the payload to the
caller-provided `applyImport` function and returns that target result directly.
It does not replace the target outcome with scanner counts. The scanner does not
know which Convex deployment, caller, or confirmation flow should be used.
Studio, MCP, and CLI tools can share the same `{ collections, entries }` payload
while owning their own authentication and confirmation semantics.

Asset references are included in the payload as an inventory. Because Convex
cannot read the caller's local filesystem during a mutation, local filesystem
asset upload remains a caller-owned pre-apply step. Callers can use
`uploadFilesystemMigrationAssets` with a CLI/Studio/MCP-owned upload operation.
The helper rewrites filesystem asset paths in shared fields, localized fields,
body strings, and SEO data before sending the payload to `applyImport`. If
assets have already been uploaded elsewhere, callers can pass explicit
replacements to `rewriteFilesystemMigrationAssetReferences`.

The Convex apply path also accepts `publish: true` and optional
`publishLocales`. When enabled, imported entries are published in parent-first
order inside the same mutation, creating published revisions and active
`publicEntries` / `publicRoutes` rows for page, nav, sitemap, search, list, and
route metadata reads. If publish validation
fails, the import mutation fails atomically instead of leaving partially
published public output.
Successful preview/apply runs are also persisted as collection import reports.
Admin tooling can query recent runs with `listImportRuns` instead of relying on
the original mutation response as the only audit trail.

## Current Limits

- Markdown/MDC frontmatter can contain structured YAML values such as arrays,
  nested objects, and inline objects. JSON/YAML content files are also accepted
  for data-only collections.
- JSON/YAML content files are accepted only for `routing.mode: "none"` collections;
  route-backed content must use Markdown/MDC so body and route semantics stay
  explicit.
- Ambiguous or unresolved relation strings remain in the payload with explicit
  warnings; production migration should fix those before apply.
- Asset upload needs caller-owned local-file handling before apply.
  `uploadFilesystemMigrationAssets` provides the shared planning/rewrite step,
  but the caller supplies the upload operation and confirmation semantics.
- Failed import report persistence is still a separate concern because Convex
  rolls back writes when the mutation fails.
- Site-wide public-row rebuild tooling is still a separate scaling concern.
  Route-backed import publishing writes the active public rows needed by
  navigation directly during publish.
- Sites without a `content/` directory can still use the planner to import
  collection configs and receive an explicit `content_dir_missing` warning.

## Related Pages

- [Changing collections](./changing-collections.md)
- [Migration recipes](./migrations/recipes.md)
- [Migration recovery](./migrations/recovery.md)
