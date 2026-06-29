import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: ['../packages/cms/src/module', '@nuxtjs/sitemap'],

  devtools: { enabled: true },
  compatibilityDate: 'latest',
  site: {
    url: 'https://playground.ginko.local',
  },

  css: ['~/assets/css/main.css'],

  i18n: {
    defaultLocale: 'en',
    locales: [{ code: 'en', name: 'English' }],
    localeCookie: 'playground-locale',
    metaBaseUrl: 'https://playground.ginko.local',
  },

  vite: {
    plugins: [tailwindcss()],
  },

  convex: {
    url: process.env.CONVEX_URL,
  },

  ginkoCms: {
    route: '/studio',
    publicContent: {
      api: true,
      prerender: true,
    },
    collections: {
      blog: {
        type: 'flat',
        routing: {
          pathPrefix: '/blog',
        },
        fields: [
          { key: 'title', type: 'text', required: true },
          { key: 'description', type: 'textarea' },
          { key: 'bodyMdc', type: 'richtext' },
          { key: 'featured', type: 'toggle' },
        ],
      },
      authors: {
        type: 'flat',
        routing: {
          mode: 'none',
          pathPrefix: '/authors',
        },
        fields: [
          { key: 'name', type: 'text', required: true },
          { key: 'bio', type: 'textarea' },
        ],
      },
    },
  },
})
