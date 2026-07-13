import { defineCollection, defineContentConfig } from '@lupinum/ginko-content/config'

const blog = defineCollection({
  type: 'page',
  source: 'content/blog/**/*.md',
  route: '/blog',
  cms: {
    fields: {
      featured: { type: 'toggle' },
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

export default defineContentConfig({ collections: { blog, authors } })
