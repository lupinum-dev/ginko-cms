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
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

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
    env: { ...process.env, npm_config_verify_deps_before_run: 'false' },
    stdio,
  })
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
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

function assertContained(parent, child, label) {
  const path = relative(parent, child)
  if (path === '..' || path.startsWith(`..${sep}`)) {
    throw new Error(`${label} escapes its reviewed artifact root.`)
  }
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
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

function requireContentArtifact(manifestPath) {
  const name = '@lupinum/ginko-content'
  const expected = compatibility.releaseArtifacts[name]
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (
    manifest.packageName !== name ||
    manifest.packageVersion !== compatibility.releaseStack[name] ||
    manifest.commit !== expected.sourceCommit ||
    manifest.sha256 !== expected.sha256 ||
    manifest.worktreeDirty !== false ||
    manifest.releaseEligible !== true ||
    manifest.reproduciblePacks !== 2 ||
    typeof manifest.tarball !== 'string' ||
    basename(manifest.tarball) !== manifest.tarball
  ) {
    throw new Error(`${name} release evidence does not match compatibility.json.`)
  }
  const tarball = resolve(dirname(manifestPath), manifest.tarball)
  const actualHash = sha256(tarball)
  if (actualHash !== expected.sha256) {
    throw new Error(`${name} hash is ${actualHash}; compatibility requires ${expected.sha256}.`)
  }
  inspectUpstreamTarball(name, tarball)
  return {
    version: compatibility.releaseStack[name],
    commit: manifest.commit,
    sha256: actualHash,
    path: tarball,
  }
}

function requireBetterConvexSet(manifestPath) {
  const set = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const expectedIds = ['vue', 'nuxt']
  if (
    set.schemaVersion !== 1 ||
    set.version !== compatibility.releaseStack['better-convex-nuxt'] ||
    set.version !== compatibility.releaseStack['better-convex-vue'] ||
    !Array.isArray(set.packages) ||
    set.packages.length !== expectedIds.length ||
    set.packages.some((entry, index) => entry.packageId !== expectedIds[index])
  ) {
    throw new Error('Better Convex candidate-set evidence does not match compatibility.json.')
  }

  const artifactRoot = resolve(dirname(manifestPath), '../../..')
  const result = {}
  for (const entry of set.packages) {
    const name = entry.packageName
    const expected = compatibility.releaseArtifacts[name]
    if (
      !expected ||
      set.sourceCommit !== expected.sourceCommit ||
      entry.sha256 !== expected.sha256 ||
      typeof entry.tarball !== 'string' ||
      typeof entry.evidence !== 'string'
    ) {
      throw new Error(`${name} candidate-set evidence does not match compatibility.json.`)
    }
    const tarball = resolve(artifactRoot, entry.tarball)
    const evidencePath = resolve(artifactRoot, entry.evidence)
    assertContained(artifactRoot, tarball, `${name} tarball`)
    assertContained(artifactRoot, evidencePath, `${name} evidence`)
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
    const actualHash = sha256(tarball)
    if (
      evidence.packageName !== name ||
      evidence.packageId !== entry.packageId ||
      evidence.sourceCommit !== expected.sourceCommit ||
      evidence.version !== compatibility.releaseStack[name] ||
      evidence.tarball?.sha256 !== expected.sha256 ||
      actualHash !== expected.sha256
    ) {
      throw new Error(`${name} package evidence does not match compatibility.json.`)
    }
    if (
      name === 'better-convex-nuxt' &&
      evidence.runtimeFingerprint !== expected.runtimeFingerprint
    ) {
      throw new Error('better-convex-nuxt runtime fingerprint does not match compatibility.json.')
    }
    inspectUpstreamTarball(name, tarball)
    result[name] = {
      version: compatibility.releaseStack[name],
      commit: evidence.sourceCommit,
      sha256: actualHash,
      path: tarball,
      ...(typeof evidence.runtimeFingerprint === 'string'
        ? { runtimeFingerprint: evidence.runtimeFingerprint }
        : {}),
    }
  }
  return result
}

function requireBetterConvexMcp(manifestPath) {
  const name = '@better-convex/mcp'
  const expected = compatibility.releaseArtifacts[name]
  const evidence = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (
    evidence.schemaVersion !== 3 ||
    evidence.packageId !== 'mcp' ||
    evidence.packageName !== name ||
    evidence.version !== compatibility.releaseStack[name] ||
    evidence.sourceCommit !== expected.sourceCommit ||
    evidence.tarball?.sha256 !== expected.sha256 ||
    evidence.tarball?.integrity !== expected.integrity ||
    typeof evidence.tarball?.file !== 'string' ||
    basename(evidence.tarball.file) !== evidence.tarball.file
  ) {
    throw new Error('@better-convex/mcp artifact evidence does not match compatibility.json.')
  }
  const artifactRoot = dirname(manifestPath)
  const tarball = resolve(artifactRoot, evidence.tarball.file)
  assertContained(artifactRoot, tarball, `${name} tarball`)
  const actualHash = sha256(tarball)
  if (actualHash !== expected.sha256) {
    throw new Error(`${name} hash is ${actualHash}; compatibility requires ${expected.sha256}.`)
  }
  inspectUpstreamTarball(name, tarball)
  return {
    version: compatibility.releaseStack[name],
    commit: evidence.sourceCommit,
    sha256: actualHash,
    path: tarball,
  }
}

assertClean(repoRoot, 'Ginko CMS')
const cmsCommit = run('git', ['rev-parse', 'HEAD'], repoRoot, 'pipe').trim()
const contentManifest = resolve(
  process.env.GINKO_CONTENT_ARTIFACT_MANIFEST ??
    resolve(repoRoot, '../ginko-content/.pack/release-artifact.json'),
)
const betterConvexSetManifest = resolve(
  process.env.BETTER_CONVEX_CANDIDATE_SET ??
    resolve(
      repoRoot,
      `../../convex/better-convex-nuxt/.release-artifacts/set/${compatibility.releaseStack['better-convex-nuxt']}/artifact-set.json`,
    ),
)
const betterConvexMcpManifest = resolve(
  process.env.BETTER_CONVEX_MCP_ARTIFACT_MANIFEST ??
    resolve(
      repoRoot,
      `../../convex/better-convex-nuxt/.release-artifacts/mcp/${compatibility.releaseStack['@better-convex/mcp']}/artifact.json`,
    ),
)
const betterConvex = requireBetterConvexSet(betterConvexSetManifest)
const upstream = {
  '@lupinum/ginko-content': requireContentArtifact(contentManifest),
  ...betterConvex,
  '@better-convex/mcp': requireBetterConvexMcp(betterConvexMcpManifest),
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
          commit: artifact.commit,
          sha256: artifact.sha256,
          tarball: basename(artifact.path),
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
    candidate: '0.2.0-rc.1',
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
