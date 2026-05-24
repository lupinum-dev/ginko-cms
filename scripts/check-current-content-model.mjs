import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ignoredDirs = new Set(['.git', '.nuxt', '.output', '.pack', 'dist', 'node_modules'])
const scannedRoots = ['docs', 'README.md', 'packages']
const scannedExtensions = new Set(['.md', '.mdx', '.ts', '.tsx', '.js', '.mjs', '.vue'])

const staleModelTerms = [
  'entryLocales',
  'draftHistory',
  'entryVersions',
  'publicProjectionRuns',
  'publicNavTrees',
  'publicSitemapEntries',
  'publicTranslationSummaries',
  'entryRoutes',
  'entryNavigation',
  'entrySeo',
]

function shouldScan(filePath) {
  if (filePath.endsWith('a_target.md')) return false
  const ext = filePath.slice(filePath.lastIndexOf('.'))
  return scannedExtensions.has(ext)
}

function collectFiles(target) {
  if (!existsSync(target)) return []
  const stat = statSync(target)
  if (stat.isFile()) return shouldScan(target) ? [target] : []
  if (!stat.isDirectory()) return []

  const files = []
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue
      files.push(...collectFiles(join(target, entry.name)))
      continue
    }
    const filePath = join(target, entry.name)
    if (entry.isFile() && shouldScan(filePath)) files.push(filePath)
  }
  return files
}

const files = scannedRoots.flatMap((root) => collectFiles(join(repoRoot, root)))
const violations = []

for (const filePath of files) {
  const source = readFileSync(filePath, 'utf8')
  const rel = relative(repoRoot, filePath).replaceAll('\\', '/')
  const lines = source.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const term of staleModelTerms) {
      if (!new RegExp(`\\b${term}\\b`).test(line)) continue
      violations.push(`${rel}:${index + 1}: stale model term ${term}`)
    }
  })
}

if (violations.length > 0) {
  console.error('Current content model check failed:')
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log('Current content model check passed.')
