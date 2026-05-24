import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const matrixPath = resolve(repoRoot, 'packages/cms/compatibility.json')
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))
const tracked = matrix.tracked ?? {}
const releaseStack = matrix.releaseStack ?? {}

const ignoredDirs = new Set(['.git', '.nuxt', '.output', '.pack', 'dist', 'node_modules'])
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

function collectPackageJsonFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue
      files.push(...collectPackageJsonFiles(join(directory, entry.name)))
      continue
    }
    if (entry.isFile() && entry.name === 'package.json') files.push(join(directory, entry.name))
  }
  return files
}

function isLocalRange(range) {
  return (
    typeof range === 'string' &&
    (range.startsWith('workspace:') || range.startsWith('file:') || range.startsWith('link:'))
  )
}

const violations = []

const packageLocations = {
  '@lupinum/ginko-cms': 'packages/cms/package.json',
  '@lupinum/ginko-cms-convex': 'packages/convex/package.json',
  '@lupinum/ginko-cms-contract': 'packages/contract/package.json',
}

for (const [packageName, expectedVersion] of Object.entries(releaseStack)) {
  const manifestPath = packageLocations[packageName]
  if (!manifestPath) continue

  const manifest = JSON.parse(readFileSync(resolve(repoRoot, manifestPath), 'utf8'))
  if (manifest.version !== expectedVersion) {
    violations.push(
      `${manifestPath} version is ${JSON.stringify(manifest.version)}; expected ${expectedVersion} from compatibility.json`,
    )
  }
}

for (const filePath of collectPackageJsonFiles(repoRoot)) {
  const manifest = JSON.parse(readFileSync(filePath, 'utf8'))
  if (manifest.private === true || typeof manifest.name !== 'string') continue
  if (manifest.version === '0.0.0') {
    violations.push(
      `${relative(repoRoot, filePath).replaceAll('\\', '/')} is publishable at version 0.0.0`,
    )
  }
}

for (const filePath of collectPackageJsonFiles(repoRoot)) {
  if (!existsSync(filePath)) continue
  const manifest = JSON.parse(readFileSync(filePath, 'utf8'))
  const rel = relative(repoRoot, filePath).replaceAll('\\', '/')

  for (const field of dependencyFields) {
    const dependencies = manifest[field] ?? {}
    for (const [name, allowedRanges] of Object.entries(tracked)) {
      const range = dependencies[name]
      if (!range || isLocalRange(range)) continue
      if (!allowedRanges.includes(range)) {
        violations.push(
          `${rel} ${field}.${name} is ${JSON.stringify(range)}; expected one of ${allowedRanges.join(', ')}`,
        )
      }
    }
  }

  const overrides = manifest.pnpm?.overrides ?? {}
  for (const [name, allowedRanges] of Object.entries(tracked)) {
    const range = overrides[name]
    if (!range || isLocalRange(range)) continue
    if (!allowedRanges.includes(range)) {
      violations.push(
        `${rel} pnpm.overrides.${name} is ${JSON.stringify(range)}; expected one of ${allowedRanges.join(', ')}`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error('Compatibility matrix check failed:')
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(`Compatibility matrix check passed: ${matrix.name}`)
