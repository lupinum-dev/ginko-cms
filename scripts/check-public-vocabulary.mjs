import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const scanRoots = [
  'README.md',
  'packages/cms/README.md',
  'docs',
  'packages/cms/src',
  'packages/cms/studio-app/src',
  'packages/cms/templates',
  'packages/contract/src',
  'test/component',
  'test/module',
  'test/refactor',
  'test/runtime',
  'test/shared',
]

const blocked = [
  { label: 'principal', pattern: /\bprincipal\b/ },
  { label: 'actor', pattern: /\bactor\b/ },
  { label: 'delegation', pattern: /\bdelegation\b/ },
  { label: 'tenantIsolation', pattern: /\btenantIsolation\b/ },
  { label: 'globalTables', pattern: /\bglobalTables\b/ },
  { label: 'usePermissions', pattern: /\busePermissions\b/ },
  { label: 'allows(', pattern: /\ballows\s*\(/ },
  { label: 'defineCapabilities', pattern: /\bdefineCapabilities\b/ },
  { label: 'destructiveSafety', pattern: /\bdestructiveSafety\b/ },
  { label: 'redemptionTable', pattern: /\bredemptionTable\b/ },
  { label: 'trustedForwarding', pattern: /\btrustedForwarding\b/ },
]

const allowlisted = new Set(['test/refactor/no-zombie-paths.test.ts'])

function filesUnder(path) {
  const absolute = resolve(repoRoot, path)
  if (!existsSync(absolute)) return []
  const stat = statSync(absolute)
  if (stat.isFile()) return [absolute]

  const files = []
  for (const name of readdirSync(absolute)) {
    const child = join(absolute, name)
    if (child.includes('/node_modules/') || child.includes('/_generated/')) continue
    const childStat = statSync(child)
    if (childStat.isDirectory()) files.push(...filesUnder(child))
    else if (/\.(?:md|ts|tsx|js|mjs|vue)$/.test(name)) files.push(child)
  }
  return files
}

const violations = []

for (const root of scanRoots) {
  for (const file of filesUnder(root)) {
    const relative = file.slice(repoRoot.length + 1)
    if (allowlisted.has(relative)) continue
    const source = readFileSync(file, 'utf8')
    for (const entry of blocked) {
      if (entry.pattern.test(source)) violations.push(`${relative}: ${entry.label}`)
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Public vocabulary guard failed. Use caller, actingFor, appIdentity, isolation, access, and recordAccess in public Ginko CMS surfaces.',
  )
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log('Public vocabulary guard passed.')
