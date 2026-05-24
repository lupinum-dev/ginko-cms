import { ConvexHttpClient } from 'convex/browser'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import { api } from '#trellis/api'

type SitemapRoute = {
  locale: string
  path: string
}

type SitemapAlternate = {
  hreflang: string
  route: SitemapRoute
}

type SitemapUrl = {
  collection: string
  route: SitemapRoute
  lastmod?: string | null
  alternates: SitemapAlternate[]
  xDefault?: SitemapRoute | null
}

type RuntimePublicConfig = {
  convex?: { url?: string }
  ginkoCms?: {
    locales?: Array<{ code: string }>
    defaultLocale?: string
    collections?: Record<string, unknown>
  }
}

type RuntimeConfig = {
  public?: RuntimePublicConfig
}

type PublicQueryRef = Parameters<ConvexHttpClient['query']>[0]
type GinkoPublicApiRefs = {
  sitemap: PublicQueryRef
}
type SitemapPage = {
  urls: SitemapUrl[]
  pageInfo?: {
    hasNextPage: boolean
    endCursor: string | null
  }
}
const ginkoPublicApi = (
  api as unknown as {
    ginkoCms: { public: GinkoPublicApiRefs }
  }
).ginkoCms.public

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event) as unknown as RuntimeConfig
  const ginkoConfig = runtimeConfig.public?.ginkoCms
  const convexUrl =
    runtimeConfig.public?.convex?.url ??
    process.env.NUXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_URL
  if (!convexUrl) {
    throw new Error('Convex URL is not configured for Ginko sitemap generation.')
  }

  const query = getQuery(event)
  const locale = typeof query.locale === 'string' && query.locale ? query.locale : undefined
  const collections =
    typeof query.collections === 'string' && query.collections
      ? query.collections.split(',').filter(Boolean)
      : Object.keys(ginkoConfig?.collections ?? {})
  const configuredLocales = (ginkoConfig?.locales ?? []).map((item) => item.code).filter(Boolean)
  const locales = locale
    ? [locale]
    : configuredLocales.length
      ? configuredLocales
      : ginkoConfig?.defaultLocale
        ? [ginkoConfig.defaultLocale]
        : []
  const client = new ConvexHttpClient(convexUrl)
  const urls: SitemapUrl[] = []
  for (const collection of collections) {
    for (const targetLocale of locales) {
      let cursor: string | null = null
      do {
        const page = (await client.query(ginkoPublicApi.sitemap, {
          collection,
          locale: targetLocale,
          cursor,
        })) as SitemapPage
        urls.push(...page.urls)
        cursor = page.pageInfo?.endCursor ?? null
      } while (cursor)
    }
  }

  const defaultLocale = ginkoConfig?.defaultLocale ?? configuredLocales[0]
  const collectionLocales = new Map(
    Object.entries(ginkoConfig?.collections ?? {}).map(([collection, config]) => [
      collection,
      new Set(
        Array.isArray((config as { locales?: unknown }).locales)
          ? ((config as { locales: string[] }).locales ?? [])
          : configuredLocales.length
            ? configuredLocales
            : locales,
      ),
    ]),
  )
  const isEnabledRoute = (collection: string, route: { locale: string }) => {
    const allowedLocales = collectionLocales.get(collection)
    return !allowedLocales || allowedLocales.has(route.locale)
  }
  const hrefFor = (route: { locale: string; path: string; href?: string }) => {
    if (route.href) return route.href
    const prefix = route.locale && route.locale !== defaultLocale ? `/${route.locale}` : ''
    return `${prefix}${route.path}` || '/'
  }

  return urls
    .filter((url) => isEnabledRoute(url.collection, url.route))
    .map((url) => ({
      loc: hrefFor(url.route),
      lastmod: url.lastmod,
      alternatives: [
        ...url.alternates
          .filter((alternate) => isEnabledRoute(url.collection, alternate.route))
          .map((alternate) => ({
            hreflang: alternate.hreflang,
            href: hrefFor(alternate.route),
          })),
        ...(url.xDefault && isEnabledRoute(url.collection, url.xDefault)
          ? [
              {
                hreflang: 'x-default',
                href: hrefFor(url.xDefault),
              },
            ]
          : []),
      ],
    }))
})
