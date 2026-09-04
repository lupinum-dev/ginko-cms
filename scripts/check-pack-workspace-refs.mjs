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

const localSpecifierPrefixes = ['workspace:', 'file:', 'link:']
const offenders = []

function isLocalSpecifier(range) {
  return (
    typeof range === 'string' && localSpecifierPrefixes.some((prefix) => range.startsWith(prefix))
  )
}

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
    const packageName = manifest.name ?? tarball
    const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
    for (const field of fields) {
      const section = manifest[field]
      if (!section) continue
      for (const [name, range] of Object.entries(section)) {
        if (isLocalSpecifier(range)) {
          offenders.push({
            tarball,
            packageName,
            reason: `${field}.${name} ships ${range} (packed manifests must not contain workspace:, file:, or link: specifiers)`,
          })
        }
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

if (offenders.length > 0) {
  console.error('Packed tarball local specifier check failed:')
  for (const offender of offenders) {
    console.error(`  - ${offender.packageName} (${offender.tarball}): ${offender.reason}`)
  }
  process.exit(1)
}

console.log(`Packed tarball local specifier check passed (${tarballs.length} tarballs).`)
