import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const requiredInstallTokens = [
  '@lupinum/ginko-content',
  '@lupinum/ginko-cms',
  '@lupinum/ginko-cms-convex',
  '@convex-dev/better-auth',
  'better-auth',
]

const forbiddenPhrases = [
  // The package README used to claim host apps should not install Convex,
  // Trellis, Better Auth, or the CMS internal packages. The 1.0 install story
  // is explicit: host apps own those dependencies.
  /Consumers should not install\s+`?convex`?,\s+Trellis,\s+Better Auth/i,
  /should not install[^.]*\bconvex\b[^.]*\bBetter Auth\b/i,
]

const docs = [
  { path: 'README.md', required: true, forbidsContradiction: true },
  { path: 'packages/cms/README.md', required: true, forbidsContradiction: true },
]

const errors = []

for (const doc of docs) {
  const absolute = resolve(repoRoot, doc.path)
  const contents = readFileSync(absolute, 'utf8')

  if (doc.required) {
    for (const token of requiredInstallTokens) {
      if (!contents.includes(token)) {
        errors.push(`${doc.path}: missing required install token \`${token}\``)
      }
    }
  }

  if (doc.forbidsContradiction) {
    for (const pattern of forbiddenPhrases) {
      if (pattern.test(contents)) {
        errors.push(`${doc.path}: matches forbidden contradictory wording /${pattern.source}/`)
      }
    }
  }
}

const cliSource = [
  readFileSync(resolve(repoRoot, 'packages/cms/src/cli/ginko-cms.ts'), 'utf8'),
  readFileSync(resolve(repoRoot, 'packages/cms/src/cli/init.ts'), 'utf8'),
].join('\n')
const cliRequiredTokens = ['@convex-dev/better-auth', 'better-auth', '@lupinum/ginko-cms-convex']
for (const token of cliRequiredTokens) {
  if (!cliSource.includes(token)) {
    errors.push(`packages/cms/src/cli: CLI output must mention \`${token}\``)
  }
}

if (errors.length > 0) {
  console.error('Install-story consistency check failed:')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log('Install-story consistency check passed.')
