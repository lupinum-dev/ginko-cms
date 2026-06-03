# Content Contracts And Migrations

Use this reference when changing collections, routes, locales, relation fields,
MDC body handling, or filesystem imports. Canonical docs:

- `docs/guides/changing-collections.md`
- `docs/guides/migrations/recipes.md`
- `docs/guides/migrations/recovery.md`
- `docs/guides/filesystem-migration.md`
- `docs/reference/content-model.md`
- `docs/concepts/relations.md`
- `docs/concepts/mdc-body-contract.md`

## Contents

- [Source Of Truth](#source-of-truth)
- [Route-Backed Article Collection](#route-backed-article-collection)
- [Drift Workflow](#drift-workflow)
- [Safe Changes](#safe-changes)
- [Blocked Changes](#blocked-changes)
- [Migration Files](#migration-files)
- [Filesystem Imports](#filesystem-imports)
- [MDC Body Contract](#mdc-body-contract)
- [Relation Discipline](#relation-discipline)

## Source Of Truth

The content model has one source of truth: the host app code, usually
`content.config.ts`. Contract changes move one way:

```text
content.config.ts / ginkoCms.collections -> ginko-cms push -> synced CMS contract
```

Studio, MCP, imports, and public reads inspect the synced contract. They do not
own schema edits.

## Route-Backed Article Collection

For a publishable article or blog section, prefer one route-backed collection in
the app's existing contract source. In Ginko Content apps, define it in
`content.config.ts` so the website and CMS share one typed model:

```ts
import { defineCollection, defineContentConfig } from '@lupinum/ginko-content/config'

export const articles = defineCollection({
  type: 'page',
  source: 'articles/**/*.{md,mdc}',
  route: '/articles',
})

export default defineContentConfig({
  provider: 'cms',
  collections: { articles },
})
```

The default page contract derives the standard page fields, including
`title`, `description`, and editable `bodyMdc`. Add explicit schema fields only
for real structured metadata such as date, authors, tags, or hero media.

For direct CMS contracts, keep the same route-backed shape under
`ginkoCms.collections`:

```ts
export default defineNuxtConfig({
  ginkoCms: {
    collections: {
      articles: {
        label: 'Articles',
        type: 'flat',
        routing: {
          mode: 'route',
          pathPrefix: '/articles',
          slugMode: 'shared',
        },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', localized: true, required: true, searchable: true },
          { key: 'description', type: 'textarea', localized: true, searchable: true },
          { key: 'bodyMdc', type: 'richtext', localized: true },
        ],
      },
    },
  },
})
```

Adding a collection is usually safe drift. Still start with
`pnpm exec ginko-cms push --check`; if the report contains only the new
collection, run `pnpm exec ginko-cms push` and check again. Do not create a
content migration just because the collection is new.

## Drift Workflow

Always start with:

```bash
pnpm exec ginko-cms push --check
```

Safe drift can be pushed:

```bash
pnpm exec ginko-cms push
```

Migration-required drift needs explicit content transformation before pushing
the new contract:

```bash
pnpm exec ginko-cms migrate create <change-name>
pnpm exec ginko-cms migrate plan ginko/migrations/<file>.ts
pnpm exec ginko-cms migrate apply ginko/migrations/<file>.ts --yes
pnpm exec ginko-cms push --check
```

Only run `ginko-cms push` after the check reports safe drift. Migrations update
stored draft content under the active contract; they do not approve an unsafe
contract change by themselves.

## Safe Changes

These are usually safe to push:

- Collection label or icon change
- Non-schema collection settings change
- Add a new collection
- Remove an empty collection
- Add an optional field
- Add a locale without removing existing locales

## Blocked Changes

These can invalidate content or public routes and require an explicit migration
when entries exist:

- Add a required field
- Remove, rename, or change a field type
- Change field localization
- Remove a locale
- Change routing
- Change collection type
- Remove a collection with entries
- Split or merge collections

The guard is conservative. Do not clear tables or force writes to make a blocked
push pass.

## Migration Files

`ginko-cms migrate create <name>` writes a TypeScript migration under
`ginko/migrations/`. Keep migrations direct: transform `shared` values and
locale values; preserve identity fields such as `entryId`, `stableId`, and
`draftVersion`.

Do not add runtime compatibility fields, parallel old/new models, or shims
unless the user explicitly asks and the product requirement is real.

## Filesystem Imports

Filesystem migration is a one-time import path from Markdown/content files into
Ginko CMS. Use `createFilesystemMigrationPlan`, preview the plan, upload assets,
then apply. The plan creation API is async:

```ts
const plan = await createFilesystemMigrationPlan({
  rootDir: './content',
  collections,
})
```

If asset URLs are rewritten after upload, pass the rewritten plan to apply. Do
not leave an unused `rewrittenPlan` in examples.

## MDC Body Contract

MDC source lives as editable body content. Public reads expose parsed body AST
and table of contents, not raw body text as parsed content. Do not document
`data.bodyMdc` as the public provider result shape.

## Relation Discipline

Prefer stable relation identity. Route paths are public addressability, not
stable relation identity. When changing relation fields, account for nested
object, array, and block fields.
