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

Data-only collections publish rows for list-style reads, but they do not create
route rows, navigation entries, or sitemap URLs.

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

## Advanced CMS-Native Contracts

Most Nuxt apps should stop at `content.config.ts`. The CMS-native helpers from
`@lupinum/ginko-cms/config` exist for custom integrations that do not use Ginko
Content as the contract source. They expose CMS terms such as `flat`, `tree`,
and explicit routing because the app owns the exact CMS contract in that mode.

See [CMS config helpers](../reference/cms-config-helpers.md) before using that
path.
