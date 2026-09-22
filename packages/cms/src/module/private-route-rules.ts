import type { NitroRouteConfig } from 'nitropack/types'

type PrivateRouteRule = NitroRouteConfig & { robots?: false; sitemap?: false }

export function resolvePrivateRouteRoot(route: string, option: string, allowRoot = false): string {
  if (route === '/' && allowRoot) return '/'
  const root = route.replace(/\/$/u, '')
  if (
    !root.startsWith('/') ||
    root === '/' ||
    root.length === 0 ||
    /[\s*?:#\\%]/u.test(root) ||
    root
      .split('/')
      .slice(1)
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`ginko-cms ${option} must be a static, non-root path such as /studio.`)
  }
  return root
}

/** Apply to explicit children too: Nitro's most specific route wins. */
export function protectPrivateRoutes(
  rules: Record<string, NitroRouteConfig>,
  roots: string[],
): void {
  const privatePaths = new Set(roots.flatMap((root) => [root, `${root.replace(/\/$/u, '')}/**`]))
  for (const path of Object.keys(rules)) {
    if (roots.some((root) => path.startsWith(`${root.replace(/\/$/u, '')}/`)))
      privatePaths.add(path)
  }

  // Header names are case-insensitive on the wire but not during route-rule
  // merging. Override inherited spellings as well as canonical CDN headers.
  const privacyHeaders = new Set([
    'cache-control',
    'cdn-cache-control',
    'vercel-cdn-cache-control',
    'x-robots-tag',
  ])
  for (const rule of Object.values(rules)) {
    for (const name of Object.keys(rule.headers ?? {})) {
      const lower = name.toLowerCase()
      if (
        lower === 'cache-control' ||
        lower.endsWith('-cdn-cache-control') ||
        lower === 'cdn-cache-control' ||
        lower === 'x-robots-tag'
      ) {
        privacyHeaders.add(name)
      }
    }
  }

  for (const path of privatePaths) {
    const headers = { ...rules[path]?.headers }
    for (const name of privacyHeaders) {
      headers[name] =
        name.toLowerCase() === 'x-robots-tag' ? 'noindex, nofollow' : 'private, no-store'
    }
    const rule: PrivateRouteRule = {
      ...rules[path],
      headers,
      cache: false,
      isr: false,
      swr: false,
      prerender: false,
      robots: false,
      sitemap: false,
    }
    rules[path] = rule
  }
}
