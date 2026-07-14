import { resolve } from 'node:path'

import { checkConvexComponentInstall } from '../module/convex.js'
import { type CliIo, write } from './args.js'
import { readIfExists, readLocalEnv } from './env.js'

function hasHostDependency(cwd: string, name: string): boolean {
  const packageJsonSource = readIfExists(resolve(cwd, 'package.json'))
  if (!packageJsonSource) return false
  const packageJson = JSON.parse(packageJsonSource) as {
    dependencies?: Record<string, string>
  }
  return Boolean(packageJson.dependencies?.[name])
}

export async function runMcpDoctor(cwd: string, io: CliIo): Promise<number> {
  let issues = 0
  const env = readLocalEnv(cwd)
  const readEnv = (key: string) => (process.env[key] ?? env[key])?.trim()
  const hasEnv = (key: string) => Boolean(readEnv(key))
  const explicitSiteUrl = readEnv('NUXT_PUBLIC_CONVEX_SITE_URL') ?? readEnv('CONVEX_SITE_URL')
  const convexUrl = readEnv('NUXT_PUBLIC_CONVEX_URL') ?? readEnv('CONVEX_URL')
  const hasResolvableSiteUrl = Boolean(explicitSiteUrl || canDeriveConvexSiteUrl(convexUrl))
  const convexSetupIssues = checkConvexComponentInstall(cwd)
  const checks = [
    {
      name: 'Convex URL',
      ok: hasEnv('NUXT_PUBLIC_CONVEX_URL') || hasEnv('CONVEX_URL'),
      fix: 'Set NUXT_PUBLIC_CONVEX_URL or CONVEX_URL in .env.local or the server environment.',
    },
    {
      name: 'Convex site URL',
      ok: hasResolvableSiteUrl,
      fix: 'Set NUXT_PUBLIC_CONVEX_SITE_URL or CONVEX_SITE_URL when the Convex site URL cannot be derived from the deployment URL.',
    },
    {
      name: 'secure-exec host dependency',
      ok: hasHostDependency(cwd, 'secure-exec'),
      fix: 'Add "secure-exec": "^0.2.1" to dependencies. Nuxt MCP code mode resolves it from the host app root at runtime.',
    },
    {
      name: 'Convex setup, root adapters, and dependencies',
      ok: convexSetupIssues.length === 0,
      fix: convexSetupIssues.map((issue) => issue.fix).join(' '),
    },
  ]

  write(io.stdout, `Ginko CMS MCP doctor for ${cwd}\n`)
  for (const check of checks) {
    write(io.stdout, `  ${check.ok ? 'ok' : 'missing'} - ${check.name}\n`)
    if (!check.ok) {
      issues += 1
      write(io.stderr, `Fix ${check.name}: ${check.fix}\n`)
    }
  }
  if (issues > 0) {
    write(io.stderr, `After fixes, deploy Convex with: pnpm exec convex deploy --yes\n`)
  }
  return issues === 0 ? 0 : 1
}

function canDeriveConvexSiteUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return (
      url.hostname.endsWith('.convex.cloud') ||
      ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '3210')
    )
  } catch {
    return false
  }
}
