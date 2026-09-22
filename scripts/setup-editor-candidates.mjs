#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const candidateRoot = resolve(repoRoot, '.candidate/editor-integration')
const cmsPackageRoot = resolve(repoRoot, 'packages/cms')
const linkRoots = existsSync(resolve(cmsPackageRoot, 'package.json'))
  ? [repoRoot, cmsPackageRoot, resolve(repoRoot, 'packages/convex')]
  : [repoRoot]

function candidate(name, pathVariable, hashVariable, optional = false) {
  const archiveValue = process.env[pathVariable]
  const expectedHash = process.env[hashVariable]
  if (optional && !archiveValue && !expectedHash) return null
  if (!archiveValue || !expectedHash) {
    throw new Error(`${pathVariable} and ${hashVariable} must be supplied together.`)
  }
  const archive = resolve(archiveValue)
  if (!existsSync(archive)) throw new Error(`${pathVariable} does not exist: ${archive}`)
  const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex')
  if (sha256 !== expectedHash) {
    throw new Error(
      `${name} archive SHA-256 mismatch: expected ${expectedHash}, received ${sha256}.`,
    )
  }
  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }),
  )
  if (manifest.name !== name || typeof manifest.version !== 'string') {
    throw new Error(`${archive} is not a packed ${name} candidate.`)
  }
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [dependency, specifier] of Object.entries(manifest[section] ?? {})) {
      if (/^(?:file|link|workspace):/.test(String(specifier))) {
        throw new Error(`${name} ${section}.${dependency} contains local specifier ${specifier}.`)
      }
    }
  }
  return { archive, name, sha256, version: manifest.version }
}

const editor = candidate('@lupinum/ginko-editor', 'GINKO_EDITOR_TARBALL', 'GINKO_EDITOR_SHA256')
const content = candidate('@lupinum/ginko-content', 'GINKO_CONTENT_TARBALL', 'GINKO_CONTENT_SHA256')
const docs = candidate('@lupinum/ginko-docs', 'GINKO_DOCS_TARBALL', 'GINKO_DOCS_SHA256', true)
const hostRequire = createRequire(resolve(repoRoot, 'package.json'))
const hostVue = realpathSync(dirname(hostRequire.resolve('vue/package.json')))
const hostNuxt = docs ? realpathSync(dirname(hostRequire.resolve('nuxt/package.json'))) : null
const hostVueRouter = docs
  ? realpathSync(
      dirname(createRequire(resolve(hostNuxt, 'package.json')).resolve('vue-router/package.json')),
    )
  : null

rmSync(candidateRoot, { force: true, recursive: true })
mkdirSync(candidateRoot, { recursive: true })
const dependencies = {
  '@lupinum/ginko-content': `file:${content.archive}`,
  '@lupinum/ginko-editor': `file:${editor.archive}`,
  '@tiptap/core': '3.31.3',
  '@tiptap/pm': '3.31.3',
  '@tiptap/vue-3': '3.31.3',
  vue: `link:${hostVue}`,
  ...(docs
    ? {
        '@lupinum/ginko-docs': `file:${docs.archive}`,
        nuxt: `link:${hostNuxt}`,
        'vue-router': `link:${hostVueRouter}`,
      }
    : {}),
}
writeFileSync(
  resolve(candidateRoot, 'package.json'),
  JSON.stringify(
    { name: 'ginko-editor-local-candidate-consumer', private: true, dependencies },
    null,
    2,
  ),
)
writeFileSync(
  resolve(candidateRoot, 'pnpm-workspace.yaml'),
  'packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\nminimumReleaseAgeIgnoreMissingTime: false\n',
)
execFileSync(
  'pnpm',
  [
    'install',
    '--dir',
    candidateRoot,
    '--ignore-workspace',
    '--ignore-scripts',
    '--strict-peer-dependencies',
  ],
  { stdio: 'inherit' },
)

const packageNames = [
  '@lupinum/ginko-content',
  '@lupinum/ginko-editor',
  '@tiptap/core',
  '@tiptap/pm',
  '@tiptap/vue-3',
  ...(docs ? ['@lupinum/ginko-docs'] : []),
]
for (const linkRoot of linkRoots) {
  for (const packageName of packageNames) {
    const source = realpathSync(resolve(candidateRoot, 'node_modules', packageName))
    const destination = resolve(linkRoot, 'node_modules', packageName)
    rmSync(destination, { force: true, recursive: true })
    mkdirSync(dirname(destination), { recursive: true })
    symlinkSync(relative(dirname(destination), source), destination, 'dir')
  }
}

const editorRoot = realpathSync(resolve(candidateRoot, 'node_modules/@lupinum/ginko-editor'))
for (const packageName of [
  '@lupinum/ginko-content',
  '@tiptap/core',
  '@tiptap/pm',
  '@tiptap/vue-3',
  'vue',
]) {
  const source = realpathSync(resolve(candidateRoot, 'node_modules', packageName))
  const destination = resolve(editorRoot, 'node_modules', packageName)
  rmSync(destination, { force: true, recursive: true })
  mkdirSync(dirname(destination), { recursive: true })
  symlinkSync(relative(dirname(destination), source), destination, 'dir')
}
const identities = {}
for (const packageName of [
  '@lupinum/ginko-content',
  '@tiptap/core',
  '@tiptap/pm',
  '@tiptap/vue-3',
  'vue',
]) {
  const consumerPath = realpathSync(resolve(candidateRoot, 'node_modules', packageName))
  const editorPath = realpathSync(resolve(editorRoot, 'node_modules', packageName))
  if (consumerPath !== editorPath) {
    throw new Error(`${packageName} does not have one physical Editor peer identity.`)
  }
  identities[packageName] = consumerPath
}
if (docs) {
  const docsRoot = realpathSync(resolve(candidateRoot, 'node_modules/@lupinum/ginko-docs'))
  const docsContentLink = resolve(docsRoot, 'node_modules/@lupinum/ginko-content')
  rmSync(docsContentLink, { force: true, recursive: true })
  mkdirSync(dirname(docsContentLink), { recursive: true })
  symlinkSync(
    relative(
      dirname(docsContentLink),
      realpathSync(resolve(candidateRoot, 'node_modules/@lupinum/ginko-content')),
    ),
    docsContentLink,
    'dir',
  )
  const docsContent = realpathSync(resolve(docsRoot, 'node_modules/@lupinum/ginko-content'))
  if (docsContent !== identities['@lupinum/ginko-content']) {
    throw new Error('@lupinum/ginko-docs does not share the Content candidate identity.')
  }
}

const evidence = {
  schemaVersion: 1,
  releaseManifestsContainNoLocalSpecifiers: true,
  packages: Object.fromEntries(
    [editor, content, docs]
      .filter(Boolean)
      .map((entry) => [entry.name, { version: entry.version, sha256: entry.sha256 }]),
  ),
  peerIdentity: identities,
}
writeFileSync(resolve(candidateRoot, 'evidence.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify(evidence, null, 2))
