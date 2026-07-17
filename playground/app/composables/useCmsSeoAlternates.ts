import type { MaybeRefOrGetter } from 'vue'

function joinSiteUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

interface CmsAlternate {
  locale: string
  path: string
  /** `variant` = a published translation; `fallback` = served via locale fallback. */
  source: 'variant' | 'fallback'
}

interface CmsPageWithRoute {
  route: { alternates: CmsAlternate[] }
}

/**
 * Emits `<link rel="alternate" hreflang>` tags (plus `x-default`) for a
 * CMS-backed page, limited to translations that are actually published
 * (`source: 'variant'`). Fallback alternates point at URLs the CMS serves via
 * locale fallback for direct visitors, but they must not be advertised to
 * crawlers as translations.
 *
 * The i18n module's blind per-locale alternates are disabled in
 * `nuxt.config.ts` (per-locale `seo: false`), so this composable is the single
 * source of hreflang links on content routes.
 */
export function useCmsSeoAlternates(page: MaybeRefOrGetter<CmsPageWithRoute | null | undefined>) {
  const site = useSiteConfig()
  const { defaultLocale } = useI18n()

  const links = computed(() => {
    const published =
      toValue(page)?.route.alternates.filter((alternate) => alternate.source === 'variant') ?? []

    const links = published.map((alternate) => ({
      key: `cms-alternate-${alternate.locale}`,
      rel: 'alternate',
      hreflang: alternate.locale,
      href: joinSiteUrl(site.url, alternate.path),
    }))

    // Mirror the CMS contract's x-default policy: the default locale's
    // published route, else the first published alternate.
    const xDefault =
      published.find((alternate) => alternate.locale === defaultLocale()) ?? published[0]
    if (xDefault) {
      links.push({
        key: 'cms-alternate-x-default',
        rel: 'alternate',
        hreflang: 'x-default',
        href: joinSiteUrl(site.url, xDefault.path),
      })
    }

    return links
  })

  useHead({ link: links })
}
