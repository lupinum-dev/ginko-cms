# Content Contracts, Transitions, And Portability

Use this reference when changing collections, routes, locales, relation fields,
MDC body handling, or owner-CLI portability. Canonical docs:

- `docs/guides/changing-collections.md`
- `docs/guides/contract-transitions/recipes.md`
- `docs/guides/contract-transitions/recovery.md`
- `docs/guides/content-portability.md`
- `docs/reference/content-model.md`
- `docs/concepts/relations.md`
- `docs/concepts/mdc-body-contract.md`

## Contents

- [Source Of Truth](#source-of-truth)
- [Route-Backed Article Collection](#route-backed-article-collection)
- [Drift Workflow](#drift-workflow)
- [Safe Changes](#safe-changes)
- [Blocked Changes](#blocked-changes)
- [Contract Transition Files](#contract-transition-files)
- [Filesystem Portability](#filesystem-portability)
- [MDC Body Contract](#mdc-body-contract)
- [Relation Discipline](#relation-discipline)

## Source Of Truth

The content model has one source of truth: the host app code, usually
`content.config.ts`. It resolves to one installed `cmsContract` with separate
content and presentation hashes:

```text
content.config.ts / ginkoCms.collections -> ginko-cms deploy -> bound host hashes -> installed cmsContract
```

Studio, MCP, owner-CLI portability, and public reads inspect the installed
contract. They do not own schema edits. A hash mismatch remains readable and
diagnosable but blocks editorial writes. Backend mutations compare both bound
host hashes and the transition lock transactionally; frontend checks are only
early feedback. Only the centralized access/security and diagnostic bypass
allowlist may write while the editorial contract is blocked.

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
contract transition just because the collection is new.

## Drift Workflow

Always start with:

```bash
pnpm exec ginko-cms push --check
```

Safe drift can be pushed:

```bash
pnpm exec ginko-cms push
```

Content-incompatible drift uses a bounded contract transition:

```bash
pnpm exec ginko-cms contract transition create <change-name>
pnpm exec ginko-cms deploy --transition
pnpm exec ginko-cms contract transition stage ginko/transitions/<file>.ts --yes
pnpm exec ginko-cms contract transition status <run-id>
pnpm exec ginko-cms contract transition apply <run-id> --yes
pnpm exec ginko-cms contract transition activate <run-id> --yes
```

Explicitly unpublish affected live entries first. Staging locks Studio writes,
records every transformed draft in bounded pages, and then validates the staged
route/placement graph in bounded pages under the exact target contract. Both
phases use durable generation/cursor and count/hash fences. Apply is pagewise
and resumable; activation is atomic. Cancel only before apply starts. After
apply begins, the run is resume-only.

## Safe Changes

These are usually safe to push:

- Collection label or icon change
- Non-schema collection settings change
- Add a new collection
- Remove an empty collection
- Add an optional field
- Add a locale without removing existing locales

## Blocked Changes

These can invalidate content or public routes and require an explicit contract
transition when entries exist:

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

## Contract Transition Files

`ginko-cms contract transition create <name>` writes a TypeScript transform
under `ginko/transitions/`. Keep transforms direct: change canonical shared and
locale draft values, slugs, placement, ordering, or node kind while preserving
entry identity and collection membership.

Do not add runtime compatibility fields, parallel old/new models, shims, or
dual reads.

## Filesystem Portability

`ginko-cms content` is the owner-only portability path. Export captures
published content deterministically. Import verifies and plans the portable
directory, then applies drafts only:

```bash
pnpm exec ginko-cms content export --out ./portable-content
pnpm exec ginko-cms content verify ./portable-content
pnpm exec ginko-cms content import ./portable-content --plan ./import-plan.json
pnpm exec ginko-cms content import --apply ./import-plan.json
```

The total envelope is 5,000 localized documents, three locales, and 500 assets.
The exact limits are accepted; limit-plus-one is rejected before work starts.
Studio, MCP, and deploy keys do not expose alternate portability authority.

## MDC Body Contract

MDC source lives as editable body content. Public reads expose parsed body AST
and table of contents, not raw body text as parsed content. Do not document
`data.bodyMdc` as the public provider result shape.

## Relation Discipline

Prefer stable relation identity. Route paths are public addressability, not
stable relation identity. When changing relation fields, account for nested
object, array, and block fields.
