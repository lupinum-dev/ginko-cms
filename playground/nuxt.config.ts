import tailwindcss from '@tailwindcss/vite'

import { imageAuthoring } from './image-authoring'

export default defineNuxtConfig({
  modules: [
    '@lupinum/ginko-content',
    'nuxt-i18n-micro',
    '../packages/cms/src/module',
    '@nuxtjs/sitemap',
  ],

  // CMS publications are read at request time. A static Content query or Nuxt
  // payload would otherwise keep serving the build's approved snapshot.
  nitro: {
    prerender: { crawlLinks: false, ignore: ['/api/_content'] },
  },

  devtools: { enabled: true },
  compatibilityDate: 'latest',
  site: {
    name: 'Ginko CMS Playground',
    description: 'A self-hosted CMS playground powered by Convex.',
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
      { code: 'en', iso: 'en-US', name: 'English', seo: false },
      { code: 'de', iso: 'de-DE', name: 'Deutsch', seo: false },
    ],
    localeCookie: 'playground-locale',
    metaBaseUrl: 'https://playground.ginko.local',
    redirects: false,
    translationDir: 'locales',
  },

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['convex/server'],
    },
  },

  convex: {
    url:
      process.env.CONVEX_URL ?? process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.VITE_CONVEX_URL,
    siteUrl:
      process.env.CONVEX_SITE_URL ??
      process.env.NUXT_PUBLIC_CONVEX_SITE_URL ??
      process.env.VITE_CONVEX_SITE_URL,
    auth: {
      origin: process.env.SITE_URL ?? 'http://localhost:3000',
    },
  },

  content: {
    componentPolicy: imageAuthoring.policy,
    markdown: { tags: { image: 'ContentImage' } },
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
    editorialLayout: {
      collections: {
        blog: { authoring: imageAuthoring },
        docs: { authoring: imageAuthoring },
        landing: {
          label: { en: 'Landing pages', de: 'Landingpages' },
          fields: {
            title: { label: { en: 'Headline', de: 'Überschrift' } },
            description: { label: { en: 'Introduction', de: 'Einleitung' } },
            eyebrow: { label: { en: 'Opening line', de: 'Auftakt' } },
            cta_label: { label: { en: 'Button label', de: 'Buttontext' } },
            cta_href: { label: { en: 'Button destination', de: 'Linkziel' } },
            hero_image: { label: { en: 'Page image', de: 'Seitenbild' } },
            hero_alt: { label: { en: 'Image description', de: 'Bildbeschreibung' } },
          },
        },
      },
    },
  },
})
