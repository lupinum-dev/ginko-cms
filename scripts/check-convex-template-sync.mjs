import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const templateRoot = join(repoRoot, 'packages/cms/templates/convex')
const targetRoots = [
  join(repoRoot, 'playground/convex'),
  join(repoRoot, 'test/fixtures/basic/convex'),
]
const rootGeneratedFiles = ['auth.ts', 'convex.config.ts', 'http.ts']
const generatedDirs = ['betterAuth', 'ginkoCms']
const ignoredNames = new Set(['_generated'])

function toRepoPath(filePath) {
  return relative(repoRoot, filePath).replaceAll('\\', '/')
}

function collectGeneratedFiles(directory, prefix = '') {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name)) continue
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectGeneratedFiles(fullPath, relPath))
    } else if (entry.isFile()) {
      files.push(relPath)
    }
  }
  return files
}

const generatedFiles = [
  ...rootGeneratedFiles,
  ...generatedDirs.flatMap((dir) => collectGeneratedFiles(join(templateRoot, dir), dir)),
].sort()

const violations = []

for (const targetRoot of targetRoots) {
  for (const relPath of generatedFiles) {
    const templatePath = join(templateRoot, relPath)
    const targetPath = join(targetRoot, relPath)
    if (!existsSync(targetPath)) {
      violations.push(
        `${toRepoPath(targetPath)}: missing generated setup file from ${toRepoPath(templatePath)}`,
      )
      continue
    }
    if (!statSync(targetPath).isFile()) {
      violations.push(
        `${toRepoPath(targetPath)}: expected generated setup file from ${toRepoPath(templatePath)}`,
      )
      continue
    }
    const templateSource = readFileSync(templatePath, 'utf8')
    const targetSource = readFileSync(targetPath, 'utf8')
    if (templateSource !== targetSource) {
      violations.push(
        `${toRepoPath(targetPath)}: differs from generated template ${toRepoPath(templatePath)}`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error('Convex generated setup drift check failed:')
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log('Convex generated setup drift check passed.')
