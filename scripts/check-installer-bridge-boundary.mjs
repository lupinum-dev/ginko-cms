import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'

const rootPath = new URL('..', import.meta.url).pathname
const scanRoots = ['packages/cms/src/bridge', 'packages/convex/src', 'packages/contract/src']
const blockedPatterns = [
  {
    pattern: /\b(?:check|install)CollectionContractsAuthed\b/,
    message:
      'collection contract sync must use generated internal bridge functions with deploy-key admin auth',
  },
  {
    pattern: /\bGINKO_CMS_INSTALL_SECRET\b/,
    message: 'collection contract sync no longer has a Ginko install secret',
  },
  {
    pattern: /\binstallCollectionContractSnapshots\b/,
    message: 'public collection contract install snapshots are forbidden',
  },
  {
    pattern: /\bINSTALLER BRIDGE EXCEPTION\b/,
    message: 'the installer bridge exception was removed with the deploy-key sync path',
  },
]

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      if (entry === '_generated') continue
      files.push(...walk(fullPath))
      continue
    }
    if (entry.endsWith('.ts')) files.push(fullPath)
  }
  return files
}

const violations = []
const files = scanRoots.flatMap((directory) => walk(join(rootPath, directory)))

for (const filePath of files) {
  const source = readFileSync(filePath, 'utf8')
  const rel = relative(rootPath, filePath).replaceAll('\\', '/')
  for (const blocked of blockedPatterns) {
    if (blocked.pattern.test(source)) {
      violations.push(`${rel}: ${blocked.message}.`)
    }
  }
}

if (violations.length > 0) {
  console.error('Installer bridge boundary violations detected:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}
