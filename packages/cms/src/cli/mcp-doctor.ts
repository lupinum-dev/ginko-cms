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
  const hasEnv = (key: string) => Boolean((process.env[key] ?? env[key])?.trim())
  const hasBetterAuthBaseUrl =
    hasEnv('GINKO_CMS_BETTER_AUTH_BASE_URL') ||
    hasEnv('CONVEX_SITE_URL') ||
    hasEnv('BETTER_AUTH_URL')
  const convexSetupIssues = checkConvexComponentInstall(cwd)
  const checks = [
    {
      name: 'Convex URL',
      ok: hasEnv('NUXT_PUBLIC_CONVEX_URL') || hasEnv('CONVEX_URL'),
      fix: 'Set NUXT_PUBLIC_CONVEX_URL or CONVEX_URL in .env.local or the server environment.',
    },
    {
      name: 'Better Auth base URL',
      ok: hasBetterAuthBaseUrl,
      fix: 'Set GINKO_CMS_BETTER_AUTH_BASE_URL, CONVEX_SITE_URL, or BETTER_AUTH_URL in .env.local or the server environment.',
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
