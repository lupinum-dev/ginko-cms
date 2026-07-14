import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const scannedExtensions = new Set(['.js', '.json', '.md', '.mjs', '.ts', '.vue', '.yaml', '.yml'])
const privatePathPattern = /i18n-cms|\/_temp\/i18n-cms|\/Users\/matthias\/Git\/_temp/
const ignoredFiles = new Set(['scripts/check-release-hygiene.mjs'])

const trackedFiles = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const violations = trackedFiles.flatMap((relativePath) => {
  if (ignoredFiles.has(relativePath)) return []
  if (!existsSync(join(repoRoot, relativePath))) return []
  const extension = relativePath.slice(relativePath.lastIndexOf('.'))
  if (!scannedExtensions.has(extension)) return []
  if (!privatePathPattern.test(readFileSync(join(repoRoot, relativePath), 'utf8'))) return []
  return [`${relativePath}: private consumer path`]
})

const trackedIgnoredArtifacts = execFileSync(
  'git',
  [
    'ls-files',
    '-ci',
    '--exclude-standard',
    ':(glob)**/.pack/**',
    ':(glob)**/dist/**',
    ':(glob)**/.nuxt/**',
    ':(glob)**/.output/**',
  ],
  { cwd: repoRoot, encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)

for (const artifact of trackedIgnoredArtifacts) {
  violations.push(`${artifact}: ignored generated/release artifact is tracked`)
}

execFileSync(process.execPath, [join(repoRoot, 'scripts/check-convex-template-sync.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
})

if (violations.length > 0) {
  console.error('Release hygiene check failed:')
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log('Release hygiene check passed.')
