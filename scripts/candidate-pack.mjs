import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const outputRoot = resolve(repoRoot, '.pack/candidate')
const compatibility = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/cms/compatibility.json'), 'utf8'),
)
const packages = [
  ['@lupinum/ginko-cms-contract', 'packages/contract'],
  ['@lupinum/ginko-cms-convex', 'packages/convex'],
  ['@lupinum/ginko-cms', 'packages/cms'],
]

function run(command, args, cwd = repoRoot, stdio = 'inherit') {
  return execFileSync(command, args, {
    cwd,
    encoding: stdio === 'pipe' ? 'utf8' : undefined,
    env: {
      ...process.env,
      npm_config_verify_deps_before_run: 'false',
      PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    },
    stdio,
  })
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function integrity(path) {
  return `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`
}

function assertClean(root, name) {
  const status = run(
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    root,
    'pipe',
  ).trim()
  if (status) throw new Error(`${name} must be clean before candidate packing:\n${status}`)
}

function packedManifest(tarball, temporaryRoot, label) {
  const extractRoot = resolve(temporaryRoot, `extract-${label}`)
  mkdirSync(extractRoot)
  run('tar', ['-xzf', tarball, '-C', extractRoot])
  const root = resolve(extractRoot, 'package')
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) {
        const stat = lstatSync(path)
        files.push({
          path: relative(root, path).replaceAll('\\', '/'),
          mode: stat.mode & 0o777,
          bytes: stat.size,
          sha256: sha256(path),
        })
      }
    }
  }
  visit(root)
  return {
    packageManifest: JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')),
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  }
}

function packSet(temporaryRoot, runIndex) {
  const packRoot = resolve(temporaryRoot, `pack-${runIndex}`)
  mkdirSync(packRoot)
  const result = {}
  for (const [name, packagePath] of packages) {
    run('pnpm', [
      '--dir',
      packagePath,
      'pack',
      '--config.ignore-scripts=true',
      '--pack-destination',
      packRoot,
    ])
    const expectedVersion = compatibility.releaseStack[name]
    const normalizedName = name.replace('@', '').replace('/', '-')
    const filename = readdirSync(packRoot).find(
      (file) => file === `${normalizedName}-${expectedVersion}.tgz`,
    )
    if (!filename) throw new Error(`Pack ${runIndex} did not produce ${name}@${expectedVersion}.`)
    const path = resolve(packRoot, filename)
    const manifest = packedManifest(path, temporaryRoot, `${runIndex}-${normalizedName}`)
    if (
      manifest.packageManifest.name !== name ||
      manifest.packageManifest.version !== expectedVersion
    ) {
      throw new Error(`Packed manifest mismatch for ${name}@${expectedVersion}.`)
    }
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [dependency, range] of Object.entries(manifest.packageManifest[field] ?? {})) {
        if (/^(?:workspace|file|link):/.test(range)) {
          throw new Error(`${name} ships ${field}.${dependency} as ${range}.`)
        }
      }
    }
    result[name] = { path, filename, sha256: sha256(path), ...manifest }
  }
  return result
}

function inspectUpstreamTarball(name, tarball) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'ginko-cms-upstream-inspect-'))
  try {
    const { packageManifest } = packedManifest(tarball, temporaryRoot, 'upstream')
    if (
      packageManifest.name !== name ||
      packageManifest.version !== compatibility.releaseStack[name]
    ) {
      throw new Error(`Packed ${name} manifest does not match the compatibility release stack.`)
    }
    return packageManifest
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

function requireUpstreamTarball(name, tarballPath) {
  const expected = compatibility.releaseArtifacts[name]
  if (typeof expected.integrity !== 'string' || typeof expected.sha256 !== 'string') {
    throw new Error(`${name} release evidence is incomplete in compatibility.json.`)
  }
  const tarball = resolve(tarballPath)
  const actualHash = sha256(tarball)
  if (actualHash !== expected.sha256) {
    throw new Error(`${name} hash is ${actualHash}; compatibility requires ${expected.sha256}.`)
  }
  const actualIntegrity = integrity(tarball)
  if (actualIntegrity !== expected.integrity) {
    throw new Error(
      `${name} integrity is ${actualIntegrity}; compatibility requires ${expected.integrity}.`,
    )
  }
  inspectUpstreamTarball(name, tarball)
  return {
    version: compatibility.releaseStack[name],
    ...(expected.sourceCommit ? { commit: expected.sourceCommit } : {}),
    ...(expected.registry ? { registry: expected.registry } : {}),
    integrity: actualIntegrity,
    sha256: actualHash,
    path: tarball,
  }
}

assertClean(repoRoot, 'Ginko CMS')
const cmsCommit = run('git', ['rev-parse', 'HEAD'], repoRoot, 'pipe').trim()
const upstreamTarball = (name, variable) =>
  resolve(
    process.env[variable] ??
      resolve(
        repoRoot,
        `.pack/upstream/${name.replace('@', '').replace('/', '-')}-${compatibility.releaseStack[name]}.tgz`,
      ),
  )
const nuxtEvidence = compatibility.releaseArtifacts['better-convex-nuxt']
if (typeof nuxtEvidence?.runtimeFingerprint !== 'string') {
  throw new Error(
    'better-convex-nuxt release evidence is pending in compatibility.json; candidate packing is blocked.',
  )
}
const upstream = {
  '@lupinum/ginko-content': requireUpstreamTarball(
    '@lupinum/ginko-content',
    upstreamTarball('@lupinum/ginko-content', 'GINKO_CONTENT_TARBALL'),
  ),
  'better-convex-vue': {
    ...requireUpstreamTarball(
      'better-convex-vue',
      upstreamTarball('better-convex-vue', 'BETTER_CONVEX_VUE_TARBALL'),
    ),
  },
  'better-convex-nuxt': {
    ...requireUpstreamTarball(
      'better-convex-nuxt',
      upstreamTarball('better-convex-nuxt', 'BETTER_CONVEX_NUXT_TARBALL'),
    ),
    runtimeFingerprint: nuxtEvidence.runtimeFingerprint,
  },
  '@better-convex/mcp': requireUpstreamTarball(
    '@better-convex/mcp',
    upstreamTarball('@better-convex/mcp', 'BETTER_CONVEX_MCP_TARBALL'),
  ),
}

run('pnpm', ['--filter', '@lupinum/ginko-cms', 'build'])
assertClean(repoRoot, 'Ginko CMS after build')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'ginko-cms-candidate-pack-'))
try {
  const first = packSet(temporaryRoot, 1)
  assertClean(repoRoot, 'Ginko CMS after first pack')
  const second = packSet(temporaryRoot, 2)
  assertClean(repoRoot, 'Ginko CMS after second pack')

  for (const [name] of packages) {
    if (first[name].sha256 !== second[name].sha256) {
      throw new Error(`${name} archives differ between serial packs.`)
    }
    if (JSON.stringify(first[name].files) !== JSON.stringify(second[name].files)) {
      throw new Error(`${name} content manifests differ between serial packs.`)
    }
    if (
      JSON.stringify(first[name].packageManifest) !== JSON.stringify(second[name].packageManifest)
    ) {
      throw new Error(`${name} package manifests differ between serial packs.`)
    }
  }

  rmSync(outputRoot, { recursive: true, force: true })
  mkdirSync(outputRoot, { recursive: true })
  for (const artifact of Object.values(upstream)) {
    copyFileSync(artifact.path, resolve(outputRoot, basename(artifact.path)))
  }
  for (const artifact of Object.values(first)) {
    copyFileSync(artifact.path, resolve(outputRoot, artifact.filename))
  }

  const artifacts = {
    ...Object.fromEntries(
      Object.entries(upstream).map(([name, artifact]) => [
        name,
        {
          version: artifact.version,
          sha256: artifact.sha256,
          tarball: basename(artifact.path),
          ...(artifact.commit ? { commit: artifact.commit } : {}),
          ...(artifact.registry ? { registry: artifact.registry } : {}),
          ...(artifact.integrity ? { integrity: artifact.integrity } : {}),
          ...(artifact.runtimeFingerprint
            ? { runtimeFingerprint: artifact.runtimeFingerprint }
            : {}),
        },
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(first).map(([name, artifact]) => [
        name,
        {
          version: compatibility.releaseStack[name],
          commit: cmsCommit,
          sha256: artifact.sha256,
          tarball: artifact.filename,
          files: artifact.files,
        },
      ]),
    ),
  }
  const evidence = {
    candidate: compatibility.releaseStack['@lupinum/ginko-cms'],
    source: { commit: cmsCommit, dirty: false },
    toolchain: {
      node: process.version,
      pnpm: run('pnpm', ['--version'], repoRoot, 'pipe').trim(),
      os: `${process.platform}-${process.arch}`,
    },
    reproduciblePacks: 2,
    artifacts,
  }
  writeFileSync(
    resolve(outputRoot, 'candidate-artifact.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
  )
  console.log(`Candidate tuple written to ${outputRoot}.`)
  for (const [name, artifact] of Object.entries(artifacts)) {
    console.log(`${name}@${artifact.version}: ${artifact.sha256}`)
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
