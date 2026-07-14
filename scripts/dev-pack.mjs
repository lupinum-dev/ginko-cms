import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const outputRoot = resolve(repoRoot, '.pack/dev')
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

function fileManifest(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) {
        files.push({
          path: relative(root, path).replaceAll('\\', '/'),
          bytes: statSync(path).size,
          sha256: sha256(path),
        })
      }
    }
  }
  visit(root)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function inspectPackage(tarball, temporaryRoot, expectedName, expectedVersion) {
  const inspectionRoot = resolve(temporaryRoot, `inspect-${expectedName.replaceAll('/', '-')}`)
  mkdirSync(inspectionRoot)
  run('tar', ['-xzf', tarball, '-C', inspectionRoot])
  const packageRoot = resolve(inspectionRoot, 'package')
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
  if (manifest.name !== expectedName || manifest.version !== expectedVersion) {
    throw new Error(
      `Development artifact contains ${manifest.name}@${manifest.version}; expected ${expectedName}@${expectedVersion}.`,
    )
  }
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (/^(?:workspace|file|link):/.test(range)) {
        throw new Error(`Development artifact ships ${field}.${name} as ${range}.`)
      }
    }
  }
  return fileManifest(packageRoot)
}

const commit = run('git', ['rev-parse', '--short=12', 'HEAD'], repoRoot, 'pipe').trim()
const worktreeDirty =
  run('git', ['status', '--porcelain', '--untracked-files=normal'], repoRoot, 'pipe').trim()
    .length > 0

mkdirSync(outputRoot, { recursive: true })
run('pnpm', ['--filter', '@lupinum/ginko-cms', 'build'])

const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'ginko-cms-dev-pack-'))
try {
  const packRoot = resolve(temporaryRoot, 'packed')
  mkdirSync(packRoot)

  for (const [name, packageDirectory] of packages) {
    const sourceManifest = JSON.parse(
      readFileSync(resolve(repoRoot, packageDirectory, 'package.json'), 'utf8'),
    )
    run('pnpm', [
      '--dir',
      packageDirectory,
      'pack',
      '--config.ignore-scripts=true',
      '--pack-destination',
      packRoot,
    ])
    const packedName = name.replace('@', '').replace('/', '-')
    const temporaryName = `${packedName}-${sourceManifest.version}.tgz`
    const temporaryTarball = resolve(packRoot, temporaryName)
    if (!existsSync(temporaryTarball)) {
      throw new Error(`Development pack did not produce ${temporaryName}.`)
    }

    const artifactHash = sha256(temporaryTarball)
    const filename = `${packedName}-${sourceManifest.version}-dev.${commit}.${artifactHash}.tgz`
    const metadataName = `${filename}.json`
    const finalTarball = resolve(outputRoot, filename)
    const finalMetadata = resolve(outputRoot, metadataName)
    if (existsSync(finalTarball) || existsSync(finalMetadata)) {
      throw new Error(`Development artifact already exists: ${finalTarball}`)
    }

    const files = inspectPackage(
      temporaryTarball,
      temporaryRoot,
      sourceManifest.name,
      sourceManifest.version,
    )
    const metadata = {
      format: 'ginko-cms-development-artifact',
      version: 1,
      package: sourceManifest.name,
      packageVersion: sourceManifest.version,
      commit,
      worktreeDirty,
      node: process.version,
      pnpm: run('pnpm', ['--version'], repoRoot, 'pipe').trim(),
      tarball: filename,
      sha256: artifactHash,
      files,
    }

    const temporaryOutput = resolve(outputRoot, `.${filename}.tmp`)
    const temporaryMetadata = resolve(outputRoot, `.${metadataName}.tmp`)
    copyFileSync(temporaryTarball, temporaryOutput)
    writeFileSync(temporaryMetadata, `${JSON.stringify(metadata, null, 2)}\n`)
    renameSync(temporaryOutput, finalTarball)
    renameSync(temporaryMetadata, finalMetadata)

    console.log(`Development artifact: ${finalTarball}`)
    console.log(`SHA-256: ${artifactHash}`)
    console.log(`Evidence: ${finalMetadata}`)
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
