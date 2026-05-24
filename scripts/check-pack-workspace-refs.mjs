import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packDir = resolve(repoRoot, '.pack')

if (!existsSync(packDir)) {
  console.error(
    `Missing ${packDir}. Run \`pnpm run package:e2e\` (or \`pnpm pack\` on each package) first.`,
  )
  process.exit(1)
}

const tarballs = readdirSync(packDir).filter((file) => file.endsWith('.tgz'))
if (tarballs.length === 0) {
  console.error(`No tarballs under ${packDir}.`)
  process.exit(1)
}

const offenders = []

for (const tarball of tarballs) {
  const tempDir = mkdtempSync(join(tmpdir(), 'ginko-cms-pack-check-'))
  try {
    execFileSync('tar', ['-xzf', resolve(packDir, tarball)], {
      cwd: tempDir,
      stdio: 'pipe',
    })
    const packageJsonPath = join(tempDir, 'package', 'package.json')
    if (!existsSync(packageJsonPath)) {
      offenders.push({ tarball, reason: 'missing package/package.json after extract' })
      continue
    }
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
    for (const field of fields) {
      const section = manifest[field]
      if (!section) continue
      for (const [name, range] of Object.entries(section)) {
        if (typeof range === 'string' && range.startsWith('workspace:')) {
          offenders.push({
            tarball,
            reason: `${field}.${name} ships ${range} (publishable packages must resolve to concrete semver)`,
          })
        }
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

if (offenders.length > 0) {
  console.error('Packed tarball workspace:* check failed:')
  for (const offender of offenders) {
    console.error(`  - ${offender.tarball}: ${offender.reason}`)
  }
  process.exit(1)
}

console.log(`Packed tarball workspace:* check passed (${tarballs.length} tarballs).`)
