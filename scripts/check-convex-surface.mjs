import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url)
const rootPath = ROOT.pathname
const targetDirectories = ['packages/convex/src']
const targetFiles = []
const trellisAliasPattern = new RegExp(`#${'trellis'}/`)
const forbiddenPatterns = [
  { pattern: /#imports\b/, message: 'Nuxt #imports alias' },
  { pattern: trellisAliasPattern, message: 'Trellis app alias' },
  { pattern: /src\/runtime\/server\//, message: 'Nitro server runtime import' },
  { pattern: /runtime\/server\//, message: 'server runtime import' },
  { pattern: /server\/mcp\//, message: 'MCP server runtime import' },
  { pattern: /server\/middleware\//, message: 'server middleware import' },
  {
    pattern: /\bpublicSearchDocuments\b/,
    message:
      'a separate public search table; keep publicEntries.searchText as the only search read model until a benchmark proves otherwise',
  },
  {
    pattern: /\.paginate\s*\(/,
    message:
      'Query.paginate(); component functions must use explicit indexed cursors because Convex component functions do not support native pagination',
  },
  {
    pattern: /export\s+const\s+recordWrite\b/,
    message:
      'a public generic agent write recorder; agent evidence must be emitted by the transaction performing the real write',
  },
]

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...walk(fullPath))
      continue
    }
    files.push(fullPath)
  }
  return files
}

const files = [
  ...targetFiles.map((file) => join(rootPath, file)),
  ...targetDirectories.flatMap((directory) => walk(join(rootPath, directory))),
].filter((filePath) => filePath.endsWith('.ts'))

const violations = []

for (const filePath of files) {
  const source = readFileSync(filePath, 'utf8')
  const relativePath = relative(rootPath, filePath).replaceAll('\\', '/')
  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(`${relativePath} must not reference ${message}`)
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  process.exit(1)
}
