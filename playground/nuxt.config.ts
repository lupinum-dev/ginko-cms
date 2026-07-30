import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: [
    '@lupinum/ginko-content',
    'nuxt-i18n-micro',
    '../packages/cms/src/module',
    '@nuxtjs/sitemap',
  ],

  devtools: { enabled: true },
  compatibilityDate: 'latest',
  site: {
    url: 'https://playground.ginko.local',
  },

  css: ['~/assets/css/main.css'],

  i18n: {
    autoDetectLanguage: false,
    defaultLocale: 'en',
    disablePageLocales: true,
    // `seo: false` stops nuxt-i18n-micro from emitting hreflang alternates
    // (and x-default) for every configured locale regardless of whether the
    // translation is published. Content pages emit their own published-only
    // alternates via `useCmsSeoAlternates`. Canonical, og:url, og:locale and
    // <html lang/dir> are still managed by the i18n module.
    locales: [
      { code: 'en', name: 'English', seo: false },
      { code: 'de', name: 'Deutsch', seo: false },
    ],
    localeCookie: 'playground-locale',
    metaBaseUrl: 'https://playground.ginko.local',
    redirects: false,
    translationDir: 'node_modules/.cache/ginko-cms/i18n-micro',
  },

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['convex/server'],
    },
  },

  convex: {
    url: process.env.CONVEX_URL,
    siteUrl: process.env.CONVEX_SITE_URL,
    auth: {
      publicOrigin: process.env.SITE_URL ?? 'http://localhost:3000',
    },
  },

  content: {
    i18n: {
      defaultLocale: 'en',
      locales: ['en', 'de'],
    },
    search: {
      engine: 'provider',
      collections: ['blog'],
    },
  },

  ginkoCms: {
    route: '/studio',
    mcp: true,
  },
})
