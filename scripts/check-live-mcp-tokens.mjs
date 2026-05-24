import { readdirSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import process from 'node:process'

const rootDir = resolve(import.meta.dirname, '..')
const scanRoots = [resolve(rootDir)]
const allowedNames = new Set(['.mcp.json'])
const allowedExtensions = new Set([
  '.json',
  '.jsonc',
  '.md',
  '.toml',
  '.yaml',
  '.yml',
  '.env',
  '.example',
])
const tokenPattern = /\b(?:Authorization["']?\s*:\s*["']Bearer\s+)?mcp_[A-Za-z0-9]{24,}\b/g
const placeholderPattern = /\bmcp_(?:your|example|test|placeholder|demo|sample)[\w-]*\b/i
const violations = []

function shouldScanFile(filename) {
  if (allowedNames.has(filename)) return true
  const extension = extname(filename)
  return allowedExtensions.has(extension)
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === 'dist' ||
      entry.name === '.nuxt'
    ) {
      continue
    }
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!entry.isFile() || !shouldScanFile(entry.name)) continue

    const source = readFileSync(fullPath, 'utf8')
    const matches = source.match(tokenPattern) ?? []
    for (const match of matches) {
      if (placeholderPattern.test(match)) continue
      violations.push(`${fullPath}: ${match}`)
    }
  }
}

for (const scanRoot of scanRoots) {
  walk(scanRoot)
}

if (violations.length > 0) {
  console.error('Live MCP bearer tokens detected in tracked config-like files:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}
