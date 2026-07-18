import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const requiredInstallTokens = [
  '@lupinum/ginko-content',
  '@lupinum/ginko-cms',
  '@lupinum/ginko-cms-convex',
  'better-convex-nuxt',
  'better-auth',
]

const forbiddenPhrases = [
  // The package README used to claim host apps should not install Convex,
  // Trellis, Better Auth, better-convex-nuxt, or the CMS internal packages.
  // The 1.0 install story is explicit: host apps own those dependencies.
  /Consumers should not install\s+`?convex`?,\s+Trellis,\s+Better Auth/i,
  /should not install[^.]*\bconvex\b[^.]*\bBetter Auth\b/i,
]

const docs = [
  { path: 'README.md', required: true, forbidsContradiction: true },
  { path: 'packages/cms/README.md', required: true, forbidsContradiction: true },
  {
    path: 'skills/ginko-cms/references/setup-and-env.md',
    required: true,
    forbidsContradiction: true,
  },
]

const activeSetupDocs = [
  '.gitignore',
  'ARCHITECTURE.md',
  'SECURITY.md',
  'skills/ginko-cms/SKILL.md',
  'skills/ginko-cms/references/setup-and-env.md',
  'skills/ginko-cms/references/mcp-agent-workflows.md',
  'skills/ginko-cms/references/repo-development.md',
]

const legacySetupPatterns = [
  /@lupinum\/trellis(?:-bridge|-eslint)?/i,
  /CONVEX_IDENTITY_FORWARDING_KEY/,
  /GINKO_CMS_COMPONENT_FORWARDING_KEY/,
  /ginkoCmsMcp\.ts/,
  /trellis bridge generate/i,
]

const canonicalDeployDocs = [
  'README.md',
  'packages/cms/README.md',
  'docs/getting-started/quickstart.md',
  'docs/getting-started/environment.md',
  'docs/maintenance/release-candidate.md',
]

const publicContentDocs = [
  'docs/reference/public-content-api.md',
  'docs/reference/nuxt-content-provider.md',
  'skills/ginko-cms/references/public-content-and-provider.md',
]

const stalePublicContentPatterns = [
  /useContentSearchResults\(/,
  /content\.search\.engine\s*=\s*['"]cms['"]/,
]

const oldSetupOrderPattern =
  /pnpm exec convex dev --once[\s\S]{0,240}?pnpm exec ginko-cms push(?! --check)/

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

for (const docPath of activeSetupDocs) {
  const contents = readFileSync(resolve(repoRoot, docPath), 'utf8')
  for (const pattern of legacySetupPatterns) {
    if (pattern.test(contents)) {
      errors.push(
        `${docPath}: active setup documentation contains legacy claim /${pattern.source}/`,
      )
    }
  }
}

for (const docPath of canonicalDeployDocs) {
  const contents = readFileSync(resolve(repoRoot, docPath), 'utf8')
  if (!contents.includes('pnpm exec ginko-cms deploy')) {
    errors.push(`${docPath}: canonical setup path must use \`pnpm exec ginko-cms deploy\``)
  }
  if (oldSetupOrderPattern.test(contents)) {
    errors.push(`${docPath}: canonical setup path must not document convex-dev-then-push`)
  }
}

for (const docPath of publicContentDocs) {
  const contents = readFileSync(resolve(repoRoot, docPath), 'utf8')
  for (const pattern of stalePublicContentPatterns) {
    if (pattern.test(contents)) {
      errors.push(`${docPath}: public content documentation contains stale API /${pattern.source}/`)
    }
  }
}

const cliSource = [
  readFileSync(resolve(repoRoot, 'packages/cms/src/cli/ginko-cms.ts'), 'utf8'),
  readFileSync(resolve(repoRoot, 'packages/cms/src/cli/init.ts'), 'utf8'),
].join('\n')
const cliRequiredTokens = ['better-convex-nuxt', 'better-auth', '@lupinum/ginko-cms-convex']
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
