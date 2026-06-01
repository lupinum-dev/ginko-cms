export type SitemapRouteHrefInput = {
  locale: string
  path: string
  href?: string
}

export function sitemapRouteHref(route: SitemapRouteHrefInput, defaultLocale: string) {
  const rawPath = route.href || route.path || '/'
  const path = rawPath === '/' ? '' : `/${rawPath.replace(/^\/+/, '').replace(/\/+$/, '')}`
  const prefix = route.locale && route.locale !== defaultLocale ? `/${route.locale}` : ''
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) return path || '/'
  return `${prefix}${path}` || '/'
}
