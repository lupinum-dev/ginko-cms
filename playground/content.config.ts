import { defineCollection, defineContentConfig, fields } from '@lupinum/ginko-content/config'
import { z } from 'zod'

const landing = defineCollection({
  type: 'page',
  body: false,
  source: 'content/landing/**/*.json',
  route: '/landing',
  i18n: true,
  schema: z.object({
    eyebrow: fields.text().localized(),
    cta_label: fields.text().localized(),
    cta_href: fields.text().localized(),
    hero_image: fields.image().localized(),
    hero_alt: fields.text().localized(),
  }),
  cms: {
    fields: {
      description: { type: 'textarea' },
    },
  },
})

const blog = defineCollection({
  type: 'page',
  source: 'content/blog/**/*.md',
  route: '/blog',
  i18n: true,
  cms: {
    fields: {
      featured: { type: 'toggle', localized: false },
      relatedDoc: {
        type: 'relation',
        localized: false,
        relation: { collectionId: 'docs', multiple: false },
      },
    },
  },
})

const docs = defineCollection({
  type: 'page',
  source: 'content/docs/**/*.md',
  route: '/docs',
  i18n: true,
  cms: {
    type: 'tree',
    fields: {
      description: { type: 'textarea' },
    },
  },
})

const authors = defineCollection({
  type: 'data',
  source: 'content/authors/**/*.yml',
  cms: {
    route: { mode: 'none' },
    fields: {
      name: { type: 'text', required: true },
      bio: { type: 'textarea' },
    },
  },
})

export default defineContentConfig({
  provider: 'cms',
  collections: { blog, docs, authors, landing },
})
