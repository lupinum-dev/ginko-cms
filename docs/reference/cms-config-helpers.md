# CMS Config Helpers

Use these helpers only when a host app intentionally does not derive CMS
contracts from `content.config.ts`. In normal Ginko Content apps, define
collections with `defineCollection('name', config)` and `fields` from
`@lupinum/ginko-content/config`.

## When To Use This

Use `@lupinum/ginko-cms/config` when:

- the app is not using Ginko Content as the contract source;
- the app needs CMS-native `flat` or `tree` collection types directly;
- the app accepts owning route, locale, and field mapping without Ginko Content
  defaults.

Do not use it to duplicate collections already defined in `content.config.ts`.
That creates a second source of truth.

## Example

```ts
import {
  dataCollection,
  defineGinkoCmsConfig,
  ginkoFields,
  routeBackedCollection,
} from '@lupinum/ginko-cms/config'

export default defineNuxtConfig({
  modules: ['@lupinum/ginko-cms'],

  ginkoCms: defineGinkoCmsConfig({
    content: false,
    collections: {
      pages: routeBackedCollection({
        type: 'tree',
        routing: {
          pathPrefix: '',
        },
        fields: [
          ginkoFields.text('title', { required: true, localized: true }),
          ginkoFields.richtext('bodyMdc', { localized: true }),
          ginkoFields.relation('author', 'authors'),
        ],
      }),

      authors: dataCollection({
        type: 'flat',
        fields: [ginkoFields.text('name', { required: true }), ginkoFields.richtext('bio')],
      }),
    },
  }),
})
```

`routeBackedCollection` sets `routing.mode` to `route`. `dataCollection` sets
`routing.mode` to `none`.

## Field Helpers

`ginkoFields` builds CMS field definitions:

```ts
ginkoFields.text('title', { required: true, localized: true })
ginkoFields.textarea('description')
ginkoFields.richtext('bodyMdc', { localized: true })
ginkoFields.slug('slug')
ginkoFields.select('status', ['draft', 'published'])
ginkoFields.relation('author', 'authors')
ginkoFields.relations('authors', 'authors')
ginkoFields.image('cover')
ginkoFields.object('seo', [ginkoFields.text('title'), ginkoFields.textarea('description')])
ginkoFields.array('links', [
  ginkoFields.text('label', { required: true }),
  ginkoFields.url('href', { required: true }),
])
```

The helper output is the synced CMS contract. Studio can edit entries under that
contract, but Studio does not author or mutate the contract itself.
