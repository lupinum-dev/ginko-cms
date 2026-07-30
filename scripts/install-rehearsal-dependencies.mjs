import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const workspacePath = resolve(repoRoot, 'pnpm-workspace.yaml')
const lockfilePath = resolve(repoRoot, 'pnpm-lock.yaml')
const compatibility = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/cms/compatibility.json'), 'utf8'),
)
const candidates = [
  ['better-convex-nuxt', 'BETTER_CONVEX_NUXT_TARBALL'],
  ['better-convex-vue', 'BETTER_CONVEX_VUE_TARBALL'],
  ['better-convex-mcp', 'BETTER_CONVEX_MCP_TARBALL'],
]
const sourceMode = process.argv.includes('--source')

if (process.argv.some((argument) => argument.startsWith('--') && argument !== '--source')) {
  throw new Error('Usage: node scripts/install-rehearsal-dependencies.mjs [--source]')
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

const overrides = {}
for (const [packageName, variable] of candidates) {
  const value = process.env[variable]
  if (!value) throw new Error(`${variable} is required for the Better Convex rehearsal.`)
  const path = resolve(value)
  if (!lstatSync(path).isFile()) {
    throw new Error(`${variable} must resolve to a regular tarball file.`)
  }

  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', path, 'package/package.json'], { encoding: 'utf8' }),
  )
  if (manifest.name !== packageName) {
    throw new Error(`${path} contains ${manifest.name}; expected ${packageName}.`)
  }
  const expectedVersion = compatibility.releaseStack[packageName]
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `${packageName} tarball version is ${manifest.version}; compatibility requires ${expectedVersion}.`,
    )
  }

  if (!sourceMode) {
    const expectedHash = compatibility.releaseArtifacts[packageName]?.sha256
    const actualHash = sha256(path)
    if (actualHash !== expectedHash) {
      throw new Error(
        `${packageName} SHA-256 is ${actualHash}; compatibility requires ${expectedHash}.`,
      )
    }
  }
  overrides[packageName] = `file:${path}`
}

const originalWorkspace = readFileSync(workspacePath, 'utf8')
const originalLockfile = readFileSync(lockfilePath, 'utf8')
const marker = 'overrides:\n'
if (!originalWorkspace.includes(marker)) {
  throw new Error('pnpm-workspace.yaml has no overrides section.')
}
const candidateOverrides = Object.entries(overrides)
  .map(([name, path]) => `  '${name}': '${path.replaceAll("'", "''")}'`)
  .join('\n')
const temporaryWorkspace = originalWorkspace.replace(marker, `${marker}${candidateOverrides}\n`)

try {
  writeFileSync(workspacePath, temporaryWorkspace)
  execFileSync('pnpm', ['install', '--no-frozen-lockfile', '--strict-peer-dependencies'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      npm_config_verify_deps_before_run: 'false',
      PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    },
    stdio: 'inherit',
  })
} finally {
  writeFileSync(workspacePath, originalWorkspace)
  writeFileSync(lockfilePath, originalLockfile)
}

console.log(
  sourceMode
    ? `Installed Better Convex source-rehearsal tarballs from ${compatibility.sourceRehearsal.betterConvexCommit} without changing source.`
    : 'Installed exact immutable Better Convex candidate artifacts without changing source.',
)
