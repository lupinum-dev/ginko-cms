export interface GinkoRoutingLocale {
  code: string
  prefix: string
  default?: boolean
}

export interface GinkoRouteClaim {
  kind: 'route' | 'redirect'
  collection: string
  entryId: string
  locale: string
  path: string
  href?: string | null
  targetPath?: string | null
  targetHref?: string | null
}

export interface GinkoRouteDiagnostic {
  code:
    | 'route_collision'
    | 'route_redirect_collision'
    | 'redirect_collision'
    | 'redirect_target_missing'
  message: string
  href: string
  claims: GinkoRouteClaim[]
}

export function renderGinkoHref(
  route: { locale: string; path: string },
  locales: GinkoRoutingLocale[],
) {
  const locale = locales.find((item) => item.code === route.locale)
  const prefix = locale?.prefix ?? ''
  const path = route.path.startsWith('/') ? route.path : `/${route.path}`
  return `${prefix}${path}` || '/'
}

export function validateGinkoRouteClaims(claims: GinkoRouteClaim[], locales: GinkoRoutingLocale[]) {
  const diagnostics: GinkoRouteDiagnostic[] = []
  const byHref = new Map<string, GinkoRouteClaim[]>()
  const routeHrefs = new Set<string>()

  for (const claim of claims) {
    const href = claim.href ?? renderGinkoHref(claim, locales)
    const bucket = byHref.get(href) ?? []
    bucket.push(claim)
    byHref.set(href, bucket)
    if (claim.kind === 'route') routeHrefs.add(href)
  }

  for (const [href, hrefClaims] of byHref) {
    if (hrefClaims.length < 2) continue
    const routeClaims = hrefClaims.filter((claim) => claim.kind === 'route')
    const redirectClaims = hrefClaims.filter((claim) => claim.kind === 'redirect')
    const code =
      routeClaims.length > 1
        ? 'route_collision'
        : routeClaims.length && redirectClaims.length
          ? 'route_redirect_collision'
          : 'redirect_collision'
    diagnostics.push({
      code,
      href,
      claims: hrefClaims,
      message: `Rendered href "${href}" is claimed by ${hrefClaims.length} public routes or redirects.`,
    })
  }

  for (const claim of claims) {
    if (claim.kind !== 'redirect' || !claim.targetPath) continue
    const targetHref =
      claim.targetHref ?? renderGinkoHref({ locale: claim.locale, path: claim.targetPath }, locales)
    if (routeHrefs.has(targetHref)) continue
    diagnostics.push({
      code: 'redirect_target_missing',
      href: claim.href ?? renderGinkoHref(claim, locales),
      claims: [claim],
      message: `Redirect "${claim.path}" points to missing public href "${targetHref}".`,
    })
  }

  return diagnostics
}
