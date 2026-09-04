# Next Collections

Use this after the quickstart collection appears in Studio. Keep
`content.config.ts` as the source of truth and add one concept at a time.

## 1. Add Fields To A Page

Add schema fields to the route-backed collection:

```ts
import { z } from 'zod'
import { defineCollection, defineContentConfig, fields } from '@lupinum/ginko-content/config'

const pages = defineCollection({
  type: 'page',
  source: '**/*.md',
  schema: z.object({
    eyebrow: fields.text(),
    summary: fields.text(),
  }),
})

export default defineContentConfig({
  provider: 'cms',
  collections: { pages },
})
```

Then check and push the contract:

```bash
pnpm exec ginko-cms push --check
pnpm exec ginko-cms push
```

## 2. Localize One Field

Mark only the field that needs per-locale values:

```ts
schema: z.object({
  eyebrow: fields.text(),
  summary: fields.text().localized(),
})
```

Collection-level i18n controls which locales exist. Field-level localization
controls whether a value is shared or translated.

## 3. Add Data-Only Content

Use `type: 'data'` for content that should not create page routes:

```ts
const authors = defineCollection({
  type: 'data',
  source: 'authors/*.yml',
  schema: z.object({
    name: fields.text().required(),
    bio: fields.richtext(),
  }),
})

export default defineContentConfig({
  provider: 'cms',
  collections: { pages, authors },
})
```

Data-only collections publish rows for list-style reads, but they do not join
the structural public route tree, navigation, or sitemap output.

## 4. Add A Relation

Reference the data collection from a page collection:

```ts
const pages = defineCollection({
  type: 'page',
  source: '**/*.md',
  schema: z.object({
    summary: fields.text().localized(),
    author: fields.relation('authors'),
  }),
})
```

Public reads return stable relation references. Relation-heavy pages should
resolve related rows explicitly in the app or through a custom public resolver;
the public API does not do runtime `include` or `depth` expansion.

## 5. Publish And Read

For contract changes:

```bash
pnpm exec ginko-cms push --check
pnpm exec ginko-cms push
```

For first setup after generated Convex files change:

```bash
pnpm exec ginko-cms deploy
```

After publishing entries in Studio, Nuxt reads published content through the
Ginko Content provider. Keep provider setup out of the first model change; use
the [Nuxt content provider reference](../reference/nuxt-content-provider.md)
when you need read-path details.

Ginko Content resolves `content.config.ts` during Nuxt prepare and atomically writes
`.ginko/content-contract.json`. Ginko CMS reads that generated artifact, so Studio,
CLI tools, and the Nuxt runtime all use the exact same resolved contract.
Do not duplicate collection, route, field, or locale policy in `nuxt.config.ts`.
