import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const rootDir = resolve(import.meta.dirname, '..')
const componentDir = resolve(rootDir, 'packages/convex/src')

const unsafeRawAllowlist = new Set([
  'packages/convex/src/contractTransitions.ts',
  'packages/convex/src/settings.ts',
])

const generatedServerBuilderAllowlist = new Set(['packages/convex/src/functions.ts'])

const violations = []

function collectTsFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '_generated') continue
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'test.setup.ts') {
      files.push(fullPath)
    }
  }
  return files
}

for (const file of collectTsFiles(componentDir)) {
  const rel = relative(rootDir, file)
  const source = readFileSync(file, 'utf8')

  if (!unsafeRawAllowlist.has(rel) && /\bunsafeRaw\.(?:query|mutation)\s*\(/.test(source)) {
    violations.push(`${rel}: unsafeRaw is allowlisted only for installer/bootstrap escape hatches.`)
  }

  if (/\bapp\.(?:query|mutation)\s*\(/.test(source)) {
    violations.push(
      `${rel}: use publicQuery/callerQuery/publicMutation/callerMutation instead of app.*.`,
    )
  }

  if (/\braw\.(?:query|mutation)\s*\(/.test(source)) {
    violations.push(
      `${rel}: use publicQuery/publicMutation or unsafeRaw via functions.ts instead of raw.*.`,
    )
  }

  if (
    !generatedServerBuilderAllowlist.has(rel) &&
    /import\s*\{[^}]*\b(?:query|mutation)\b[^}]*\}\s*from\s*["'](?:\.\.\/|\.\/)_generated\/server(?:\.js)?["']/.test(
      source,
    )
  ) {
    violations.push(
      `${rel}: direct query/mutation imports from _generated/server are banned outside functions.ts.`,
    )
  }
}

if (violations.length > 0) {
  console.error('Component auth boundary violations detected:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}
