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

  content: {
    i18n: {
      defaultLocale: 'en',
      locales: ['en'],
    },
  },

  ginkoCms: {
    route: '/studio',
    publicContent: {
      api: true,
      prerender: true,
    },
  },
})
