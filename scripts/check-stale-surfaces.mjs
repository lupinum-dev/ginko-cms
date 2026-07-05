import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ignoredDirs = new Set([
  '.git',
  '.nuxt',
  '.output',
  '.pack',
  'dist',
  'node_modules',
  '_generated',
])
const scannedExtensions = new Set(['.js', '.json', '.md', '.mjs', '.ts', '.vue', '.yaml', '.yml'])
const trackedIgnoredArtifactPathspecs = [
  ':(glob)**/.pack/**',
  ':(glob)**/dist/**',
  ':(glob)**/.nuxt/**',
  ':(glob)**/.output/**',
]
const ignoredFiles = new Set(['journal.md', 'update.md'])

const checks = [
  {
    label: 'legacy publishImpactHash authority',
    pattern: /\bpublishImpactHash\b/,
  },
  {
    label: 'dangerous Studio action gate',
    pattern: /\bdangerousActions\b|\buseDangerousActionsEnabled\b|StudioEntryDeleteDialog/,
  },
  {
    label: 'backup import MVP surface',
    pattern: /\bimportBackup\b/,
  },
  {
    label: 'old public search cursor',
    pattern: /\bsearch:n\b/,
  },
  {
    label: 'private consumer reference',
    pattern: /i18n-cms|\/_temp\/i18n-cms|\/Users\/matthias\/Git\/_temp/,
  },
  {
    label: 'public searchSections export',
    pattern: /\bexport\s+const\s+searchSections\b|bridge\.searchSections|searchSections:\s+true/,
  },
]

function collectFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue
      files.push(...collectFiles(join(directory, entry.name)))
      continue
    }
    if (!entry.isFile()) continue
    const filePath = join(directory, entry.name)
    if (scannedExtensions.has(filePath.slice(filePath.lastIndexOf('.')))) files.push(filePath)
  }
  return files
}

const violations = []

for (const filePath of collectFiles(repoRoot)) {
  const source = readFileSync(filePath, 'utf8')
  const rel = relative(repoRoot, filePath).replaceAll('\\', '/')
  if (ignoredFiles.has(rel)) continue
  if (rel === 'scripts/check-stale-surfaces.mjs') continue
  if (/publicContent\s*:\s*\{[\s\S]*?\bsitemap\s*:/.test(source)) {
    violations.push(`${rel}: stale ginkoCms.publicContent.sitemap option`)
  }
  const lines = source.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const check of checks) {
      if (!check.pattern.test(line)) continue
      violations.push(`${rel}:${index + 1}: ${check.label}`)
    }
  })
}

const trackedIgnoredArtifacts = execFileSync(
  'git',
  ['ls-files', '-ci', '--exclude-standard', ...trackedIgnoredArtifactPathspecs],
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
  console.error('Stale public/debt surface check failed:')
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log('Stale public/debt surface check passed.')
