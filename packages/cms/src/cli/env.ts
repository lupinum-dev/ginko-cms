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

export function cmsSiteOrigin(cwd: string): string {
  return requiredEnvironment(
    cwd,
    ['SITE_URL', 'NUXT_PUBLIC_SITE_URL'],
    'Ginko CMS owner and content commands require SITE_URL or NUXT_PUBLIC_SITE_URL for the host application.',
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
    'Ginko CMS owner commands require GINKO_CMS_SESSION_COOKIE with a current Better Auth session cookie.',
  )
}
