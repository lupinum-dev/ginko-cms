import { defineCollection, defineContentConfig } from '@lupinum/ginko-content/config'

const blog = defineCollection({
  type: 'page',
  source: 'content/blog/**/*.md',
  route: '/blog',
  i18n: true,
  cms: {
    fields: {
      featured: { type: 'toggle', localized: false },
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
  collections: { blog, docs, authors },
})
