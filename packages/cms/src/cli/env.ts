import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export function readLocalEnv(cwd: string): Record<string, string> {
  const envLocal = readIfExists(resolve(cwd, '.env.local')) ?? ''
  return Object.fromEntries(
    envLocal
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

export function publicConvexUrl(cwd: string): string {
  const env = readLocalEnv(cwd)
  const url =
    process.env.NUXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_URL ??
    env.NUXT_PUBLIC_CONVEX_URL ??
    env.CONVEX_URL
  if (!url) {
    throw new Error(
      'ginko-cms requires CONVEX_URL or NUXT_PUBLIC_CONVEX_URL in the environment or .env.local.',
    )
  }
  return url
}

export function deployKey(cwd: string): string {
  const env = readLocalEnv(cwd)
  const key = process.env.CONVEX_DEPLOY_KEY ?? env.CONVEX_DEPLOY_KEY
  const trimmed = key?.trim()
  if (!trimmed) {
    throw new Error('ginko-cms requires CONVEX_DEPLOY_KEY in the CLI environment or .env.local.')
  }
  return trimmed
}

function requiredEnvironment(cwd: string, names: string[], message: string): string {
  const local = readLocalEnv(cwd)
  for (const name of names) {
    const value = process.env[name] ?? local[name]
    if (value?.trim()) return value.trim()
  }
  throw new Error(message)
}

export function convexSiteOrigin(cwd: string): string {
  const configured = requiredEnvironment(
    cwd,
    ['GINKO_CMS_BETTER_AUTH_BASE_URL', 'CONVEX_SITE_URL', 'BETTER_AUTH_URL'],
    'ginko-cms content commands require GINKO_CMS_BETTER_AUTH_BASE_URL, CONVEX_SITE_URL, or BETTER_AUTH_URL.',
  )
  const url = new URL(configured)
  const path = url.pathname.replace(/\/+$/, '')
  if (
    (path !== '' && path !== '/api/auth') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('The configured Better Auth URL must be an exact origin or end in /api/auth.')
  }
  return url.origin
}

export function cmsSiteOrigin(cwd: string): string {
  return requiredEnvironment(
    cwd,
    ['SITE_URL', 'NUXT_PUBLIC_SITE_URL'],
    'ginko-cms content commands require SITE_URL or NUXT_PUBLIC_SITE_URL for host asset transfer.',
  )
}

export function convexDeploymentId(cwd: string): string {
  return requiredEnvironment(
    cwd,
    ['CONVEX_DEPLOYMENT'],
    'ginko-cms content commands require CONVEX_DEPLOYMENT.',
  )
}

export function operatorSessionCookie(cwd: string): string {
  return requiredEnvironment(
    cwd,
    ['GINKO_CMS_SESSION_COOKIE'],
    'ginko-cms content commands require GINKO_CMS_SESSION_COOKIE with a current Better Auth session cookie.',
  )
}
