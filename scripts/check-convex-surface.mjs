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
    pattern: /\.paginate\s*\(/,
    message:
      'Query.paginate(); component functions must use explicit indexed cursors because Convex component functions do not support native pagination',
  },
  {
    pattern: /export\s+const\s+recordWrite\b/,
    message:
      'a public generic agent write recorder; agent evidence must be emitted by the transaction performing the real write',
  },
  {
    pattern: /\bpublicEntryPayloads\b/,
    message:
      'the removed publicEntryPayloads table; bounded public data belongs on the single publicEntries row',
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

const schemaSource = readFileSync(join(rootPath, 'packages/convex/src/schema.ts'), 'utf8')
const publicEntriesStart = schemaSource.indexOf('publicEntries: defineTable({')
const publicPayloadsStart = schemaSource.indexOf('publicEntryPayloads: defineTable({')
const publicSearchStart = schemaSource.indexOf('publicSearchEntries: defineTable({')
if (publicEntriesStart < 0 || publicSearchStart < 0) {
  violations.push(
    'packages/convex/src/schema.ts must define publicEntries and publicSearchEntries projections',
  )
} else {
  const publicEntriesDefinition = schemaSource.slice(publicEntriesStart, publicSearchStart)
  const publicSearchDefinition = schemaSource.slice(
    publicSearchStart,
    schemaSource.indexOf('assets: defineTable({', publicSearchStart),
  )
  if (publicPayloadsStart >= 0) {
    violations.push(
      'packages/convex/src/schema.ts must keep public payload fields on publicEntries, not a second publicEntryPayloads projection',
    )
  }
  if (/\b(?:bodyAst|bodyMdc|searchText|toc)\s*:/u.test(publicEntriesDefinition)) {
    violations.push(
      'packages/convex/src/schema.ts publicEntries must remain body- and search-text-free',
    )
  }
  for (const field of ['data', 'cacheTags', 'assetFacts']) {
    if (!new RegExp(`\\b${field}\\s*:`).test(publicEntriesDefinition)) {
      violations.push(`packages/convex/src/schema.ts publicEntries must own ${field}`)
    }
  }
  if (!/revisionId:\s*v\.id\('entryRevisions'\)/u.test(publicSearchDefinition)) {
    violations.push(
      'packages/convex/src/schema.ts publicSearchEntries must be fenced by its canonical revisionId',
    )
  }
  if (!/searchText:\s*v\.string\(\)/u.test(publicSearchDefinition)) {
    violations.push(
      'packages/convex/src/schema.ts publicSearchEntries must own the bounded public search text',
    )
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  process.exit(1)
}
